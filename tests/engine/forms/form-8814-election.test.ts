// Spec: spec/federal/form-8814-election.yaml.
import { expect, it, vi } from 'vitest';
import Decimal from 'decimal.js';
vi.mock('@/models/constants.js', async originalImport => {
  const original = await originalImport<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateForm8814Election } from '@/engine/forms/form-8814-election.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { Form8814ChildSchema, TaxYearInputSchema } from '@/models/inputs.js';
import { getConstants } from '@/models/constants.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { syntheticChildElection } from '../../fixtures/form-8814-election.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

function child(year = 2025) {
  return Form8814ChildSchema.parse({ taxableInterest: '4000', taxExemptInterest: '0', ordinaryDividends: '0', qualifiedDividends: '0', capitalGainDistributions: '0', electionFacts: syntheticChildElection(year) });
}
function check(source = child(), taxpayer = simpleW2Fixture.taxpayer) {
  return calculateForm8814Election([source], taxpayer, getConstants(taxpayer.taxYear), new Decimal('50000.01'));
}

it('requires actual election sources and preserves missing income boxes', () => {
  expect(check().eligibleChildCount).toBe(1);
  const missing = child(); missing.electionFacts = undefined;
  expect(() => check(missing)).toThrow(/election.*source/i);
  const wrongYear = child(); wrongYear.electionFacts!.taxYear = 2026;
  expect(() => check(wrongYear)).toThrow(/year/i);
  for (const field of ['taxableInterest', 'taxExemptInterest', 'ordinaryDividends', 'qualifiedDividends', 'capitalGainDistributions']) {
    const raw = { ...child() } as Record<string, unknown>; delete raw[field];
    const parsed = Form8814ChildSchema.safeParse(raw);
    if (parsed.success) expect(() => check(Form8814ChildSchema.parse(parsed.data))).toThrow(/actual.*income|incomplete/i);
    else expect(parsed.success).toBe(false);
  }
  const duplicate = child();
  expect(() => calculateForm8814Election([duplicate, duplicate], simpleW2Fixture.taxpayer, getConstants(2025))).toThrow(/duplicate/i);
  const actualDependent = { ...simpleW2Fixture.taxpayer, dependents: [{ ...simpleW2Fixture.taxpayer.primary, ...child().electionFacts!.child, relationship: 'child', monthsLivedWithYou: 12, qualifiesForCTC: false }] };
  expect(check(child(), actualDependent).eligibleChildCount).toBe(1);
  actualDependent.dependents[0]!.dateOfBirth = '2000-05-10';
  expect(() => check(child(), actualDependent)).toThrow(/identity|birth/i);
  const parentIdentity = child(); parentIdentity.electionFacts!.child.ssn = simpleW2Fixture.taxpayer.primary.ssn;
  expect(() => check(parentIdentity)).toThrow(/identity|parent/i);
});

it('checks January1 ages and five actual student months', () => {
  const current = child(); current.electionFacts!.child.dateOfBirth = '2007-01-02';
  expect(check(current).children[0]?.ageAtYearEnd).toBe(18);
  current.electionFacts!.child.dateOfBirth = '2007-01-01';
  expect(() => check(current)).toThrow(/student/i);
  current.electionFacts!.student = { program: 'school', fullTimeMonths: [1, 2, 3, 4, 5], sourceReference: 'Actual enrollment periods' };
  expect(check(current).children[0]?.ageAtYearEnd).toBe(19);
  current.electionFacts!.student.fullTimeMonths = [1, 2, 3, 4];
  expect(() => check(current)).toThrow(/five|student/i);
  current.electionFacts!.student.fullTimeMonths = [1, 2, 3, 4, 4];
  expect(() => check(current)).toThrow(/distinct|duplicate/i);
  current.electionFacts!.student.fullTimeMonths = [1, 3, 5, 7, 12];
  current.electionFacts!.student.program = 'online_only';
  expect(() => check(current)).toThrow(/student|program/i);
  current.electionFacts!.student.program = 'government_on_farm';
  expect(check(current).eligibleChildCount).toBe(1);
  current.electionFacts!.child.dateOfBirth = '2002-01-01';
  expect(() => check(current)).toThrow(/age|24/i);
  for (const date of ['2025-02-29', '2026-01-01', 'unknown']) {
    current.electionFacts!.child.dateOfBirth = date;
    expect(() => check(current)).toThrow(/birth|date/i);
  }
});

it('rejects known ineligible income returns and payments without silently dropping a child', () => {
  for (const value of ['0', '1350', '13500', '13500.01', '-1', 'NaN']) {
    const current = child(); current.taxableInterest = value;
    expect(() => check(current)).toThrow();
  }
  for (const value of ['1350.01', '13499.99']) {
    const current = child(); current.taxableInterest = value;
    expect(check(current).eligibleChildCount).toBe(1);
  }
  for (const field of ['otherGrossIncome', 'estimatedTaxPayments', 'priorYearOverpaymentApplied', 'federalIncomeTaxWithheld'] as const) {
    const current = child(); current.electionFacts![field] = '0.01'; expect(() => check(current)).toThrow(/income|payment|withhold/i);
  }
  const current = child(); current.qualifiedDividends = '1'; expect(() => check(current)).toThrow(/qualified/i);
  for (const patch of [{ electionRequested: false }, { childRequiredToFile: false }, { childFilesJointReturn: true }, { timelyElectionStatus: 'late' as const }, { sourceFactsConfirmed: false }]) {
    const current = child(); Object.assign(current.electionFacts!, patch); expect(() => check(current)).toThrow();
  }
});

it('selects the actual eligible parent and compares complete taxable-income worksheets', () => {
  const current = child(); const facts = current.electionFacts!;
  const taxpayer = structuredClone(simpleW2Fixture.taxpayer);
  facts.parentSituation = 'joint_with_other_parent'; expect(() => check(current, taxpayer)).toThrow(/joint/i);
  taxpayer.filingStatus = 'married_filing_jointly'; expect(() => check(current, taxpayer)).toThrow(/spouse/i);
  taxpayer.spouse = { ...taxpayer.primary, firstName: 'Other', ssn: '444-55-6666' };
  expect(check(current, taxpayer).eligibleChildCount).toBe(1);
  facts.electingTaxpayer = 'spouse'; expect(check(current, taxpayer).eligibleChildCount).toBe(1);
  taxpayer.filingStatus = 'married_filing_separately'; facts.electingTaxpayer = 'primary'; facts.parentSituation = 'married_separate';
  expect(() => check(current, taxpayer)).toThrow(/comparison|taxable/i);
  facts.parentIncomeComparison = { taxYear: 2025, returnTaxableIncomeWithoutChild: '50000.01', otherParentTaxableIncomeWithoutChild: '50000', returnSourceReference: 'Actual parent worksheet', otherParentSourceReference: 'Actual other-parent worksheet', excludesElectedChildIncomeConfirmed: true };
  expect(check(current, taxpayer).eligibleChildCount).toBe(1);
  facts.parentIncomeComparison.otherParentTaxableIncomeWithoutChild = '50000.01'; expect(() => check(current, taxpayer)).toThrow(/greater/i);
  facts.parentIncomeComparison.otherParentTaxableIncomeWithoutChild = '50000.02'; expect(() => check(current, taxpayer)).toThrow(/greater/i);
  facts.parentIncomeComparison.otherParentTaxableIncomeWithoutChild = '50000';
  facts.parentSituation = 'custodial_separate_stepparent'; facts.relationshipToChild = 'stepparent';
  expect(check(current, taxpayer).eligibleChildCount).toBe(1);
  facts.custodialParentConfirmed = false; expect(() => check(current, taxpayer)).toThrow(/custod/i);
  facts.parentSituation = 'surviving_separate_stepparent'; expect(check(current, taxpayer).eligibleChildCount).toBe(1);
  facts.relationshipToChild = 'parent'; facts.parentSituation = 'never_married_together_all_year'; taxpayer.filingStatus = 'single';
  expect(check(current, taxpayer).eligibleChildCount).toBe(1);
  facts.parentSituation = 'custodial_unmarried'; facts.custodialParentConfirmed = true;
  expect(check(current, taxpayer).eligibleChildCount).toBe(1);
  facts.electingTaxpayer = 'spouse'; expect(() => check(current, taxpayer)).toThrow(/spouse|joint/i);
  facts.electingTaxpayer = 'primary'; facts.parentSituation = 'custodial_considered_unmarried'; taxpayer.filingStatus = 'married_filing_separately';
  expect(() => check(current, taxpayer)).toThrow(/considered.*unmarried|7703/i);
  facts.consideredUnmarriedUnder7703Confirmed = true;
  expect(check(current, taxpayer).eligibleChildCount).toBe(1);
  taxpayer.filingStatus = 'head_of_household'; expect(check(current, taxpayer).eligibleChildCount).toBe(1);
});

it('checks canonical elections before income and AMT transfer in both years', () => {
  for (const year of [2025, 2026]) {
    const source = child(year);
    source.taxExemptInterest = '1000'; source.amtSources = { taxYear: year as 2025 | 2026, allStatementsConfirmed: true, otherwiseAllowableDeduction: '0', statements: [{ sourceId: 'actual-child-INT', form: '1099-INT', taxExemptInterest: '1000', specifiedPrivateActivityBondInterest: '500' }] };
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year }, form8814: [source] });
    const result = calculateFederalTax(input);
    expect(result.form8814?.totalOtherIncome.toFixed()).toBe('1300');
    expect(result.form8814?.totalTax.toFixed()).toBe('135');
    expect(result.allLines.find(line => line.form === 'Form 6251' && line.line === '2g')?.value.toFixed()).toBe('500');
    input.form8814![0]!.electionFacts!.estimatedTaxPayments = '1';
    expect(() => calculateFederalTax(input)).toThrow(/payment/i);
    input.form8814![0]!.electionFacts!.estimatedTaxPayments = '0'; input.form8814![0]!.taxableInterest = '14000';
    expect(() => calculateFederalTax(input)).toThrow(/income/i);
  }
});

it('keeps actual child identifiers out of audit and redacted review copies', () => {
  const original = child(); const snapshot = structuredClone(original);
  const checked = check(original); const review = redactReviewIdentifiers(original);
  expect(JSON.stringify(checked)).not.toContain(original.electionFacts!.child.ssn);
  expect(review.electionFacts?.child.ssn).toBe('');
  expect(original).toEqual(snapshot);
});

it('binds the parent comparison to canonical income and preserves PTC household sources', () => {
  const source = child(), facts = source.electionFacts!;
  facts.parentSituation = 'never_married_together_all_year';
  facts.parentIncomeComparison = { taxYear: 2025, returnTaxableIncomeWithoutChild: '100000', otherParentTaxableIncomeWithoutChild: '90000', returnSourceReference: 'Current parent actual worksheet', otherParentSourceReference: 'Other parent actual worksheet', excludesElectedChildIncomeConfirmed: true };
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, form8814: [source] });
  expect(calculateFederalTax(TaxYearInputSchema.parse(simpleW2Fixture)).taxableIncome.toFixed()).toBe('69250');
  expect(() => calculateFederalTax(input)).toThrow(/canonical.*parent|parent.*canonical|reconcile/i);
  input.form8814![0]!.electionFacts!.parentIncomeComparison!.returnTaxableIncomeWithoutChild = '69250';
  expect(() => calculateFederalTax(input)).toThrow(/greater/i);
  input.form8814![0]!.electionFacts!.parentIncomeComparison!.otherParentTaxableIncomeWithoutChild = '60000';
  expect(calculateFederalTax(input).form8814?.totalOtherIncome.toFixed()).toBe('1300');
  expect(() => calculateForm8814Election(input.form8814!, input.taxpayer, getConstants(2025))).toThrow(/canonical.*parent|parent.*canonical/i);
  const comparison = input.form8814![0]!.electionFacts!.parentIncomeComparison!;
  comparison.returnTaxableIncomeWithoutChild = '4250'; comparison.otherParentTaxableIncomeWithoutChild = '4000';
  input.w2s[0]!.wages = '20000';
  input.taxpayer.dependents = [{ ...facts.child, relationship: 'child', monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false }];
  const months = [{ month: 1, enrolleePremium: '500', slcsp: '700', advancePremiumTaxCredit: '0', coverageEligible: true, incomeBasedSepEnrollment: false }];
  input.form1095A = [{ taxYear: 2025, marketplace: 'Actual market', policyNumber: 'ACTUAL1', monthlyPremiums: months, sourceFactsComplete: true }];
  input.form8962 = { taxFamilySize: 2, fplRegion: 'contiguous', taxpayerModifiedAGI: '21300', requiredFilingDependentsModifiedAGI: '2700', householdFactsConfirmed: true, canBeClaimedAsDependent: false, belowPovertyException: 'none', coverageFactsConfirmed: true, allocationRequired: false, alternativeMarriageCalculationElected: false, selfEmployedHealthInsuranceCoordinationRequired: false, lawfulPresenceReconciliationRequired: false, qsehraAffected: false, monthlyReconciliation: months };
  const before = structuredClone(input);
  const result = calculateFederalTax(input);
  expect(result.form8962?.modifiedAGI.toFixed()).toBe('24000');
  expect(result.agi.toFixed()).toBe('21300');
  expect(input).toEqual(before);
});
