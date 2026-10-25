import { emptyPersonalInfo, startInterview, type PersonalInfoData, type SegmentationAnswers, type DependentEntryData } from "@/lib/guided-interview-flow";

/** Synthetic, explicitly supplied facts; never production defaults. */
export const completePersonalInfo: PersonalInfoData = {
  ...emptyPersonalInfo, firstName: "Jordan", lastName: "Example", ssn: "111-22-3333",
  dateOfBirth: "1990-02-15", usResidencyMonths: "12", stateResidency: "full-year",
  addressLine1: "42 Example Road", city: "Columbus", state: "OH", zip: "43215",
  dependentCount: "0", dependents: [], livedWithSpouseAtAnyTimeDuringYear: true,
  spouse: { firstName: "Taylor", lastName: "Example", ssn: "222-33-4444", dateOfBirth: "1992-09-10", usResidencyMonths: "12" },
};

export const completeDependent: DependentEntryData = {
  firstName: "Alex", lastName: "Example", ssn: "333-44-5555", dateOfBirth: "2015-06-01",
  relationship: "child", monthsLivedWithYou: "12", qualifiesForCTC: true,
  qualifiesForODC: false, qualifiesForEIC: false,
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
};
