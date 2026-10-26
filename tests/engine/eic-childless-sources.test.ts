// Spec: spec/federal/eic-childless-sources.yaml. Synthetic original facts only.
import { expect, it } from 'vitest';
import { calculateEicClaimantEligibility } from '@/engine/forms/eic-claimant-eligibility.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { calculateEic } from '@/engine/forms/schedule-eic.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import Decimal from 'decimal.js';
import { TAX_CONSTANTS } from '@/models/constants.js';

const personal = { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false, qualifyingChildOfAnotherTaxpayer: false };
function source(joint = false, primary: Record<string, unknown> = {}, spouse: Record<string, unknown> = {}) {
  return TaxYearInputSchema.parse({ ...structuredClone(simpleW2Fixture),
    taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: joint ? 'married_filing_jointly' : 'single',
      primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true, usResidencyMonths: 12 },
      spouse: joint ? { ...simpleW2Fixture.taxpayer.primary, firstName: 'John', ssn: '321-54-9876', employmentValidSsnIssuedByDueDate: true, usResidencyMonths: 12 } : undefined },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '10000', federalWithheld: '0', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }],
    eic: { claimantEligibility: { sourceTaxYear: 2025, sourceReference: 'Actual EIC household records', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: joint ? false : undefined,
      primaryChildless: { ...personal, ...primary }, spouseChildless: joint ? { ...personal, ...spouse } : undefined } },
  });
}
function credit(input: ReturnType<typeof source>) {
  return calculateFederalTax(input).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed();
}
it('uses actual dependency and the separately confirmed filing exception', () => {
  const dependent = source();
  dependent.standardDeductionFacts = { ...dependent.standardDeductionFacts, primaryCanBeClaimedAsDependent: true, dependentEarnedIncome: '10000' };
  expect(credit(dependent)).toBe('0');
  const exception = source(false, { dependentException: { sourceReference: 'Actual potential claimants filing records',
    allPotentialClaimantsNotRequiredToFile: true, allPotentialClaimantsDidNotFileOrRefundOnly: true } });
  exception.standardDeductionFacts = { ...dependent.standardDeductionFacts };
  expect(credit(exception)).toBe('649');
  const filesForCredit = source(false, { dependentException: { sourceReference: 'Actual other return',
    allPotentialClaimantsNotRequiredToFile: true, allPotentialClaimantsDidNotFileOrRefundOnly: false } });
  filesForCredit.standardDeductionFacts = { ...dependent.standardDeductionFacts };
  expect(credit(filesForCredit)).toBe('0');
});
it('keeps another taxpayers qualifying child separate from dependency', () => {
  expect(credit(source(false, { qualifyingChildOfAnotherTaxpayer: true }))).toBe('0');
  expect(credit(source(true, {}, { qualifyingChildOfAnotherTaxpayer: true }))).toBe('0');
  expect(() => credit(source(false, { qualifyingChildOfAnotherTaxpayer: undefined }))).toThrow(/qualifying child.*unknown/i);
});
it('applies the claimant restriction even when the filer has a qualifying child', () => {
  const claimant = source(false, { qualifyingChildOfAnotherTaxpayer: true });
  claimant.taxpayer.primary.dateOfBirth = '2007-01-15';
  const result = () => calculateEic({ claimantInput: claimant, filingStatus: 'single', qualifyingChildren: 1,
    earnedIncome: new Decimal(10000), agi: new Decimal(10000), investmentIncome: new Decimal(0), mfsEicEligible: false }, TAX_CONSTANTS[2025]);
  expect(result().credit.toFixed()).toBe('0');
  const before = JSON.stringify(claimant); result(); expect(JSON.stringify(claimant)).toBe(before);
  const facts = claimant.eic?.claimantEligibility;
  if (!facts) throw new Error('Missing synthetic claimant packet');
  delete facts.primaryChildless;
  facts.primaryQualifyingChildOfAnotherTaxpayer = true;
  expect(result().credit.toFixed()).toBe('0');
  facts.primaryQualifyingChildOfAnotherTaxpayer = undefined;
  expect(result).toThrow(/qualifying child.*unknown/i);
  facts.primaryQualifyingChildOfAnotherTaxpayer = false;
  expect(calculateEicClaimantEligibility(claimant, false)).toMatchObject({ sourceFactsComplete: true, disqualificationReason: undefined });
  facts.primaryChildless = { qualifyingChildOfAnotherTaxpayer: true };
  expect(result).toThrow(/qualifying.child.*conflict/i);
});
it('requires both actual main homes without inferring a day count', () => {
  expect(credit(source(false, { mainHomeInUnitedStatesMoreThanHalfYear: false }))).toBe('0');
  expect(credit(source(true, {}, { mainHomeInUnitedStatesMoreThanHalfYear: false }))).toBe('0');
  expect(() => credit(source(false, { mainHomeInUnitedStatesMoreThanHalfYear: undefined }))).toThrow(/main.home.*unknown/i);
  const deceased = source();
  deceased.standardDeductionFacts = { ...deceased.standardDeductionFacts, primaryDeathDate: '2025-04-01' };
  expect(calculateEicClaimantEligibility(deceased, true).disqualificationReason).toBeUndefined();
  const before = JSON.stringify(deceased); calculateEicClaimantEligibility(deceased, true);
  expect(JSON.stringify(deceased)).toBe(before);
});
it('requires actual military evidence for an answer that counts foreign duty', () => {
  expect(() => credit(source(false, { countedMilitaryDutyOutsideUnitedStates: true }))).toThrow(/military.*source|extended.*duty/i);
  const military = source(false, { countedMilitaryDutyOutsideUnitedStates: true,
    militaryDutySourceReference: 'Actual indefinite active duty order and home records', extendedActiveDutyOrderOver90DaysOrIndefinite: true });
  expect(credit(military)).toBe('649');
  expect(() => credit(source(false, { countedMilitaryDutyOutsideUnitedStates: true,
    militaryDutySourceReference: 'Actual60dayorder', extendedActiveDutyOrderOver90DaysOrIndefinite: false }))).toThrow(/extended.*duty/i);
});
it('preserves historical unknowns and requires actual positive childless sources', () => {
  const legacy = source(); delete legacy.eic;
  expect(calculateEicClaimantEligibility(legacy, true).sourceFactsComplete).toBe(false);
  expect(credit(legacy)).toBe('649');
  legacy.standardDeductionFacts = { ...legacy.standardDeductionFacts, primaryCanBeClaimedAsDependent: true, dependentEarnedIncome: '10000' };
  expect(credit(legacy)).toBe('0');
  legacy.taxpayer.taxYear = 2026;
  expect(calculateEicClaimantEligibility(legacy, true)).toMatchObject({ sourceFactsComplete: false, disqualificationReason: expect.stringMatching(/dependent/) });
  const actual = source(); actual.taxpayer.taxYear = 2026;
  if (!actual.eic?.claimantEligibility || !actual.standardDeductionFacts) throw new Error('Missing synthetic source');
  actual.eic.claimantEligibility.sourceTaxYear = 2026;
  delete actual.standardDeductionFacts.primaryCanBeClaimedAsDependent;
  expect(() => calculateEicClaimantEligibility(actual, true)).toThrow(/dependency.*unknown/);
  actual.standardDeductionFacts.primaryCanBeClaimedAsDependent = false;
  expect(calculateEic({ claimantInput: actual, filingStatus: 'single', qualifyingChildren: 0,
    earnedIncome: new Decimal(10000), agi: new Decimal(10000), investmentIncome: new Decimal(0), mfsEicEligible: false }, FEDERAL_2026_CONSTANTS).credit.toFixed()).toBe('664');
  delete actual.eic.claimantEligibility.primaryChildless;
  expect(() => calculateEicClaimantEligibility(actual, true)).toThrow(/qualifying child.*unknown/);
  const joint = source(true); joint.standardDeductionFacts = { ...joint.standardDeductionFacts, spouseCanBeClaimedAsDependent: true, dependentEarnedIncome: '10000' };
  expect(credit(joint)).toBe('0');
});
