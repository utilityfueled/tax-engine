// Spec: spec/federal/foreign-tax-state-allocation.yaml.
import { describe, expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateForeignTaxDeductionCarryover, type ForeignTaxHypotheticalContext } from '@/engine/forms/foreign-tax-deduction-carryover.js';
import { d } from '@/utils/decimal.js';
import { carryFixture, stateAllocationFacts } from '../../fixtures/foreign-tax-carryover.js';

function source() {
  const base = carryFixture();
  const election = base.foreignTaxElection, facts = election?.deductionYearCarryover;
  if (!election || !facts?.incomeSources?.[0]) throw new Error('Missing source fixture');
  const first = facts.incomeSources[0];
  const state = { stateCode: 'NY', deductibleAmount: '6000', stateTaxableIncome: '90000', foreignIncomeSpecificallyExempt: false,
    sourceReference: 'Actual completed state-source worksheet', countryIncomeConfirmed: true,
    countryIncome: [
      { foreignCountry: 'Canada', stateTaxableIncome: '12000.01', sourceReference: 'Actual Canadian income taxed by state' },
      { foreignCountry: 'France', stateTaxableIncome: '2999.99', sourceReference: 'Actual French income taxed by state' },
    ] };
  const raw = { ...base, form1099Int: [
    { ...base.form1099Int[0], interestIncome: '15000' },
    { ...base.form1099Int[0], interestIncome: '10000', foreignTaxPaid: '0', foreignCountry: 'France', accountReference: 'Actual second account' },
  ], foreignTaxElection: { ...election, deductionYearCarryover: { ...facts,
    incomeSources: [{ ...first, reportedIncome: '15000', foreignIncome: '15000' },
      { ...first, sourceId: 'form1099Int:1', reportedIncome: '10000', foreignIncome: '10000', foreignCountry: 'France', accountReference: 'Actual second account' }],
    itemizedAllocation: { sourceFactsConfirmed: true, sourceReference: 'Actual allowed state-tax source', incomeOrSalesTaxes: '6000', homeRealPropertyTaxes: '0', personalPropertyTaxes: '0', stateAllocation:stateAllocationFacts(),stateIncomeTaxes: [state] },
  } } };
  const context: ForeignTaxHypotheticalContext = { taxYear: 2025, filingStatus: 'single', totalIncome: d('100000'), agi: d('100000'),
    totalDeductions: d('6000'), seniorDeduction: d('0'), deductionUsed: 'itemized', deductionAmount: d('6000'), incomeTax: d('15000'), ordinaryIncomeOnly: true,
    scheduleA: { medical: d('0'), incomeOrSalesTaxes: d('6000'), realPropertyTaxes: d('0'), personalPropertyTaxes: d('0'), saltDeduction: d('6000'), salesTaxElected: false,
      mortgageInterest: d('0'), investmentInterest: d('0'), charitableContributions: d('0'), otherDeductions: d('0'), itemizedReduction: d('0') } };
  return { raw, state, context };
}

const compute = (raw: unknown, context: ForeignTaxHypotheticalContext) => calculateForeignTaxDeductionCarryover(TaxYearInputSchema.parse(raw), context);
describe('Actual foreign state-tax allocation', () => {
  it('uses the pre-state taxable residual after actual U.S. charitable deductions', () => {
    const { raw, context } = source();
    context.scheduleA.charitableContributions = d('10000');
    context.deductionAmount = d('16000'); context.totalDeductions = d('16000');
    Object.assign(raw.foreignTaxElection.deductionYearCarryover.itemizedAllocation, { noTreatyCharitableDeductionConfirmed: true });
    const countries = raw.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes[0].countryIncome;
    countries[0].stateTaxableIncome = '15000'; countries[1].stateTaxableIncome = '10000';
    // Reg1.861-8(e)(6)(ii)(C): federal taxable income BEFORE state tax is
    // 100000-16000+6000=90000. Charity is U.S.-source: U.S.65000,foreign25000.
    // State90000 therefore taxes all25000foreign, not gross-based15000.
    const before = JSON.stringify(raw), result = compute(raw, context);
    expect(result.lines.find(row => row.line === 'state-us-taxable-before-deduction')?.value.toFixed()).toBe('65000');
    expect(result.lines.find(row => row.line === 'state-worldwide-before-deduction')?.value.toFixed()).toBe('90000');
    expect(result.lines.find(row => row.line === 'country-1:state-tax')?.value.toFixed()).toBe('1000');
    expect(result.lines.find(row => row.line === 'country-2:state-tax')?.value.toFixed()).toBe('667');
    expect(result.netForeignTaxableIncome.toFixed()).toBe('23333');
    // round4(23333/84000)=.2778;15000*.2778=4167.
    expect(result.hypotheticalLimitation.toFixed()).toBe('4167');
    // Section151 senior deduction is not allocated to either source under
    // Reg1.861-8(e)(11); final1116line18 explicitly adds it back.
    const withSenior = compute(raw, { ...context, totalDeductions: d('22000'), seniorDeduction: d('6000') });
    expect(withSenior.lines.find(row => row.line === 'state-us-taxable-before-deduction')?.value.toFixed()).toBe('65000');
    expect(withSenior.netForeignTaxableIncome.toFixed()).toBe('23333');
    expect(JSON.stringify(raw)).toBe(before);
  });
  it('rejects state bases that only reconcile to gross income', () => {
    const { raw, context } = source();
    context.scheduleA.charitableContributions = d('20000');
    context.deductionAmount = d('26000'); context.totalDeductions = d('26000');
    Object.assign(raw.foreignTaxElection.deductionYearCarryover.itemizedAllocation, { noTreatyCharitableDeductionConfirmed: true });
    // The previous canonical fixture treated U.S.gross75000 as taxable despite
    // actual U.S.charity20000. Pre-state worldwide80000 cannot support state90000
    // under this narrow presumption; keep its actual difference unresolved.
    const before = JSON.stringify(raw);
    expect(() => compute(raw, context)).toThrow(/state.*(?:source|taxable|income)/i);
    expect(JSON.stringify(raw)).toBe(before);
    const state = raw.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes[0];
    state.stateTaxableIncome = '60000'; state.foreignIncomeSpecificallyExempt = true;
    state.countryIncome.forEach(country => { country.stateTaxableIncome = '0'; });
    // Known exempt-state60000 still exceeds the actual U.S.residual55000.
    expect(() => compute(raw, context)).toThrow(/state.*(?:source|taxable|income)/i);
    // A separate source case has75000foreign and25000U.S.income, with actual
    // allowed60000 cash charity. Its negative U.S.residual needs a loss method.
    context.scheduleA.charitableContributions = d('60000');
    context.deductionAmount = d('66000'); context.totalDeductions = d('66000');
    for (const [index, income] of [[0, '50000'], [1, '25000']] as const) {
      raw.form1099Int[index].interestIncome = income;
      Object.assign(raw.foreignTaxElection.deductionYearCarryover.incomeSources[index], { reportedIncome: income, foreignIncome: income });
    }
    expect(() => compute(raw, context)).toThrow(/loss.*source|source.*loss/i);
  });
  it('allocates actual country sources without a gross-income guess', () => {
    const { raw, context } = source();
    const before = JSON.stringify(raw), result = compute(raw, context);
    // Pub514 state base90000-US75000=15000. Actual12000.01/2999.99
    // gives800.000666... and199.999333..., printed800/200, not600/400.
    expect(result.lines.find(row => row.line === 'country-1:net-income')?.inputs.direct.toString()).toBe('800');
    expect(result.lines.find(row => row.line === 'country-2:net-income')?.inputs.direct.toString()).toBe('200');
    expect(result.netForeignTaxableIncome.toFixed()).toBe('24000');
    // round4(24000/94000)=.2553;15000*.2553=3829.5=>3830.
    expect(result.hypotheticalLimitation.toFixed()).toBe('3830');
    const audit = JSON.stringify(result.lines);
    expect(audit).not.toContain('Actual Canadian income taxed by state');
    expect(audit).not.toContain('Canada');
    expect(JSON.stringify(raw)).toBe(before);
  });
  it('preserves known exempt zeros and source order without inventing country facts', () => {
    const { raw, context } = source();
    const reversed = structuredClone(raw);
    reversed.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes[0].countryIncome.reverse();
    expect(compute(reversed, context).hypotheticalLimitation.toFixed()).toBe('3830');
    const state = raw.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes[0];
    state.foreignIncomeSpecificallyExempt = true; state.stateTaxableIncome = '75000';
    state.countryIncome.forEach(country => { country.stateTaxableIncome = '0'; });
    const result = compute(raw, context);
    expect(result.netForeignTaxableIncome.toFixed()).toBe('25000');
    expect(result.lines.filter(row => row.line.endsWith(':net-income')).every(row => row.inputs.direct.isZero())).toBe(true);
    const missing = structuredClone(raw);
    const unknownState: Record<string, unknown> = missing.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes[0];
    delete unknownState.countryIncomeConfirmed; delete unknownState.countryIncome;
    const parsed = TaxYearInputSchema.parse(missing);
    expect(parsed.foreignTaxElection?.deductionYearCarryover?.itemizedAllocation?.stateIncomeTaxes?.[0].countryIncome).toBeUndefined();
    expect(parsed.foreignTaxElection?.deductionYearCarryover?.itemizedAllocation?.stateIncomeTaxes?.[0].countryIncomeConfirmed).toBeUndefined();
  });
  it('rejects unknown duplicate stale and conflicting country facts', () => {
    const { raw, state, context } = source();
    for (const change of [
      { countryIncomeConfirmed: undefined }, { countryIncomeConfirmed: false },
      { countryIncome: undefined }, { countryIncome: state.countryIncome.slice(0, 1) },
      { countryIncome: [state.countryIncome[0], state.countryIncome[0]] },
      { countryIncome: [{ ...state.countryIncome[0], foreignCountry: 'Japan' }, state.countryIncome[1]] },
      { countryIncome: [{ ...state.countryIncome[0], stateTaxableIncome: '12001' }, state.countryIncome[1]] },
      { countryIncome: [{ ...state.countryIncome[0], stateTaxableIncome: '16000' }, { ...state.countryIncome[1], stateTaxableIncome: '0' }] },
      { countryIncome: [{ ...state.countryIncome[0], stateTaxableIncome: undefined }, state.countryIncome[1]] },
      { countryIncome: [{ ...state.countryIncome[0], sourceReference: '' }, state.countryIncome[1]] },
      { countryIncome: [{ ...state.countryIncome[0], stateTaxableIncome: '-1' }, state.countryIncome[1]] },
      { foreignIncomeSpecificallyExempt: true },
    ]) {
      const changed = structuredClone(raw);
      Object.assign(changed.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes[0], change);
      expect(() => compute(changed, context)).toThrow(/state|country|source|income/i);
    }
  });
  it('rejects multiple-state presumptions without source attribution', () => {
    const { raw, context } = source();
    const changed = structuredClone(raw);
    changed.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes = [
      { stateCode: 'NY', deductibleAmount: '3000', stateTaxableIncome: '45000', foreignIncomeSpecificallyExempt: false, sourceReference: 'Actual NY return' },
      { stateCode: 'CA', deductibleAmount: '3000', stateTaxableIncome: '45000', foreignIncomeSpecificallyExempt: false, sourceReference: 'Actual CA return' },
    ] as typeof changed.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes;
    expect(() => compute(changed, context)).toThrow(/state.*country|country.*source/i);
  });
});
