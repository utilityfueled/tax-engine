// Spec: spec/federal/cod-empty-nol-foreign.yaml.
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateNetOperatingLoss } from '@/engine/forms/net-operating-loss.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { codEmptyNolForeignInput } from '../fixtures/cod-empty-nol-foreign.js';
import { actualNolInput } from '../fixtures/net-operating-loss.js';

it('composes ordinary credit with complete empty loss sources and actual independent carries', () => {
  const input = codEmptyNolForeignInput('ordinary'), original = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe('50000');
  expect(result.ordinaryTax.toFixed()).toBe('3875');
  expect(result.foreignTaxCredit.toFixed()).toBe('388');
  expect(result.totalTax.toFixed()).toBe('3487');
  expect(result.foreignTaxOrdinaryCredit?.regular.carryforward.toFixed()).toBe('212');
  expect(result.foreignTaxOrdinaryCredit?.amt.carryforward.toFixed()).toBe('400');
  expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('112');
  expect(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.map(row => [row.taxYear, row.amount.toFixed()]))
    .toEqual([[2024, '200'], [2025, '100']]);
  expect(JSON.stringify(input)).toBe(original);
});

it('derives separate deduction-year absorption without granting either current credit', () => {
  const input = codEmptyNolForeignInput(), original = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.totalTax.toFixed()).toBe('13455');
  expect(result.foreignTaxCredit.toFixed()).toBe('0');
  expect(result.amt.toFixed()).toBe('0');
  expect(result.foreignTaxDeductionCarryover?.hypotheticalLimitation.toFixed()).toBe('673');
  expect(result.foreignTaxDeductionCarryover?.absorbed.toFixed()).toBe('573');
  expect(result.foreignTaxDeductionCarryover?.carryforward.toFixed()).toBe('427');
  expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('327');
  expect(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.[0]?.amount.toFixed()).toBe('145');
  expect(result.codAttributeReduction?.regular.records[0]?.currentUse.toFixed()).toBe('0');
  expect(result.codAttributeReduction?.regular.records[0]?.beforeReduction.toFixed()).toBe('427');
  expect(result.codAttributeReduction?.alternativeTax.records[0]?.beforeReduction.toFixed()).toBe('245');
  expect(JSON.stringify(input)).toBe(original);
});

it('uses the actual simplified election without copying the regular carry', () => {
  const input = codEmptyNolForeignInput();
  const source = input.foreignTaxElection!.deductionYearCarryover! as unknown as { amt: { simplifiedElectionMadeInFirstClaimYear: boolean } };
  source.amt.simplifiedElectionMadeInFirstClaimYear = true;
  const result = calculateFederalTax(input);
  expect(result.totalTax.toFixed()).toBe('13455');
  expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('327');
  expect(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.[0]?.amount.toFixed()).toBe('170');
});

it('preserves a complete empty alternative inventory without inventing election facts', () => {
  const input = codEmptyNolForeignInput();
  Object.assign(input.foreignTaxElection!.deductionYearCarryover!, { amt: {
    sourceTaxYear: 2025, sourceFactsConfirmed: true, sourceReference: 'Actual fictional complete empty AMT history',
    adjustedThroughTaxYear: 2024, carryoverHistoryConfirmed: true, carryovers: [],
  } });
  input.form982AttributeSources!.alternativeTax!.records = [];
  const result = calculateFederalTax(input);
  expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('327');
  expect(Object.values(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory ?? {}).flat()).toEqual([]);
  expect(result.codAttributeReduction?.alternativeTax.records).toEqual([]);
});

it('keeps final-year expiry separate from derived absorption and credit reduction', () => {
  const input = codEmptyNolForeignInput(), carry = input.foreignTaxElection!.deductionYearCarryover!;
  carry.carryovers![0]!.originTaxYear = 2015;
  const amt = (carry as unknown as { amt: { carryovers: Array<{ originTaxYear: number }>; firstPost1997CreditClaimTaxYear: number } }).amt;
  amt.carryovers[0]!.originTaxYear = 2015; amt.firstPost1997CreditClaimTaxYear = 2014;
  for (const [kind, expired] of [['regular', '427'], ['alternativeTax', '245']] as const) {
    const row = input.form982AttributeSources![kind]!.records![0]!;
    row.originTaxYear = 2015; row.currentYearExpired = expired;
    row.history = Array.from({ length: 9 }, (_, index) => ({ taxYear: 2016 + index, used: '0', reduced: '0', expired: '0', sourceReference: `Actual fictional ${2016 + index} filed ${kind} carry` }));
  }
  const result = calculateFederalTax(input);
  expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('0');
  expect(result.codAttributeReduction?.regular.records[0]?.attributeReduction.toFixed()).toBe('100');
  expect(result.codAttributeReduction?.regular.records[0]?.expiredAfterReduction.toFixed()).toBe('327');
  expect(result.codAttributeReduction?.alternativeTax.records[0]?.expiredAfterReduction.toFixed()).toBe('145');
});

it('rejects missing changed and nonempty original loss or alternative foreign sources', () => {
  for (const mutate of [
    (x: ReturnType<typeof codEmptyNolForeignInput>) => { x.netOperatingLoss!.alternativeTax = undefined; },
    (x: ReturnType<typeof codEmptyNolForeignInput>) => { x.netOperatingLoss!.primaryTaxpayerIdLast4 = '0000'; },
    (x: ReturnType<typeof codEmptyNolForeignInput>) => { x.netOperatingLoss = actualNolInput('100000').netOperatingLoss; },
    (x: ReturnType<typeof codEmptyNolForeignInput>) => { delete (x.foreignTaxElection!.deductionYearCarryover! as unknown as { amt?: unknown }).amt; },
    (x: ReturnType<typeof codEmptyNolForeignInput>) => { x.foreignTaxElection!.deductionYearCarryover!.noForeignOrDomesticLossAccountsConfirmed = false; },
  ]) {
    const input = codEmptyNolForeignInput(); mutate(input);
    expect(() => calculateFederalTax(input)).toThrow(/source|history|foreign|NOL|owner|taxpayer/i);
  }
});

it('rejects false actual use and altered originals instead of hiding hypothetical absorption', () => {
  for (const change of [{ currentYearUse: '573' }, { originalAmount: '999' }]) {
    const input = codEmptyNolForeignInput(); Object.assign(input.form982AttributeSources!.regular!.records![0]!, change);
    expect(() => calculateFederalTax(input)).toThrow(/COD.*foreign|COD.*absorption|COD.*reconcile/i);
  }
});

it('retains exact credit thirds after independent hypothetical absorption', () => {
  const input = codEmptyNolForeignInput();
  input.form1099C[0]!.amountDischarged = '1';
  input.form982NolSources!.debts![0]!.amountDischarged = '1';
  input.form982NolSources!.insolvency!.liabilities![0]!.amount = '1';
  input.codExclusion!.insolvency!.totalLiabilities = '1';
  const result = calculateFederalTax(input), row = result.codAttributeReduction!.regular.records[0]!;
  expect(result.totalTax.toFixed()).toBe('13455');
  expect(row.incomeApplied.toFixed()).toBe('1');
  expect(row.reductionRatio.amount.toFixed()).toBe('1');
  expect(row.reductionRatio.denominator.toFixed()).toBe('3');
  expect(result.carryforwards.foreignTaxCreditCarryforward.toDecimalPlaces(6).toFixed()).toBe('426.666667');
  expect(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.[0]?.amount.toDecimalPlaces(6).toFixed()).toBe('244.666667');
  // Independent Python Decimal100 quotient rounded once to the established40-digit boundary.
  expect(row.attributeReduction.toFixed()).toBe('0.3333333333333333333333333333333333333333');
});

it('rejects conflicting saved AMT carry history even when the annual list is explicitly empty', () => {
  for (const empty of [false, true]) {
    const input = TaxYearInputSchema.parse({ ...codEmptyNolForeignInput(), priorYear: {
      amtForeignTaxCreditCarryforwardByCategory: { passive: [{ taxYear: 2024, amount: '301' }] },
    } });
    if (empty) {
      input.foreignTaxElection!.deductionYearCarryover!.amt!.carryovers = [];
      input.form982AttributeSources!.alternativeTax!.records = [];
    }
    expect(() => calculateFederalTax(input)).toThrow(/AMT.*saved|AMT.*history.*reconcile|saved.*AMT/i);
  }
});

it('accepts matching saved AMT sources without changing current credit or original inputs', () => {
  const input = TaxYearInputSchema.parse({ ...codEmptyNolForeignInput(), priorYear: {
    amtForeignTaxCreditCarryforwardByCategory: { passive: [{ taxYear: 2024, amount: '300' }] },
  } });
  const original = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.foreignTaxCredit.toFixed()).toBe('0');
  expect(result.totalTax.toFixed()).toBe('13455');
  expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('327');
  expect(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.[0]?.amount.toFixed()).toBe('145');
  expect(JSON.stringify(input)).toBe(original);
  delete input.foreignTaxElection!.deductionYearCarryover!.amt;
  expect(() => calculateFederalTax(input)).toThrow(/AMT.*carry|AMT.*history/i);
});

it('keeps exhausted and expired original NOL histories outside the empty-source method', () => {
  for (const expired of [false, true]) {
    const input = codEmptyNolForeignInput();
    const facts = actualNolInput('100000').netOperatingLoss!, row = facts.vintages![0]!;
    if (expired) Object.assign(row, { lossTaxYear: 2004, carrybackTreatment: 'waived', carrybackSourceReference: 'Actual filed ordinary carryback waiver' });
    else Object.assign(row, { openingCarryforward: '0', history: [{ taxYear: 2022, nolUsed: '100000', attributeReduction: '0', sourceReference: 'Actual filed full prior use' }] });
    input.netOperatingLoss = facts;
    const source = calculateNetOperatingLoss({ taxYear: 2025, filingStatus: 'single', taxpayer: input.taxpayer, facts });
    expect(source.availableCarryforward.toFixed()).toBe('0');
    expect(() => calculateFederalTax(input)).toThrow(/NOL.*deduction-year|empty.*NOL|NOL.*hypothetical/i);
  }
});
