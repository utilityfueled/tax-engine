import { emptyPersonalInfo, startInterview, type PersonalInfoData, type SegmentationAnswers, type DependentEntryData } from "@/lib/guided-interview-flow";

/** Synthetic, explicitly supplied facts; never production defaults. */
export const completePersonalInfo: PersonalInfoData = {
  ...emptyPersonalInfo, firstName: "Jordan", lastName: "Example", ssn: "111-22-3333",
  dateOfBirth: "1990-02-15", usResidencyMonths: "12", stateResidency: "full-year",
  addressLine1: "42 Example Road", city: "Columbus", state: "OH", zip: "43215",
  dependentCount: "0", dependents: [], livedWithSpouseAtAnyTimeDuringYear: true,
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
  childTaxCredit: { bonaFidePuertoRicoResident: false, puertoRicoExcludedIncome: "0", form4563ExcludedIncome: "0" },
  spouse: { firstName: "Taylor", lastName: "Example", ssn: "222-33-4444", dateOfBirth: "1992-09-10", usResidencyMonths: "12", employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true },
};

export const completeDependent: DependentEntryData = {
  firstName: "Alex", lastName: "Example", ssn: "333-44-5555", dateOfBirth: "2015-06-01",
  relationship: "child", monthsLivedWithYou: "12", qualifiesForCTC: true,
  qualifiesForODC: false, qualifiesForEIC: false,
  ctcSsnEligible: true, odcTinEligible: true,
};

export function startCompleteInterview(segmentation: SegmentationAnswers) {
  const state = startInterview(segmentation, 2025);
  state.sectionData["personal-info"] = structuredClone(completePersonalInfo);
  return state;
}

export const completeAocEligibility = {
  completedFirstFourYearsBeforeYear: false,
  enrolledAtLeastHalfTime: true,
  pursuingDegreeOrCredential: true,
  felonyDrugConviction: false,
  studentTaxId: "111-22-3333", studentRole: "primary" as const,
  studentTinEligible: true, studentSsnEligible: true,
  institutionEligible: true, expensesEligibilityConfirmed: true, form1098TRequirementMet: true,
  institutionEin: "12-3456789",
  institutions: [{ name: "Synthetic College", address: "100 College Rd, Columbus OH 43215", ein: "12-3456789", receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false }],
};

/** Actual answers supplied by synthetic fixtures, never interview defaults. */
export const completeEducationClaimant = {
  primaryTinEligible: true, primarySsnEligible: true, spouseSsnEligible: true,
  canBeClaimedAsDependent: false, claimedAsDependent: false, nonresidentAlien: false,
  aocBanInEffect: false, form8862Required: false, possessionIncomeExclusion: "0",
  refundableAocFacts: { fullTimeStudent: true, earnedIncome: "0", totalSupport: "10000", parentAlive: true },
};

export const completeHouseholdEmployee = { name: "Actual Employee", cashWages: "0", federalIncomeTaxWithheld: "0", isSpouse: false, isChildUnder21: false, isParent: false, isUnder18NonPrincipal: false };
