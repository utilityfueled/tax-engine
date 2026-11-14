// Spec: spec/federal/form-2555-all-foreign-capital-loss.yaml.
import Decimal from 'decimal.js';
import { expect, it, vi } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { resolveForm2555Sources } from '@/engine/forms/form-2555-source-binding.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { allForeignCapitalLossFixture } from '../../fixtures/form-2555-all-foreign-capital-loss.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';
import { calculateVerifiedAiAudit, resolveServerAiTaxContext } from '@/lib/ai-tax-context';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';
import { assertPdfExportAllowed } from '@/pdf/export-policy.js';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator.js';
import { calculatePANonresidentReturn } from '@/engine/state/pa-nonresident-orchestrator.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';

vi.mock('server-only', () => ({}));
function present<T,>(value: T | undefined): T { if (value === undefined) throw new Error('Missing fictional source'); return value; }
function source(raw: ReturnType<typeof allForeignCapitalLossFixture>) { return present(raw.form2555.sourceMapping.rows[0]); }
function run(raw = allForeignCapitalLossFixture()) { return calculateFederalTax(TaxYearInputSchema.parse(raw)); }

it('matches the actual printed Publication54 loss worksheet', () => {
  const raw = allForeignCapitalLossFixture(), before = JSON.stringify(raw), result = run(raw);
  // Printed52.74%*172000=90712.8 ->90713. Exact77000/146000*172000 rounds90712, a distinct method.
  expect(new Decimal('77000').div('146000').times('172000').toDecimalPlaces(0).toFixed()).toBe('90712');
  expect(result.form2555?.netExclusion.toFixed()).toBe('-13713');
  expect(present(result.form2555?.lines.find(line => line.line === '44')).value.toFixed()).toBe('90713');
  expect(result.agi.toFixed()).toBe('-12287'); expect(result.selfEmploymentTax.toFixed()).toBe('0');
  expect(present(result.allLines.find(line => line.form === '1040' && line.line === '13')).value.toFixed()).toBe('0');
  expect(JSON.stringify(raw)).toBe(before);
});

it('preserves current signed loss and zero foreign QBI once', () => {
  for (const [gross, expenses, allowance, percentage, deduction, expected] of [
    ['100000', '125000', '10000', '10', '12500', '-22500'],
    ['200000', '240000', '25000', '12.5', '30000', '-35000'],
  ]) {
    const raw = allForeignCapitalLossFixture(), row = source(raw), facts = row.allForeignCapitalLoss;
    raw.scheduleC.grossReceipts = row.businessGrossReceipts = facts.grossIncome = present(gross);
    raw.scheduleC.expenses.supplies = row.foreignBusinessExpenses = facts.currentBusinessExpenses = present(expenses);
    raw.form2555.foreignEarnedIncome = raw.form2555.partIV.businessPersonalServices
      = raw.form2555.incomeSources.foreignBusinessIncomeAlreadyReported = row.foreignEarnedIncome
      = row.reasonableServicesAllowance = facts.reasonableServicesAllowance = present(allowance);
    facts.allocationPercentage = present(percentage); raw.form2555.deductionsAllocableToExcludedIncome
      = facts.allocatedDeductions = present(deduction);
    const result = run(raw);
    expect(result.agi.toFixed()).toBe(expected); expect(result.selfEmploymentTax.toFixed()).toBe('0');
    expect(present(result.allLines.find(line => line.form === '1040' && line.line === '13')).value.toFixed()).toBe('0');
    expect(result.form172).toBeUndefined();
  }
});

it('rejects absent false changed and excluded loss originals', () => {
  const mutations: ((raw: ReturnType<typeof allForeignCapitalLossFixture>) => void)[] = [
    raw => { Object.assign(source(raw).allForeignCapitalLoss, { taxYear: 2024 }); },
    raw => { source(raw).allForeignCapitalLoss.businessName = 'Edited source'; },
    raw => { source(raw).allForeignCapitalLoss.businessIncomeSourceReference = 'Different original'; },
    raw => { source(raw).allForeignCapitalLoss.expenseSourceReference = 'Different book'; },
    raw => { source(raw).allForeignCapitalLoss.currentBusinessExpenses = '171999.99'; },
    raw => { source(raw).allForeignCapitalLoss.allocationPercentage = '52.73'; },
    raw => { source(raw).allForeignCapitalLoss.allocatedDeductions = raw.form2555.deductionsAllocableToExcludedIncome = '90712'; },
    raw => { Object.assign(source(raw).allForeignCapitalLoss, { allocationMethod: 'exact_ratio' }); },
    raw => { source(raw).allForeignCapitalLoss.actualValidExclusionElectionConfirmed = false; },
    raw => { source(raw).allForeignCapitalLoss.noForeignEciOrRecharacterizationConfirmed = false; },
    raw => { source(raw).allForeignCapitalLoss.businessWithholding = '1'; },
    raw => { source(raw).allForeignCapitalLoss.priorQbiLoss = '1'; },
    raw => { source(raw).allForeignCapitalLoss.retirementContributions = '1'; },
    raw => { raw.scheduleC.allInvestmentAtRisk = false; },
    raw => { raw.scheduleC.w2WagesPaid = '1'; },
    raw => { raw.scheduleC.ubiaQualifiedProperty = '1'; },
    raw => { raw.form2555.electionsValidConfirmed = false; },
    raw => { raw.form2555.sourceMapping.rows.push(structuredClone(source(raw))); },
    raw => { Object.assign(raw, { adjustments: { seRetirementContributions: '1' } }); },
    raw => { Object.assign(raw, { priorYear: { qbiLossCarryforward: '1' } }); },
    raw => { Object.assign(raw, { w2s: structuredClone(simpleW2Fixture.w2s) }); },
    raw => { Object.assign(source(raw).allForeignCapitalLoss, { inventedRoundingElection: true }); },
    raw => { source(raw).allBusinessIncomeForeignConfirmed = false; },
    raw => { source(raw).capitalMaterialIncomeFactor = false; },
    raw => { source(raw).sourceId = 'foreignEmployment:wrong'; },
    raw => { source(raw).priorYearIncomeReceived = '1'; },
    raw => { raw.scheduleC.accountingMethod = 'accrual'; },
    raw => { raw.scheduleC.qbiMateriallyParticipated = false; },
    raw => { Object.assign(raw.scheduleC.expenses, { businessInterest: '1' }); },
  ];
  for (const [index, mutate] of mutations.entries()) { const raw = allForeignCapitalLossFixture(); mutate(raw); expect(() => run(raw), `source mutation ${index}`).toThrow(); }
  const facts = source(allForeignCapitalLossFixture()).allForeignCapitalLoss;
  for (const key of Object.keys(facts)) {
    const raw = allForeignCapitalLossFixture(); Reflect.deleteProperty(source(raw).allForeignCapitalLoss, key); expect(() => run(raw)).toThrow();
    if (Reflect.get(facts, key) === true) {
      const denied = allForeignCapitalLossFixture(); Reflect.set(source(denied).allForeignCapitalLoss, key, false); expect(() => run(denied)).toThrow();
    }
  }
});

it('does not bypass zero profit mixed sources or material loss boundaries', () => {
  for (const expenses of ['146000', '145999.99', '302500.01']) {
    const raw = allForeignCapitalLossFixture(), row = source(raw);
    raw.scheduleC.expenses.supplies = row.foreignBusinessExpenses = row.allForeignCapitalLoss.currentBusinessExpenses = expenses;
    expect(() => run(raw)).toThrow();
  }
  const unbound = allForeignCapitalLossFixture(); Reflect.deleteProperty(source(unbound), 'allForeignCapitalLoss');
  expect(() => run(unbound)).toThrow(/foreign loss method/i);
  const noGross = allForeignCapitalLossFixture(), zero = source(noGross);
  noGross.scheduleC.grossReceipts = zero.businessGrossReceipts = zero.allForeignCapitalLoss.grossIncome = '0';
  expect(() => run(noGross)).toThrow();
  const edge = allForeignCapitalLossFixture(), row = source(edge);
  edge.scheduleC.expenses.supplies = row.foreignBusinessExpenses = row.allForeignCapitalLoss.currentBusinessExpenses = '302500';
  edge.form2555.deductionsAllocableToExcludedIncome = row.allForeignCapitalLoss.allocatedDeductions = '159539';
  // Actual raw loss156500 is exactly half the2025 single Form461 threshold. Printed52.74% yields159538.5->159539.
  expect(run(edge).agi.toFixed()).toBe('-73961');
});

it('denies unqualified state composition at real public adapters', () => {
  const input = TaxYearInputSchema.parse(allForeignCapitalLossFixture()), federal = calculateFederalTax(input);
  const admitted: string[] = [];
  for (const [index, proof] of [present(input.form2555?.sourceMapping?.rows[0]?.allForeignCapitalLoss), false, null].entries()) {
    const original = structuredClone(input); Reflect.set(present(original.form2555?.sourceMapping?.rows[0]), 'allForeignCapitalLoss', proof);
    const paths = [
      ['PA resident', () => calculatePAReturn(original)],
      ['PA nonresident', () => calculatePANonresidentReturn(original, { residencyStatus: 'nonresident' })],
      ['Ohio', () => buildOhioResidentReturnInput(original, federal)],
    ] as const;
    for (const [name, call] of paths) {
      try { call(); admitted.push(`${name} proof${index}`); }
      catch (error) { expect(error instanceof Error ? error.message : '').toMatch(/(?:Pennsylvania|Ohio).*all-foreign capital loss.*separate state/i); }
    }
  }
  expect(admitted).toEqual([]);
  const older = TaxYearInputSchema.parse(simpleW2Fixture), previous = calculateFederalTax(older);
  expect(() => calculatePAReturn(older)).not.toThrow();
  expect(() => calculatePANonresidentReturn(older, { residencyStatus: 'nonresident' })).not.toThrow();
  expect(() => buildOhioResidentReturnInput(older, previous)).not.toThrow();
});

it('keeps loss originals private and annual export gates closed', () => {
  const raw = allForeignCapitalLossFixture(), input = TaxYearInputSchema.parse(raw), before = JSON.stringify(input);
  const scope = { ownerScope: 'synthetic-foreign-loss-owner', workspaceId: 'synthetic-foreign-loss-return', workspaceRevision: 'synthetic-foreign-loss-revision' };
  const verified = calculateVerifiedAiAudit(scope, input);
  const context = resolveServerAiTaxContext({ ...scope, taxYear: 2025, audit: verified });
  expect(context.status).toBe('available');
  const workspace = Object.assign(createWorkspaceRecord(scope.workspaceId), { form2555: input.form2555 });
  const hosted = sanitizeWorkspaceForHostedStorage(workspace);
  const provider = buildProviderWorkspaceRequest(workspace, { now: '2026-11-14T00:00:00.000Z' });
  const text = JSON.stringify({ context, hosted, provider, audit: verified });
  for (const secret of ['allForeignCapitalLoss', 'allocationWorksheetReference', 'priorBusinessExpenses',
    ...Object.values(source(raw).allForeignCapitalLoss).filter(value => typeof value === 'string' && value.startsWith('Fictional'))])
    expect(text).not.toContain(secret);
  expect(JSON.stringify(input)).toBe(before);
  const next = allForeignCapitalLossFixture(2026);
  expect(resolveForm2555Sources(TaxYearInputSchema.parse(next)).sourceFactsVerified).toBe(true);
  expect(() => run(next)).toThrow(/2026.*incomplete/i);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified/);
});
