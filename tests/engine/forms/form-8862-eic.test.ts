import { describe, expect, it } from 'vitest';
import { calculateForm8862, type Form8862Input } from '@/engine/forms/form-8862.js';
import { Form8862SourcesSchema } from '@/models/form-8862-sources.js';
import { known, home, source, packet, filer, denial, child } from '../../fixtures/form-8862.js';

// Spec: spec/federal/form-8862-eic.yaml. All identities and records are fictional.
describe('actual current Form8862 EIC sources', () => {
  it('requires actual live-birth evidence for the born-and-deceased SSN exception', () => {
    const input = source(); const row = child(input, false); const original = known(input.taxpayer.dependents[0]);
    original.dateOfBirth = '2025-10-01'; original.monthsLivedWithYou = 2;
    Object.assign(known(row.original), { dateOfBirth: original.dateOfBirth, monthsLivedWithYou: 2 });
    row.specialResidencePeriodClaimed = true; row.deathDate = '2025-11-30'; row.homeDays = home(31);
    expect(() => calculateForm8862(input)).toThrow(/birth.*record|live.birth.*evidence/i);
    Object.assign(row, { bornAndDeceasedRecord: { sourceReference: 'Fictional original hospital record', recordType: 'hospital_record',
      showsLiveBirth: true, copyAvailableForReturnAttachment: true } });
    expect(known(calculateForm8862(input)).ssnCountedChildSourceIds).toEqual(['dependent:0']);
    expect(known(calculateForm8862(input)).requiredChildEvidenceSourceIds).toEqual(['dependent:0']);
    Object.assign(row, { bornAndDeceasedRecord: { sourceReference: 'Fictional original hospital record', recordType: 'hospital_record',
      showsLiveBirth: false, copyAvailableForReturnAttachment: true } });
    expect(() => calculateForm8862(input)).toThrow(/live.birth/i);
    Object.assign(row, { bornAndDeceasedRecord: { sourceReference: 'Fictional original hospital record', recordType: 'hospital_record',
      showsLiveBirth: true, copyAvailableForReturnAttachment: false } });
    expect(() => calculateForm8862(input)).toThrow(/attachment/i);
    row.deathDate = null; row.homeDays = home(47);
    expect(() => calculateForm8862(input)).toThrow(/born.*deceas|both.*date/i);
  });
  it('validates supplied residence records without inventing shortcut answers', () => {
    const input = source(); known(denial(input)).reason = 'income_only';
    delete packet(input).children; delete packet(input).allCandidateChildrenIncluded;
    known(filer(input).homeDays).actualUnitedStatesDays = 366;
    expect(() => calculateForm8862(input)).toThrow(/days/i);
    delete filer(input).homeDays;
    expect(known(calculateForm8862(input)).physical.claimantRows).toBeUndefined();
    filer(input).applicableYearEnd = '2025-02-30';
    expect(() => calculateForm8862(input)).toThrow(/date/i);
  });
  it('derives current year and the income-only shortcut from original history', () => {
    const input = source(); known(denial(input)).reason = 'income_only';
    delete packet(input).children; delete packet(input).allCandidateChildrenIncluded; delete filer(input).homeDays;
    const result = known(calculateForm8862(input));
    expect(result).toMatchObject({ required: true, currentFormRequirementsMet: true,
      physical: { line1: 2025, line2Eic: true, line3IncomeOnly: true } });
    expect(result.physical.line4OtherTaxpayerChild).toBeUndefined();
    expect(result.physical.childRows).toBeUndefined(); expect(result.physical.claimantRows).toBeUndefined();
    known(denial(input)).reason = 'other'; expect(() => calculateForm8862(input)).toThrow(/candidate.*child|child.*unknown/i);
  });
  it('preserves known Rule10 and dependency restrictions instead of clearing them with a form', () => {
    const input = source(); known(input.eic?.claimantEligibility).primaryQualifyingChildOfAnotherTaxpayer = true;
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: false, physical: { line4OtherTaxpayerChild: true } });
    known(input.eic?.claimantEligibility).primaryQualifyingChildOfAnotherTaxpayer = false;
    known(input.standardDeductionFacts).primaryCanBeClaimedAsDependent = true;
    expect(known(calculateForm8862(input)).physical.claimantRows?.[0]?.line11Dependent).toBe(true);
    known(known(input.eic?.claimantEligibility).primaryChildless).dependentException = { sourceReference: 'Fictional actual potential claimant filing record',
      allPotentialClaimantsNotRequiredToFile: true, allPotentialClaimantsDidNotFileOrRefundOnly: true };
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: true });
    expect(known(calculateForm8862(input)).physical.claimantRows?.[0]?.line11Dependent).toBe(false);
  });
  it('keeps actual child presence separate from the valid SSN amount count', () => {
    const input = source(); const row = child(input, false); input.taxpayer.primary.dateOfBirth = '2003-02-01';
    known(filer(input).originalTaxpayer).dateOfBirth = input.taxpayer.primary.dateOfBirth;
    const result = known(calculateForm8862(input));
    expect(result).toMatchObject({ qualifyingChildPresent: true, ssnCountedChildSourceIds: [], currentFormRequirementsMet: true,
      physical: { line6QualifyingChild: true, childRows: [{ sourceId: 'dependent:0', line7Days: 365 }] } });
    expect(result.physical.claimantRows).toBeUndefined();
    row.validSsnIssuedByDueDate = true; expect(() => calculateForm8862(input)).toThrow(/SSN/i);
    const joint = source(true); const sibling = child(joint); joint.taxpayer.primary.dateOfBirth = '2004-01-01';
    known(filer(joint).originalTaxpayer).dateOfBirth = '2004-01-01';
    known(joint.taxpayer.dependents[0]).dateOfBirth = '2003-01-02'; known(sibling.original).dateOfBirth = '2003-01-02';
    sibling.fullTimeStudentForFiveMonths = true;
    expect(known(calculateForm8862(joint)).qualifyingChildPresent).toBe(true); // Younger than actual spouse.
  });
  it('retains raw child days while applying the printed birth and death convention', () => {
    const input = source(); const row = child(input); const original = known(input.taxpayer.dependents[0]);
    original.dateOfBirth = '2025-10-01'; original.monthsLivedWithYou = 3;
    Object.assign(known(row.original), { dateOfBirth: original.dateOfBirth, monthsLivedWithYou: 3 });
    row.specialResidencePeriodClaimed = true; row.homeDays = home(47);
    expect(known(calculateForm8862(input)).physical.childRows?.[0]).toMatchObject({ actualResidenceDays: 47, line7Days: 365, line8Birth: '10/01' });
    row.homeDays = home(46); row.livedWithTaxpayerInUnitedStatesMoreThanHalfYear = false;
    expect(known(calculateForm8862(input)).qualifyingChildPresent).toBe(false);
    row.homeDays = home(47); row.livedWithTaxpayerInUnitedStatesMoreThanHalfYear = true; row.deathDate = '2025-11-30';
    expect(known(calculateForm8862(input)).physical.childRows?.[0]).toMatchObject({ actualResidenceDays: 47, line7Days: 365, line8Birth: '10/01', line8Death: '11/30' });
    row.homeDays = home(62); expect(() => calculateForm8862(input)).toThrow(/alive|days/i);
  });
  it('derives each claimant home day total and preserves unknown zero and military sources', () => {
    const input = source(true); filer(input).homeDays = home(182); known(known(input.eic?.claimantEligibility).primaryChildless).mainHomeInUnitedStatesMoreThanHalfYear = false;
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: false });
    filer(input).homeDays = { ...home(182), temporaryAbsences: [{ sourceReference: 'Fictional medical absence', reason: 'medical', days: 1 }] };
    known(known(input.eic?.claimantEligibility).primaryChildless).mainHomeInUnitedStatesMoreThanHalfYear = true;
    expect(known(calculateForm8862(input)).physical.claimantRows?.[0]?.line9Days).toBe(183);
    delete known(filer(input, 1).homeDays).actualUnitedStatesDays; expect(() => calculateForm8862(input)).toThrow(/day.*unknown|actual.*days/i);
    filer(input, 1).homeDays = { ...home(0), militaryOutsideUnitedStatesDays: 200,
      extendedActiveDuty: { sourceReference: 'Fictional military order', orderedOver90DaysOrIndefinite: true } };
    Object.assign(known(known(input.eic?.claimantEligibility).spouseChildless), { countedMilitaryDutyOutsideUnitedStates: true,
      militaryDutySourceReference: 'Fictional military order', extendedActiveDutyOrderOver90DaysOrIndefinite: true });
    expect(known(calculateForm8862(input)).physical.claimantRows?.[1]?.line9Days).toBe(200);
    known(known(filer(input, 1).homeDays).extendedActiveDuty).orderedOver90DaysOrIndefinite = false;
    expect(() => calculateForm8862(input)).toThrow(/military|duty/i);
  });
  it('uses either actual spouse age while retaining both independent dependency answers', () => {
    const input = source(true); input.taxpayer.primary.dateOfBirth = '1958-01-01'; known(filer(input).originalTaxpayer).dateOfBirth = '1958-01-01';
    expect(known(calculateForm8862(input)).physical.claimantRows?.map(row => row.line10Age)).toEqual([67, 40]);
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: true });
    known(input.standardDeductionFacts).spouseCanBeClaimedAsDependent = true;
    expect(calculateForm8862(input)).toMatchObject({ currentFormRequirementsMet: false });
  });
  it('rejects unknown or contradictory current originals without changing the source records', () => {
    expect(Form8862SourcesSchema.parse({})).toEqual({});
    const input = source(); expect(calculateForm8862({ ...input, sources: undefined })).toBeUndefined();
    const before = structuredClone(input); calculateForm8862(input); expect(input).toEqual(before);
    for (const edit of [(s: Form8862Input) => { packet(s).sourceTaxYear = 2024; },
      (s: Form8862Input) => { packet(s).children = undefined; },
      (s: Form8862Input) => { known(filer(s).originalTaxpayer).ssn = '900-99-9999'; },
      (s: Form8862Input) => { known(packet(s).filers).push(structuredClone(filer(s))); }]) {
      const changed = structuredClone(input); edit(changed); expect(() => calculateForm8862(changed)).toThrow();
    }
    const withChild = source(); const row = child(withChild); known(row.original).ssn = withChild.taxpayer.primary.ssn;
    known(withChild.taxpayer.dependents[0]).ssn = withChild.taxpayer.primary.ssn;
    expect(() => calculateForm8862(withChild)).toThrow(/identifier|identity/i);
  });
  it('keeps active bans and actual no-child history exceptions separate from recertification', () => {
    const input = source(); known(denial(input)).reason = 'qualifying_child_only';
    expect(calculateForm8862(input)).toMatchObject({ required: false, qualifyingChildPresent: false });
    child(input); expect(calculateForm8862(input)).toMatchObject({ required: true, qualifyingChildPresent: true });
    Object.assign(known(denial(input)), { conduct: 'reckless', finalDeterminationDate: '2025-12-01',
      interveningReturnHistoryCompleteConfirmed: true, interveningOriginalReturns: [] });
    expect(calculateForm8862(input)).toMatchObject({ required: false, currentFormRequirementsMet: false });
  });
});
