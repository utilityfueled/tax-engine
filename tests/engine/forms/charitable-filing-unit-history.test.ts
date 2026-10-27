// Spec: spec/federal/charitable-filing-unit-history.yaml.
import { expect, it } from 'vitest';
import { validateCharitableCarryoverSources } from '@/engine/forms/charitable-carryover-source-validation.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateCharitableCarryover } from '@/engine/forms/charitable-carryover.js';
import { d } from '@/utils/decimal.js';
import { calculateDeterminedCharitableNol } from '@/engine/forms/charitable-determined-nol.js';
import { validatePriorCharitableNolHistories } from '@/utils/charitable-prior-nol-source.js';
import { charitableNolOriginsInput } from '../../fixtures/charitable-nol-origins.js';
import { charitableFilingUnitFixture, recurrentCharitableFilingUnitFixture, remarriedCharitableFilingUnitFixture, separateOriginalPoolFixture } from '../../fixtures/charitable-filing-unit-history.js';

it('derives the published first-separate-year allocation from original excesses', () => {
  const input = charitableFilingUnitFixture(), before = JSON.stringify(input);
  expect(validateCharitableCarryoverSources(input).map(row => row.amount.toString())).toEqual(['6000']);
  expect(JSON.stringify(input)).toBe(before);
});

it('preserves separate use before a later joint return without changing original years', () => {
  const input = charitableFilingUnitFixture(), sources = input.charitableCarryoverSources!;
  const timeline = sources.filingUnitHistory!, vintage = sources.vintages![0];
  input.taxpayer.taxYear = 2026; input.taxpayer.filingStatus = 'married_filing_jointly';
  input.taxpayer.spouse = { firstName: 'Alex', lastName: 'Roe', ssn: '987-65-4321', dateOfBirth: '1980-01-01' };
  sources.sourceTaxYear = 2026; sources.spouseName = 'Alex Roe'; sources.spouseTaxpayerIdLast4 = '4321';
  timeline.currentReturnSourceId = 'joint-2026';
  timeline.returns!.push({ sourceId: 'alex-2025', taxYear: 2025, filingStatus: 'single', primaryPersonId: 'alex', sourceReference: 'Synthetic Alex return' },
    { sourceId: 'joint-2026', taxYear: 2026, filingStatus: 'married_filing_jointly', primaryPersonId: 'jane', spousePersonId: 'alex', sourceReference: 'Synthetic joint return' });
  vintage.adjustedThroughTaxYear = 2025; vintage.openingCarryforward = '7000';
  vintage.history!.push({ taxYear: 2025, treatedAsPaid: '3000', nolReduction: '0', sourceReference: 'Synthetic separate use', filingUnitUses: [
    { returnSourceId: 'jane-2025', treatedAsPaid: '2000', nolReduction: '0', sourceReference: 'Synthetic Jane use' },
    { returnSourceId: 'alex-2025', treatedAsPaid: '1000', nolReduction: '0', sourceReference: 'Synthetic Alex use' },
  ] });
  expect(validateCharitableCarryoverSources(input).map(row => [row.taxYear, row.amount.toString()])).toEqual([[2022, '7000']]);
  timeline.returns!.reverse(); timeline.persons!.reverse(); vintage.history!.reverse();
  vintage.filingUnitOrigin!.separateComputations!.reverse();
  expect(validateCharitableCarryoverSources(input)[0].amount.toString()).toBe('7000');
});

it('preserves unknown zero and false timeline facts during schema parsing', () => {
  const input = charitableFilingUnitFixture();
  const parsed = TaxYearInputSchema.parse(input);
  expect(parsed.charitableCarryoverSources?.membershipUnchangedConfirmed).toBe(false);
  expect(parsed.charitableCarryoverSources?.filingUnitHistory?.persons?.[0].deathYear).toBeUndefined();
  expect(parsed.charitableCarryoverSources?.vintages?.[0].filingUnitOrigin?.separateComputations?.[0].originNolReduction).toBe('0');
  expect(TaxYearInputSchema.parse({ ...input, charitableCarryoverSources: { returnMembership: 'changed_filing_unit', filingUnitHistory: { sourceFactsConfirmed: false } } }).charitableCarryoverSources?.filingUnitHistory)
    .toEqual({ sourceFactsConfirmed: false });
});

it('aggregates actual remarried same-vintage sources once and retains their provenance', () => {
  const input = remarriedCharitableFilingUnitFixture();
  const opening = validateCharitableCarryoverSources(input);
  expect(opening).toHaveLength(1); expect(opening[0].amount.toString()).toBe('8000');
  expect(opening[0].filingUnitSources?.map(row => row.sourceId)).toEqual(['casey-property', 'original-joint-property']);
  const result = calculateCharitableCarryover(input, { contributionBase: d(10000), itemizes: true,
    current: { cashPublic: d(0), noncashPublic: d(0), capitalGainPublic: d(0), cashPrivate: d(0), noncashPrivate: d(0), capitalGainPrivate: d(0) } });
  expect(result.priorTreatedAsPaid.toString()).toBe('5000');
  expect(result.carryforwards.map(row => row.amount.toString())).toEqual(['3000']);
  expect(result.detail).toHaveLength(1);
});

it('retains the actual death-year joint balance and excludes the deceased share afterward', () => {
  const input = charitableFilingUnitFixture(), sources = input.charitableCarryoverSources!, timeline = sources.filingUnitHistory!, vintage = sources.vintages![0];
  timeline.persons![1].deathStatus = 'deceased'; timeline.persons![1].deathYear = 2024;
  vintage.filingUnitOrigin!.separateComputations![0].originalExcess = '8000';
  vintage.filingUnitOrigin!.separateComputations![1].originalExcess = '12000';
  vintage.openingCarryforward = '4000';
  const result = validateCharitableCarryoverSources(input);
  expect(result[0].amount.toString()).toBe('4000');
  expect(result[0].filingUnitSources?.[0].excludedBalance).toEqual({ numerator: '6000', denominator: '1' });
  // Shift all source years forward: the actual joint death-year return retains the pool.
  timeline.persons![1].deathYear = 2025; timeline.returns!.forEach(row => { row.taxYear!++; });
  vintage.contributionYear!++; vintage.history!.forEach(row => { row.taxYear!++; });
  vintage.history = vintage.history!.filter(row => row.taxYear! < 2025);
  timeline.returns = timeline.returns!.filter(row => row.taxYear! <= 2025);
  timeline.currentReturnSourceId = 'joint-2024'; vintage.openingCarryforward = '17000';
  input.taxpayer.filingStatus = 'married_filing_jointly';
  input.taxpayer.spouse = { firstName: 'Alex', lastName: 'Roe', ssn: '987-65-4321', dateOfBirth: '1980-01-01' };
  sources.spouseName = 'Alex Roe'; sources.spouseTaxpayerIdLast4 = '4321';
  input.standardDeductionFacts!.spouseDeathDate = '2025-06-01';
  expect(validateCharitableCarryoverSources(input)[0].amount.toString()).toBe('17000');
});

it('retains exact allocation ratios and aggregates before downstream conversion', () => {
  const input = recurrentCharitableFilingUnitFixture('0'), sources = input.charitableCarryoverSources!, vintage = sources.vintages![0];
  vintage.originalExcess = '1'; vintage.filingUnitOrigin!.separateComputations![0].originalExcess = '1';
  vintage.filingUnitOrigin!.separateComputations![1].originalExcess = '2';
  vintage.history!.forEach(entry => { entry.treatedAsPaid = '0'; entry.filingUnitUses!.forEach(row => { row.treatedAsPaid = '0'; }); });
  const result = validateCharitableCarryoverSources(input);
  expect(result[0].filingUnitSources?.[0].openingBalance).toEqual({ numerator: '1', denominator: '3' });
  expect(result[0].amount.toString()).toBe('0.33333333333333333333');
  input.taxpayer.filingStatus = 'married_filing_jointly';
  input.taxpayer.spouse = { firstName: 'Alex', lastName: 'Roe', ssn: '987-65-4321', dateOfBirth: '1980-01-01' };
  sources.spouseName = 'Alex Roe'; sources.spouseTaxpayerIdLast4 = '4321';
  sources.filingUnitHistory!.returns!.at(-1)!.filingStatus = 'married_filing_jointly';
  sources.filingUnitHistory!.returns!.at(-1)!.spousePersonId = 'alex';
  expect(validateCharitableCarryoverSources(input)[0].amount.toString()).toBe('1');
});

it('rejects missing conflicting or excessive actual history without changing originals', () => {
  const empty = charitableFilingUnitFixture(); empty.charitableCarryoverSources!.vintages = [];
  expect(validateCharitableCarryoverSources(empty)).toEqual([]);
  empty.charitableCarryoverSources!.filingUnitHistory!.sourceFactsConfirmed = undefined;
  expect(() => validateCharitableCarryoverSources(empty)).toThrow(/actual|confirmed|history/i);
  const mutations: Array<(input: ReturnType<typeof charitableFilingUnitFixture>) => void> = [
    input => { input.charitableCarryoverSources!.filingUnitHistory!.returns!.splice(1, 1); },
    input => { input.charitableCarryoverSources!.filingUnitHistory!.persons![1].deathStatus = undefined; },
    input => { input.charitableCarryoverSources!.filingUnitHistory!.persons![0].taxpayerIdLast4 = '0000'; },
    input => { input.charitableCarryoverSources!.filingUnitHistory!.returns!.at(-1)!.filingStatus = 'married_filing_separately'; },
    input => { input.charitableCarryoverSources!.filingUnitHistory!.persons!.push(structuredClone(input.charitableCarryoverSources!.filingUnitHistory!.persons![0])); },
    input => { input.charitableCarryoverSources!.vintages![0].history![0].filingUnitUses![0].treatedAsPaid = undefined; },
    input => { input.charitableCarryoverSources!.vintages![0].history![0].filingUnitUses![0].treatedAsPaid = '3000.01'; },
    input => { input.charitableCarryoverSources!.vintages![0].openingCarryforward = '6000.01'; },
  ];
  for (const mutate of mutations) {
    const input = charitableFilingUnitFixture(); mutate(input); const original = JSON.stringify(input);
    expect(() => validateCharitableCarryoverSources(input)).toThrow(/charitable|filing|history/i);
    expect(JSON.stringify(input)).toBe(original);
  }
});

it('distinguishes determined reunited pools from recurrent partial-use attribution', () => {
  expect(() => validateCharitableCarryoverSources(recurrentCharitableFilingUnitFixture())).toThrow(/partial.*joint|attribution/i);
  expect(validateCharitableCarryoverSources(recurrentCharitableFilingUnitFixture('0'))[0].amount.toString()).toBe('4000');
  expect(validateCharitableCarryoverSources(recurrentCharitableFilingUnitFixture('7000'))[0].amount.toString()).toBe('0');
  const input = recurrentCharitableFilingUnitFixture(), sources = input.charitableCarryoverSources!;
  input.taxpayer.filingStatus = 'married_filing_jointly';
  input.taxpayer.spouse = { firstName: 'Alex', lastName: 'Roe', ssn: '987-65-4321', dateOfBirth: '1980-01-01' };
  sources.spouseName = 'Alex Roe'; sources.spouseTaxpayerIdLast4 = '4321';
  sources.filingUnitHistory!.returns!.at(-1)!.filingStatus = 'married_filing_jointly';
  sources.filingUnitHistory!.returns!.at(-1)!.spousePersonId = 'alex';
  expect(validateCharitableCarryoverSources(input)[0].amount.toString()).toBe('4000');
});

it('preserves the multiple-original NOL boundary behind a joint category pool', () => {
  const input = remarriedCharitableFilingUnitFixture();
  input.netOperatingLoss = charitableNolOriginsInput().netOperatingLoss;
  const history = input.netOperatingLoss!.alternativeTax!.charitableCarryoverHistory!;
  history.priorRegularCarryovers = undefined; history.priorAlternativeCarryovers = undefined;
  history.alternativeCarryoverSources = structuredClone(input.charitableCarryoverSources!);
  history.alternativeCarryoverSources.vintages = [];
  const params = { input, ledger: 'regular' as const, normalContributionBase: d(10000), normalDeductionUsed: 'itemized' as const, nolCarryforward: d(10000) };
  const unchanged = calculateDeterminedCharitableNol({ ...params, computeCarryover: () => d(10000) });
  expect(unchanged.carryforward.toString()).toBe('3000');
  expect(() => calculateDeterminedCharitableNol({ ...params, computeCarryover: () => d(9999) })).toThrow(/multiple.*original|attribution/i);
  expect(() => validatePriorCharitableNolHistories(input)).toThrow(/one original|mixed attribution/i);
});

it('reconciles known current owner death facts without inventing unknown dates', () => {
  const input = charitableFilingUnitFixture();
  input.standardDeductionFacts!.primaryDeathDate = '2025-03-10';
  expect(() => validateCharitableCarryoverSources(input)).toThrow(/death.*(actual|conflict)|actual.*death/i);
  const person = input.charitableCarryoverSources!.filingUnitHistory!.persons![0];
  person.deathStatus = 'deceased'; person.deathYear = 2025;
  input.charitableCarryoverSources!.filingUnitHistory!.returns!.at(-1)!.finalReturnForDeceased = true;
  expect(validateCharitableCarryoverSources(input)[0].amount.toString()).toBe('6000');
  input.standardDeductionFacts!.primaryDeathDate = null;
  expect(() => validateCharitableCarryoverSources(input)).toThrow(/death.*(actual|conflict)|actual.*death/i);
  input.standardDeductionFacts!.primaryDeathDate = undefined;
  expect(validateCharitableCarryoverSources(input)[0].amount.toString()).toBe('6000');
});

it('retains excluded original sources and rejects cross-record partial joint attribution', () => {
  const input = separateOriginalPoolFixture();
  const original = JSON.stringify(input), result = validateCharitableCarryoverSources(input);
  expect(result[0].amount.toString()).toBe('6000');
  expect(result[0].filingUnitSources!.find(row => row.sourceId === 'casey-property')!.excludedBalance).toEqual({ numerator: '2000', denominator: '1' });
  expect(JSON.stringify(input)).toBe(original);
  expect(() => validateCharitableCarryoverSources(separateOriginalPoolFixture('3000'))).toThrow(/partial.*joint|attribution/i);
  const full = separateOriginalPoolFixture('6000');
  full.charitableCarryoverSources!.vintages![1].history![1].treatedAsPaid = '2000';
  full.charitableCarryoverSources!.vintages![1].history![1].filingUnitUses![0].treatedAsPaid = '2000';
  expect(validateCharitableCarryoverSources(full)[0].amount.toString()).toBe('0');
});
