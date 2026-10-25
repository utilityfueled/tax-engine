// Spec: spec/state/digital-asset-sources.yaml.
import { expect, it } from 'vitest';
import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { normalizeDigitalAssetCapitalInput } from '@/engine/forms/digital-asset-capital-input.js';
import { calculateDigitalAssetStateSources } from '@/engine/state/digital-asset-sources.js';
import { calculateOhioScheduleOfWithholding } from '@/engine/state/oh-schedule-of-withholding.js';
import { d } from '@/utils/decimal.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';
import { actualDigitalAssetSource } from '../../fixtures/digital-asset-sources.js';

function source(state = 'PA', owner = 'primary', id = 'Original DA1', withholding = '0.10', paBasis = '80.24') {
  const original = structuredClone(actualDigitalAssetSource);
  return { ...original, sourceId: id, accountHolder: owner, stateTaxReporting: 'single', state, stateWithheld: withholding,
    transactions: original.transactions.map(row => ({ ...row, paCostBasis: paBasis, paBasisSourceReference: 'Actual PA purchase and adjustment ledger', paBasisFactsConfirmed: true, paTransactionForProfitConfirmed: true })) };
}
function input(sources: ReturnType<typeof source>[] = [source()]): TaxYearInput {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099DA: sources,
    w2s: simpleW2Fixture.w2s.map(row => ({ ...row, accountHolder: 'primary', state: 'PA', stateWages: '85000', stateTaxWithheld: '0', box12CodeD: '0', box12CodeE: '0', box12CodeF: '0', box12CodeG: '0', box12CodeH: '0', box12CodeS: '0', box12CodeAA: '0', box12CodeBB: '0', box12CodeEE: '0' })) });
}
it('uses actual Pennsylvania digital basis without changing federal sources', () => {
  const actual = input(), before = JSON.stringify(actual), federal = calculateFederalTax(actual), result = calculatePAReturn(actual);
  expect(federal.capitalGainLoss.toFixed()).toBe('10.25');
  const transaction = calculateDigitalAssetStateSources(actual, 'PA').form1099B[0].transactions[0];
  expect(transaction.costBasis).toBe('80.24');
  expect(d(transaction.proceeds).minus(transaction.costBasis).toFixed()).toBe('20.25');
  // PA-40 IN page 4 requires whole-dollar amounts on the return and schedules.
  expect(result.mappedIncome.netGainOrLoss.toFixed()).toBe('20');
  expect(result.scheduleD.digitalAssetQuestionYes).toBe(true); expect(result.stateWithholding.toFixed()).toBe('0.1');
  expect(JSON.stringify(actual)).toBe(before); expect(calculateFederalTax(actual).agi.eq(federal.agi)).toBe(true);
});
it('routes original Ohio digital withholding once without adding another gain', () => {
  const second = source('PA', 'primary', 'Original DA2', '0.20'); second.transactions[0].costBasis = second.transactions[0].proceeds;
  const actual = input([source('OH'), second]), federal = calculateFederalTax(actual);
  const ohio = buildOhioResidentReturnInput(actual, federal);
  expect(federal.capitalGainLoss.toFixed()).toBe('10.25'); expect(ohio.federalAgi.eq(federal.agi)).toBe(true);
  expect(ohio.ohioWithholding.toFixed()).toBe('0.1');
  const audit = calculateOhioScheduleOfWithholding({ form1099Bs: calculateDigitalAssetStateSources(actual, 'OH').form1099B });
  expect(audit.line5e_1099BOhioWithholding.toFixed()).toBe('0');
  expect(audit.line5g_1099DAOhioWithholding.toFixed()).toBe('0.1');
  expect(audit.line6_totalOhioWithholding.toFixed()).toBe('0.1');
  expect(actual.form1099B).toEqual([]); expect(actual.form1099DA).toHaveLength(2);
});
it('rejects incomplete state digital sources and unsupported adjustment methods', () => {
  for (const patch of [{ paCostBasis: undefined }, { paBasisSourceReference: '' }, { paBasisFactsConfirmed: false }, { paTransactionForProfitConfirmed: undefined }, { washSale: true }]) {
    const row = source(); Object.assign(row.transactions[0], patch);
    expect(() => calculatePAReturn(input([row]))).toThrow(/PA|Pennsylvania|source|basis|method/i);
  }
  const actual = input(), federal = calculateFederalTax(actual);
  for (const patch of [{ federalWithheld: undefined }, { taxYear: 2024 }, { accountHolder: 'spouse' }, { sourceFactsConfirmed: false }]) {
    const incomplete = input(); Object.assign(incomplete.form1099DA[0], patch);
    expect(() => calculatePAReturn(incomplete)).toThrow(); expect(() => buildOhioResidentReturnInput(incomplete, federal)).toThrow();
  }
  expect(() => calculatePAReturn(input([source(), source()]))).toThrow(/duplicate|source/i);
  const copied = normalizeDigitalAssetCapitalInput(actual);
  expect(() => calculatePAReturn(copied)).toThrow(/original|source/i); expect(() => buildOhioResidentReturnInput(copied, federal)).toThrow(/original|source/i);
});
it('preserves separate Pennsylvania owners and actual zero basis', () => {
  const actual = input([source('PA', 'primary', 'Primary DA', '0.10', '0'), source('PA', 'spouse', 'Spouse DA', '0.20', '200.49')]);
  actual.taxpayer.filingStatus = 'married_filing_jointly';
  actual.taxpayer.spouse = { firstName: 'Alex', lastName: 'Doe', ssn: '987-65-4321', dateOfBirth: '1991-01-01' };
  const result = calculatePAReturn(actual);
  const sourceRows = calculateDigitalAssetStateSources(actual, 'PA').form1099B;
  expect(sourceRows.map(row => d(row.transactions[0].proceeds).minus(row.transactions[0].costBasis).toFixed())).toEqual(['100.49', '-100']);
  expect(sourceRows[0].transactions[0].costBasis).toBe('0');
  expect(result.scheduleD.taxpayerLine12.toFixed()).toBe('100'); expect(result.scheduleD.spouseLine12.toFixed()).toBe('-100');
  expect(result.mappedIncome.netGainOrLoss.toFixed()).toBe('100'); expect(result.stateWithholding.toFixed()).toBe('0.3');
});
