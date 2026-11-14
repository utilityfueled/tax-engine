// Spec: spec/federal/cod-bankruptcy-source-admission.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax, parseInput } from '@/index.js';
import { calculateForm1099C } from '@/engine/forms/form-1099-c.js';
import { getConstants } from '@/models/constants.js';
import { qualifiedPersonalBankruptcyInput as qualified } from '../fixtures/cod-bankruptcy.js';

const taxpayer = { taxYear: 2025, filingStatus: 'single', primary: {
  firstName: 'Fictional', lastName: 'Filer', ssn: '000-00-0001', dateOfBirth: '1985-01-01',
}, address: { street: '100 Example St', city: 'Philadelphia', state: 'PA', zip: '19101' }, dependents: [] };
function rawClaim(amount = '50000', code: string | undefined = 'A') {
  return { taxpayer, form1099C: [{ creditor: 'Fictional Bank', amountDischarged: amount,
    interestIncluded: '0', personallyLiable: true, identifiableEventCode: code, fmvOfProperty: '0' }],
    codExclusion: { bankruptcy: true } };
}
it('requires complete original sources for every affirmative public bankruptcy claim', () => {
  for (const code of ['A', 'G', undefined]) {
    const input = parseInput(rawClaim('50000', code));
    expect(input.form982NolSources).toBeUndefined();
    expect(() => calculateFederalTax(input), `unknown chapter/court/history, code${String(code)}`).toThrow();
  }
  for (const raw of [rawClaim('0'), { ...rawClaim(), form1099C: [] }]) {
    expect(() => calculateFederalTax(parseInput(raw))).toThrow();
  }
});
it('preserves fully sourced non-estate bankruptcy results and rejects source removal', () => {
  for (const chapter of ['12', '13'] as const) {
    const input = qualified(chapter), before = JSON.stringify(input), result = calculateFederalTax(parseInput(input));
    expect(result.schedule1?.cancelledDebtIncome.toFixed()).toBe('0');
    expect(result.codNolReduction?.sourceExcludedAmount.toFixed()).toBe('50000');
    expect(result.carryforwards.nolCarryforward.toFixed()).toBe('0');
    expect(result.carryforwards.capitalLoss.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
    const missing = { ...input, form982NolSources: undefined, form982AttributeSources: undefined, netOperatingLoss: undefined };
    expect(() => calculateFederalTax(parseInput(missing))).toThrow();
    const unknownHistory = qualified(chapter);
    if (!unknownHistory.form982NolSources.title11Source) throw new Error('Missing fictional court source');
    unknownHistory.form982NolSources.title11Source.caseNeverChapter7Or11Confirmed = undefined;
    expect(() => calculateFederalTax(parseInput(unknownHistory))).toThrow();
  }
});
it('requires actual sources for other claimed exclusions and basis-first elections', () => {
  const claims = [
    { insolvency: { totalLiabilities: '100000', totalAssets: '0' }, electBasisReductionFirst: true },
    { qualifiedPrincipalResidence: { dischargedAmount: '50000' } },
    { qualifiedFarmExclusion: '50000' },
    { qualifiedRealPropertyBusinessExclusion: '50000' },
    { qualifiedPrincipalResidence: { dischargedAmount: '-1' } },
    { qualifiedFarmExclusion: '-1' },
    { qualifiedRealPropertyBusinessExclusion: '-1' },
  ];
  for (const codExclusion of claims) {
    expect(() => calculateFederalTax(parseInput({ ...rawClaim(), codExclusion })), JSON.stringify(codExclusion)).toThrow();
  }
  // Supplying a real but incompatible packet must not turn unsupported special
  // debt or an election into an allowed original-source method.
  for (const codExclusion of claims.slice(0, 4)) {
    const input = qualified('13'); input.codExclusion = { ...input.codExclusion, ...codExclusion };
    expect(() => calculateFederalTax(parseInput(input))).toThrow();
  }
});
it('keeps ordinary taxable debt and explicit low-level arithmetic unchanged', () => {
  for (const codExclusion of [undefined, { bankruptcy: false, electBasisReductionFirst: false },
    { qualifiedFarmExclusion: '0' }, { qualifiedRealPropertyBusinessExclusion: '0' },
    { qualifiedPrincipalResidence: { dischargedAmount: '0' } },
    { insolvency: { totalLiabilities: '0', totalAssets: '0' } }]) {
    const result = calculateFederalTax(parseInput({ ...rawClaim(), codExclusion }));
    expect(result.schedule1?.cancelledDebtIncome.toFixed()).toBe('50000');
  }
  const input = parseInput(rawClaim());
  const standalone = calculateForm1099C(input.form1099C, input.codExclusion, input.taxpayer.filingStatus, getConstants(2025));
  expect(standalone.bankruptcyExclusion.toFixed()).toBe('50000');
  expect(standalone.taxableCodIncome.toFixed()).toBe('0');
});
