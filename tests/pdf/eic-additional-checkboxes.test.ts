// Spec: spec/federal/eic-additional-review-checkboxes.yaml. Actual synthetic sources.
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { fillForm1040 } from '@/pdf/fill-form-1040.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { fictionalEmptyEicHistory } from '../fixtures/eic-disallowance.js';

const noEicBox = 'topmostSubform[0].Page2[0].c2_13[0]';
const homeBox = 'topmostSubform[0].Page1[0].c1_5[0]';
function required<T>(value: T | undefined | null): T { if (value == null) throw new Error('Missing synthetic source'); return value; }
function source(joint = false) {
  const home = { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false };
  const input = TaxYearInputSchema.parse({ ...structuredClone(simpleW2Fixture),
    taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: joint ? 'married_filing_jointly' : 'single',
      primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true, usResidencyMonths: 12 },
      spouse: joint ? { ...simpleW2Fixture.taxpayer.primary, firstName: 'John', ssn: '321-54-9876', employmentValidSsnIssuedByDueDate: true, usResidencyMonths: 12 } : undefined },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '10000', federalWithheld: '0', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }],
    eic: { claimantEligibility: { sourceTaxYear: 2025, sourceReference: 'Actual EIC claimant records', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false, primaryChildless: { ...home },
      ...(joint ? { spouseNonresidentAlienDuringYear: false, spouseQualifyingChildOfAnotherTaxpayer: false, spouseChildless: { ...home } } : {}) } } });
  if (!input.eic) throw new Error('Missing fictional claimant source');
  input.eic.disallowanceSources = fictionalEmptyEicHistory(input.taxpayer);
  return input;
}
async function saved(input: ReturnType<typeof source>) {
  const original = JSON.stringify(input);
  const result = calculateFederalTax(input);
  const bytes = await (await fillForm1040(input, result, 'forms/blank/2025/f1040.pdf')).save();
  const form = (await PDFDocument.load(bytes)).getForm();
  expect(JSON.stringify(input)).toBe(original);
  return { credit: result.earnedIncomeCredit.toFixed(), noEic: form.getCheckBox(noEicBox).isChecked(), home: form.getCheckBox(homeBox).isChecked() };
}
function withChild(input: ReturnType<typeof source>) {
  input.taxpayer.dependents = [{ firstName: 'Synthetic', lastName: 'Child', ssn: '333-44-5555', dateOfBirth: '2023-01-15',
    relationship: 'child', monthsLivedWithYou: 12, qualifiesForEIC: true, qualifiesForCTC: false, qualifiesForODC: false }];
}

it('prints known SSN restrictions without inferring from omitted identities', async () => {
  const primary = source(); primary.taxpayer.primary.employmentValidSsnIssuedByDueDate = false;
  expect(await saved(primary)).toMatchObject({ credit: '0', noEic: true });
  const spouse = source(true); required(spouse.taxpayer.spouse).employmentValidSsnIssuedByDueDate = false;
  expect(await saved(spouse)).toMatchObject({ credit: '0', noEic: true });
  const legacy = source(); delete legacy.eic; delete legacy.taxpayer.primary.employmentValidSsnIssuedByDueDate;
  expect(await saved(legacy)).toMatchObject({ noEic: false, home: false });
  legacy.taxpayer.primary.employmentValidSsnIssuedByDueDate = false;
  expect(await saved(legacy)).toMatchObject({ credit: '0', noEic: true });
});
it('keeps the actual joint resident election distinct from nonresident disqualification', async () => {
  const single = source(); single.deductionElection = 'itemized';
  required(single.standardDeductionFacts).nonresidentAlien = true;
  required(single.eic?.claimantEligibility).primaryNonresidentAlienDuringYear = true;
  expect(await saved(single)).toMatchObject({ credit: '0', noEic: true });
  const joint = source(true);
  const facts = required(joint.eic?.claimantEligibility);
  facts.spouseNonresidentAlienDuringYear = true; facts.residentJointElection = false;
  expect(await saved(joint)).toMatchObject({ credit: '0', noEic: true });
  facts.residentJointElection = true; required(joint.standardDeductionFacts).residentJointElection = true;
  expect(await saved(joint)).toMatchObject({ credit: '649', noEic: false });
});
it('uses actual death and either-spouse ages only on the childless route', async () => {
  const young = source(); young.taxpayer.primary.dateOfBirth = '2002-02-01';
  expect(await saved(young)).toMatchObject({ credit: '0', noEic: true });
  const joint = source(true); joint.taxpayer.primary.dateOfBirth = '1958-01-01';
  required(joint.taxpayer.spouse).dateOfBirth = '2000-02-14';
  required(joint.standardDeductionFacts).spouseDeathDate = '2025-02-12';
  expect(await saved(joint)).toMatchObject({ credit: '0', noEic: true });
  required(joint.standardDeductionFacts).spouseDeathDate = '2025-02-13';
  expect(await saved(joint)).toMatchObject({ credit: '649', noEic: false });
  withChild(young); expect((await saved(young)).noEic).toBe(false);
  const unknown = source(); delete unknown.eic; delete required(unknown.standardDeductionFacts).primaryDeathDate;
  unknown.taxpayer.primary.dateOfBirth = '2002-02-01';
  expect((await saved(unknown)).noEic).toBe(false);
});
it('prints actual joint homes while preserving false and unknown sources', async () => {
  expect(await saved(source(true))).toMatchObject({ home: true, noEic: false });
  const actual = source(true); required(required(actual.eic?.claimantEligibility).spouseChildless).mainHomeInUnitedStatesMoreThanHalfYear = false;
  expect(await saved(actual)).toMatchObject({ credit: '0', noEic: true, home: false });
  withChild(actual); expect(await saved(actual)).toMatchObject({ noEic: false, home: false });
  const unknown = source(); withChild(unknown); delete required(unknown.eic?.claimantEligibility).primaryChildless;
  expect(await saved(unknown)).toMatchObject({ noEic: false, home: false });
  required(unknown.eic?.claimantEligibility).primaryChildless = { mainHomeInUnitedStatesMoreThanHalfYear: true };
  expect(await saved(unknown)).toMatchObject({ noEic: false, home: false });
  const legacy = source(); delete legacy.eic; expect((await saved(legacy)).home).toBe(false);
});
it('binds military and source conditions without treating every zero as an opt-out', async () => {
  const military = source();
  const personal = required(required(military.eic?.claimantEligibility).primaryChildless);
  personal.countedMilitaryDutyOutsideUnitedStates = true;
  personal.extendedActiveDutyOrderOver90DaysOrIndefinite = true;
  personal.militaryDutySourceReference = 'Actual indefinite foreign duty order';
  expect(await saved(military)).toMatchObject({ credit: '649', home: true, noEic: false });
  const result = calculateFederalTax(military);
  delete personal.militaryDutySourceReference;
  await expect(fillForm1040(military, result, '/missing/not-read.pdf')).rejects.toThrow(/military|active duty/i);
  const negative = source(); negative.taxpayer.primary.employmentValidSsnIssuedByDueDate = false;
  const stale = calculateFederalTax(negative); stale.earnedIncomeCredit = new Decimal(649);
  await expect(fillForm1040(negative, stale, '/missing/not-read.pdf')).rejects.toThrow(/claimant|positive.*EIC/i);
  const dependent = source(); required(dependent.standardDeductionFacts).primaryCanBeClaimedAsDependent = true;
  required(dependent.standardDeductionFacts).dependentEarnedIncome = '10000';
  expect(await saved(dependent)).toMatchObject({ credit: '0', noEic: false });
  const high = source(); delete high.eic; required(high.w2s[0]).wages = '100000';
  expect(await saved(high)).toMatchObject({ credit: '0', noEic: false, home: false });
});
