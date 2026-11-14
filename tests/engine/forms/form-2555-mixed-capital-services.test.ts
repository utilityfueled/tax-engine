// Spec: spec/federal/form-2555-mixed-capital-services.yaml. All originals are fictional.
import { expect, it, vi } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { resolveForm2555Sources } from '@/engine/forms/form-2555-source-binding.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { mixedCapitalServicesFixture } from '../../fixtures/form-2555-mixed-capital-services.js';
import { calculateVerifiedAiAudit, resolveServerAiTaxContext } from '@/lib/ai-tax-context';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';
import { assertPdfExportAllowed } from '@/pdf/export-policy.js';

vi.mock('server-only', () => ({}));
function present<T,>(value: T | undefined): T { if (value === undefined) throw new Error('Missing synthetic original'); return value; }
function source(raw: ReturnType<typeof mixedCapitalServicesFixture>) { return present(raw.form2555.sourceMapping.rows[0]); }
function run(raw = mixedCapitalServicesFixture()) { return calculateFederalTax(TaxYearInputSchema.parse(raw)); }

it('binds original location separated capital service receipts', () => {
  const raw = mixedCapitalServicesFixture(), before = JSON.stringify(raw);
  const share = present(resolveForm2555Sources(TaxYearInputSchema.parse(raw)).scheduleCForeignShare[0]);
  expect(share.foreign.toFixed()).toBe('120000'); expect(share.grossIncome.toFixed()).toBe('200000');
  expect(share.earned.toFixed()).toBe('10000'); expect(share.capitalMaterialEarned?.toFixed()).toBe('20000');
  expect(share.foreignBusinessExpenses?.toFixed()).toBe('70000');
  expect(JSON.stringify(raw)).toBe(before);
});
it('caps the aggregate domestic and foreign allowance without allocation', () => {
  const excessive = mixedCapitalServicesFixture(); source(excessive).mixedCapitalServices.domesticReasonableServicesAllowance = '20000';
  expect(() => run(excessive)).toThrow(/30 percent limit/i);
  const edge = mixedCapitalServicesFixture(); source(edge).mixedCapitalServices.domesticReasonableServicesAllowance = '17880.50';
  expect(run(edge).form2555?.foreignEarnedIncome.toFixed()).toBe('10000');
  source(edge).mixedCapitalServices.domesticReasonableServicesAllowance = '17880.51';
  expect(() => run(edge)).toThrow(/30 percent limit/i);
});
it('preserves actual foreign expenses domestic profit and income once', () => {
  const result = run();
  // Actual SE rounds separate11451.40 Social Security and2678.15 Medicare lines to11451+2678=14129; half rounds7065.
  // Actual foreign SE deduction3532.5 plus70000*10000/120000=9365.833..., line44=9366.
  expect(result.selfEmploymentTax.toFixed()).toBe('14129');
  expect(result.form2555?.netExclusion.toFixed()).toBe('634');
  expect(result.agi.toFixed()).toBe('92301');
  // Domestic QBI50000 minus its SE deduction3532.5; existing line rounding produces9294.
  expect(present(result.allLines.find(row => row.form === '1040' && row.line === '13')).value.toFixed()).toBe('9294');
  const low = mixedCapitalServicesFixture(); low.form2555.deductionsAllocableToExcludedIncome = '9365';
  expect(() => run(low)).toThrow(/at least 9366/i);
});
it('rejects unknown changed and excluded mixed business sources', () => {
  const modifications: ((raw: ReturnType<typeof mixedCapitalServicesFixture>) => void)[] = [
    raw => { source(raw).mixedCapitalServices.taxYear = 2024; },
    raw => { source(raw).mixedCapitalServices.accountHolder = 'spouse'; },
    raw => { source(raw).mixedCapitalServices.businessName = 'Another original'; },
    raw => { source(raw).mixedCapitalServices.businessEin = '98-7654321'; },
    raw => { source(raw).mixedCapitalServices.foreignGrossIncome = '120000.01'; },
    raw => { source(raw).mixedCapitalServices.domesticBusinessExpenses = '29999.99'; },
    raw => { source(raw).mixedCapitalServices.domesticBusinessExpenses = '30000.01'; },
    raw => { source(raw).mixedCapitalServices.foreignBusinessExpenses = '69999'; },
    raw => { source(raw).mixedCapitalServices.foreignReasonableServicesAllowance = '9999'; },
    raw => { source(raw).mixedCapitalServices.domesticReasonableServicesAllowance = '80001'; },
    raw => { source(raw).mixedCapitalServices.unallocatedBusinessExpenses = '0.01'; },
    raw => { source(raw).mixedCapitalServices.foreignServiceSourceReference = ''; },
    raw => { source(raw).mixedCapitalServices.noForeignEciOrRecharacterizationConfirmed = false; },
    raw => { source(raw).mixedCapitalServices.allExpensesDirectlyAttributedConfirmed = false; },
    raw => { source(raw).priorYearIncomeReceived = '1'; },
    raw => { raw.scheduleC.costOfGoodsSold = source(raw).businessCostOfGoodsSold = '1'; },
    raw => { raw.scheduleC.otherIncome = source(raw).businessOtherIncome = '1'; },
    raw => { source(raw).allBusinessIncomeForeignConfirmed = true; },
    raw => { source(raw).capitalMaterialIncomeFactor = false; },
    raw => { source(raw).sourceId = 'formW2:0'; },
    raw => { raw.scheduleC.businessName = 'Edited actual business'; },
    raw => { raw.scheduleC.grossReceipts = source(raw).businessGrossReceipts = '200000.01'; },
    raw => { raw.scheduleC.expenses.supplies = '99999.99'; },
    raw => { source(raw).mixedCapitalServices.foreignGrossIncome = '60000'; source(raw).mixedCapitalServices.domesticGrossIncome = '140000'; },
    raw => { source(raw).mixedCapitalServices.foreignBusinessExpenses = source(raw).foreignBusinessExpenses = '19000'; source(raw).mixedCapitalServices.domesticBusinessExpenses = '81000'; },
    raw => { raw.form2555.sourceMapping.rows.push(structuredClone(source(raw))); },
    raw => { Object.assign(raw.scheduleC, { w2WagesPaid: '1' }); },
    raw => { Object.assign(raw.scheduleC, { ubiaQualifiedProperty: '1' }); },
    raw => { Object.assign(source(raw).mixedCapitalServices, { inventedAllocationRatio: '.6' }); },
  ];
  for (const mutate of modifications) { const raw = mixedCapitalServicesFixture(); mutate(raw); expect(() => run(raw)).toThrow(); }
  for (const key of Object.keys(source(mixedCapitalServicesFixture()).mixedCapitalServices)) {
    const raw = mixedCapitalServicesFixture(); Reflect.deleteProperty(source(raw).mixedCapitalServices, key);
    expect(() => run(raw), `missing ${key}`).toThrow();
    const falseFlag = mixedCapitalServicesFixture();
    if (Reflect.get(source(falseFlag).mixedCapitalServices, key) === true) {
      Reflect.set(source(falseFlag).mixedCapitalServices, key, false);
      expect(() => run(falseFlag), `false ${key}`).toThrow();
    }
  }
  for (const key of ['foreignGrossIncome', 'domesticGrossIncome', 'foreignBusinessExpenses', 'domesticBusinessExpenses',
    'unallocatedBusinessExpenses', 'foreignReasonableServicesAllowance', 'domesticReasonableServicesAllowance',
    'businessW2WagesPaid', 'businessUbiaQualifiedProperty']) {
    for (const unknown of ['', 'NaN', 'Infinity', '-0.01', '.5']) {
      const raw = mixedCapitalServicesFixture(); Reflect.set(source(raw).mixedCapitalServices, key, unknown);
      expect(() => run(raw), `${key}:${unknown}`).toThrow();
    }
  }
});
it('preserves explicit zero allowance and expense sources', () => {
  const zeroAllowance = mixedCapitalServicesFixture(), row = source(zeroAllowance);
  zeroAllowance.form2555.foreignEarnedIncome = zeroAllowance.form2555.partIV.businessPersonalServices
    = zeroAllowance.form2555.incomeSources.foreignBusinessIncomeAlreadyReported = row.foreignEarnedIncome
    = row.reasonableServicesAllowance = row.mixedCapitalServices.foreignReasonableServicesAllowance = '0';
  zeroAllowance.form2555.deductionsAllocableToExcludedIncome = '0';
  expect(run(zeroAllowance).form2555?.netExclusion.toFixed()).toBe('0');
  const zeroExpenses = mixedCapitalServicesFixture(), noExpenseRow = source(zeroExpenses);
  zeroExpenses.scheduleC.expenses.supplies = noExpenseRow.foreignBusinessExpenses
    = noExpenseRow.mixedCapitalServices.foreignBusinessExpenses = noExpenseRow.mixedCapitalServices.domesticBusinessExpenses = '0';
  //2025 SS21836+Medicare5356=27192, half13596, actual foreign share .6 =>8157.6, line44 rounds8158.
  zeroExpenses.form2555.deductionsAllocableToExcludedIncome = '8158';
  expect(run(zeroExpenses).form2555?.netExclusion.toFixed()).toBe('1842');
});
it('preserves source privacy and annual readiness boundaries', () => {
  const raw = mixedCapitalServicesFixture(), input = TaxYearInputSchema.parse(raw), before = JSON.stringify(input);
  const scope = { ownerScope: 'synthetic-mixed-owner', workspaceId: 'synthetic-mixed-return', workspaceRevision: 'synthetic-mixed-revision' };
  const audit = calculateVerifiedAiAudit(scope, input), context = resolveServerAiTaxContext({ ...scope, taxYear: 2025, audit });
  expect(context.status).toBe('available');
  const workspace = Object.assign(createWorkspaceRecord(scope.workspaceId, { now: '2026-11-14T00:00:00.000Z' }), { form2555: input.form2555 });
  const packet = source(raw).mixedCapitalServices;
  for (const payload of [audit, context, sanitizeWorkspaceForHostedStorage(workspace), buildProviderWorkspaceRequest(workspace, { now: '2026-11-14T00:00:00.000Z' })])
    for (const marker of ['mixedCapitalServices', 'foreignGrossIncome', 'domesticGrossIncome', 'domesticReasonableServicesAllowance',
      packet.businessName, packet.businessEin, packet.businessEin.replace(/-/g, ''), packet.sourceReference, packet.foreignServiceSourceReference,
      packet.domesticServiceSourceReference, packet.foreignExpenseSourceReference, packet.domesticExpenseSourceReference, packet.allowanceSourceReference])
      expect(JSON.stringify(payload)).not.toContain(marker);
  expect(JSON.stringify(input)).toBe(before);
  const next = mixedCapitalServicesFixture(2026);
  expect(resolveForm2555Sources(TaxYearInputSchema.parse(next)).sourceFactsVerified).toBe(true);
  expect(() => run(next)).toThrow(/2026.*incomplete/i);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified/u);
});
it('rejects an edited original business document reference', () => {
  const raw = mixedCapitalServicesFixture(); source(raw).sourceReference = 'Another actual original document';
  expect(() => run(raw)).toThrow(/source reference/i);
});
it('rejects wage and property allocation when foreign business profit is zero', () => {
  const zeroProfit = mixedCapitalServicesFixture(), row = source(zeroProfit);
  zeroProfit.scheduleC.expenses.supplies = row.foreignBusinessExpenses = row.mixedCapitalServices.foreignBusinessExpenses = '120000';
  row.mixedCapitalServices.domesticBusinessExpenses = '0'; zeroProfit.form2555.deductionsAllocableToExcludedIncome = '10000';
  expect(run(zeroProfit).form2555?.netExclusion.toFixed()).toBe('0');
  const admitted: string[] = [];
  for (const key of ['w2WagesPaid', 'ubiaQualifiedProperty']) {
    const changed = structuredClone(zeroProfit); Object.assign(changed.scheduleC, { [key]: '1' });
    try { run(changed); admitted.push(key); }
    catch (error) { expect(error instanceof Error ? error.message : '').toMatch(/W2 wages and UBIA/i); }
  }
  expect(admitted).toEqual([]);
  for (const key of ['businessW2WagesPaid', 'businessUbiaQualifiedProperty']) {
    for (const unknown of [undefined, false, '1']) {
      const changed = structuredClone(zeroProfit);
      if (unknown === undefined) Reflect.deleteProperty(source(changed).mixedCapitalServices, key);
      else Reflect.set(source(changed).mixedCapitalServices, key, unknown);
      expect(() => run(changed)).toThrow();
    }
  }
});
