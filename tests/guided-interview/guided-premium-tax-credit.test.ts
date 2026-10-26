// Spec: spec/federal/guided-premium-tax-credit.yaml.
import { expect, it } from "vitest";
import { buildPremiumTaxCreditInputs, emptyPremiumTaxCreditFacts, premiumTaxCreditFactErrors, type PremiumTaxCreditData } from "@/lib/guided-premium-tax-credit-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { completeDependent, completePersonalInfo, completeW2Entry, startCompleteInterview } from "./complete-facts";

export function actualPremiumTaxCredit(): PremiumTaxCreditData {
  return { ...emptyPremiumTaxCreditFacts, sourceTaxYear: "2025", sourceReference: "Actual Marketplace statements and coverage worksheet", sourceFactsConfirmed: true, allPoliciesIncluded: true,
    taxFamilySize: "1", fplRegion: "contiguous", requiredFilingDependentsModifiedAGI: "0", householdFactsConfirmed: true, canBeClaimedAsDependent: false,
    belowPovertyException: "none", coverageFactsConfirmed: true, allocationRequired: false, alternativeMarriageCalculationElected: false,
    selfEmployedHealthInsuranceCoordinationRequired: false, qsehraAffected: false, lawfulPresenceReconciliationRequired: false,
    policies: [{ taxYear: "2025", marketplace: "Actual Marketplace", policyNumber: "policy-123", monthlyPremiums: Array.from({ length: 12 }, (_, index) => ({ month: String(index + 1), enrolleePremium: "500", slcsp: "500", advancePremiumTaxCredit: "300" })) }],
    monthlyReconciliation: Array.from({ length: 12 }, (_, index) => ({ month: String(index + 1), enrolleePremium: "500", slcsp: "500", advancePremiumTaxCredit: "300", coverageEligible: true, incomeBasedSepEnrollment: false })),
  };
}
function input(data = actualPremiumTaxCredit()) { return buildPremiumTaxCreditInputs(data, 2025, "single", completePersonalInfo); }
function stateWithCoverage() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "30000", socialSecurityWages: "30000", socialSecurityWithheld: "1860", medicareWages: "30000", medicareWithheld: "435" }] };
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: actualPremiumTaxCredit() };
  return state;
}
it("preserves original policy amounts and rejects unknown or duplicate source facts", () => {
  expect(buildPremiumTaxCreditInputs(undefined, null, null)).toEqual({});
  const data = actualPremiumTaxCredit(); const original = structuredClone(data);
  expect(input(data).form1095A?.[0]).toMatchObject({ sourceFactsComplete: true, taxYear: 2025, marketplace: "Actual Marketplace", policyNumber: "policy-123" });
  expect(data).toEqual(original);
  for (const value of ["", "-1", "NaN", "Infinity"]) { const invalid = actualPremiumTaxCredit(); invalid.policies[0]!.monthlyPremiums[0]!.advancePremiumTaxCredit = value; expect(() => input(invalid)).toThrow(); }
  for (const field of ["taxYear", "marketplace", "policyNumber"] as const) { const invalid = actualPremiumTaxCredit(); invalid.policies[0]![field] = ""; expect(() => input(invalid)).toThrow(); }
  const wrongYear = actualPremiumTaxCredit(); wrongYear.policies[0]!.taxYear = "2026"; expect(() => input(wrongYear)).toThrow(/year/i);
  const duplicate = actualPremiumTaxCredit(); duplicate.policies.push(structuredClone(duplicate.policies[0]!)); expect(() => input(duplicate)).toThrow(/duplicate/i);
  const month = actualPremiumTaxCredit(); month.policies[0]!.monthlyPremiums.push({ ...month.policies[0]!.monthlyPremiums[0]! }); expect(() => input(month)).toThrow();
  const huge = actualPremiumTaxCredit(); huge.policies[0]!.monthlyPremiums[0]!.enrolleePremium = "9,007,199,254,740,993.01";
  expect(input(huge).form1095A?.[0]?.monthlyPremiums[0]?.enrolleePremium).toBe("9007199254740993.01");
  const empty = { ...emptyPremiumTaxCreditFacts }; expect(() => input(empty)).toThrow();
});
it("reconciles monthly coverage without summing policy benchmarks or inferring eligibility", () => {
  const data = actualPremiumTaxCredit();
  data.policies.push({ taxYear: "2025", marketplace: "Other Marketplace", policyNumber: "second", monthlyPremiums: [{ month: "1", enrolleePremium: "100", slcsp: "900", advancePremiumTaxCredit: "0" }] });
  data.monthlyReconciliation[0]!.slcsp = "650";
  expect(input(data).form8962?.monthlyReconciliation?.[0]?.slcsp).toBe("650");
  data.monthlyReconciliation[0]!.coverageEligible = false;
  expect(input(data).form8962?.monthlyReconciliation?.[0]?.coverageEligible).toBe(false);
  for (const field of ["coverageEligible", "incomeBasedSepEnrollment"] as const) { const invalid = actualPremiumTaxCredit(); invalid.monthlyReconciliation[0]![field] = null; expect(() => input(invalid)).toThrow(); }
  const advance = actualPremiumTaxCredit(); advance.monthlyReconciliation[0]!.advancePremiumTaxCredit = "299.99"; expect(() => input(advance)).toThrow(/advance/i);
  const premium = actualPremiumTaxCredit(); premium.monthlyReconciliation[0]!.enrolleePremium = "500.01"; expect(() => input(premium)).toThrow(/premium/i);
  const missing = actualPremiumTaxCredit(); missing.monthlyReconciliation.pop(); expect(() => input(missing)).toThrow(/month/i);
  const qsehra = actualPremiumTaxCredit(); qsehra.qsehraAffected = true; expect(() => input(qsehra)).toThrow(/QSEHRA/i);
  qsehra.monthlyReconciliation.forEach(row => { row.qsehraAffordable = false; row.qsehraMonthlyPermittedBenefit = "0"; });
  expect(input(qsehra).form8962?.monthlyReconciliation?.[0]).toMatchObject({ qsehraAffordable: false, qsehraMonthlyPermittedBenefit: "0" });
});
it("binds household sources and preserves ineligible answers without inventing exceptions", () => {
  const data = actualPremiumTaxCredit();
  expect(input(data).form8962?.taxpayerModifiedAGI).toBeUndefined();
  data.taxFamilySize = "2"; expect(() => input(data)).toThrow(/household|family/i);
  data.taxFamilySize = "1"; data.requiredFilingDependentsModifiedAGI = "1"; expect(() => input(data)).toThrow(/dependent/i);
  data.requiredFilingDependentsModifiedAGI = "0"; data.canBeClaimedAsDependent = true; expect(() => input(data)).toThrow(/dependency/i);
  const personal = structuredClone(completePersonalInfo); personal.standardDeductionFacts!.primaryCanBeClaimedAsDependent = true;
  data.taxFamilySize = "0"; expect(() => buildPremiumTaxCreditInputs(data, 2025, "single", personal)).toThrow(/zero.family|allocation/i);
  data.taxFamilySize = "1";
  data.canBeClaimedAsDependent = false;
  for (const field of ["allocationRequired", "lawfulPresenceReconciliationRequired"] as const) { const special = actualPremiumTaxCredit(); special[field] = true; expect(() => input(special)).toThrow(/worksheet/i); }
  const marriage = actualPremiumTaxCredit(); marriage.alternativeMarriageCalculationElected = true; expect(() => input(marriage)).toThrow(/married joint return/i);
  expect(() => buildPremiumTaxCreditInputs(data, 2025, "mfs", completePersonalInfo)).toThrow(/separately/i);
  data.marriedFilingSeparatelyExceptionConfirmed = false;
  expect(buildPremiumTaxCreditInputs(data, 2025, "mfs", completePersonalInfo).form8962?.marriedFilingSeparatelyExceptionConfirmed).toBe(false);
  data.belowPovertyException = "marketplace_estimate"; expect(() => input(data)).toThrow(/estimate/i);
  data.marketplaceEstimatedIncomeWithinEligibilityRange = false; data.marketplaceInformationAccurate = true;
  expect(input(data).form8962?.marketplaceEstimatedIncomeWithinEligibilityRange).toBe(false);
});
it("calculates the independent actual coverage credit in the guided return", () => {
  const state = stateWithCoverage();
  expect(validateSection(state, "credits").status).toBe("complete");
  const actual = buildTaxInputFromGuidedData(state);
  expect(actual?.form1095A).toHaveLength(1);
  expect(actual?.form8962?.taxpayerModifiedAGI).toBeUndefined();
  const result = calculateFederalTax(TaxYearInputSchema.parse(actual));
  expect(result.form8962?.sourceFactsVerified).toBe(true);
  expect(result.form8962?.expectedContribution.toFixed()).toBe("588");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("5412");
  expect(result.form8962?.netPTC.toFixed()).toBe("1812");
  expect(result.agi.toFixed()).toBe("30000");
});
it("invalidates coverage confirmation after actual source changes without a confirmation cycle", () => {
  const state = stateWithCoverage();
  const updated = updateSectionData(state, "income-w2", { entries: [{ ...state.sectionData["income-w2"]!.entries[0]!, wages: "30001" }] });
  expect(updated.sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBeNull();
  expect(updated.sectionData.credits?.premiumTaxCredit?.policies).toEqual(state.sectionData.credits?.premiumTaxCredit?.policies);
  expect(premiumTaxCreditFactErrors(updated)).toHaveProperty("premiumTaxCreditSources");
  expect(buildTaxInputFromGuidedData(updated)).toBeNull();
  const metadata = updateSectionData(state, "credits", { ...state.sectionData.credits, premiumTaxCredit: { ...state.sectionData.credits!.premiumTaxCredit!, sourceFactsConfirmed: true } });
  expect(metadata.sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBe(true);
});

it("keeps both-year source and exception boundaries explicit", () => {
  const actual = actualPremiumTaxCredit(); actual.sourceTaxYear = "2026"; actual.policies[0]!.taxYear = "2026";
  expect(buildPremiumTaxCreditInputs(actual, 2026, "single", completePersonalInfo).form1095A?.[0]?.taxYear).toBe(2026);
  actual.policies[0]!.taxYear = ""; expect(() => buildPremiumTaxCreditInputs(actual, 2026, "single", completePersonalInfo)).toThrow(/year/i);
  const wrong = actualPremiumTaxCredit(); wrong.sourceTaxYear = "2026"; expect(() => input(wrong)).toThrow(/year/i);
  for (const flag of ["sourceFactsConfirmed", "allPoliciesIncluded", "householdFactsConfirmed", "coverageFactsConfirmed"] as const) {
    const data = actualPremiumTaxCredit(); data[flag] = false; expect(() => input(data)).toThrow(/confirm/i);
  }
  for (const field of ["taxFamilySize", "fplRegion", "belowPovertyException", "requiredFilingDependentsModifiedAGI"] as const) {
    const data = actualPremiumTaxCredit(); data[field] = ""; expect(() => input(data)).toThrow();
  }
  const noSources = actualPremiumTaxCredit(); noSources.policies = []; expect(() => input(noSources)).toThrow(/statement/i);
  const missingMonth = actualPremiumTaxCredit(); missingMonth.monthlyReconciliation[0]!.month = "13"; expect(() => input(missingMonth)).toThrow(/month/i);
  const duplicate = actualPremiumTaxCredit(); duplicate.monthlyReconciliation.push({ ...duplicate.monthlyReconciliation[0]! }); expect(() => input(duplicate)).toThrow(/duplicate/i);
  const qsehra = actualPremiumTaxCredit(); qsehra.monthlyReconciliation[0]!.qsehraMonthlyPermittedBenefit = "1"; expect(() => input(qsehra)).toThrow(/QSEHRA/i);
  qsehra.monthlyReconciliation[0]!.qsehraMonthlyPermittedBenefit = "0"; qsehra.monthlyReconciliation[0]!.qsehraAffordable = true; expect(() => input(qsehra)).toThrow(/QSEHRA/i);
  expect(() => buildPremiumTaxCreditInputs(actualPremiumTaxCredit(), 2025, "single")).toThrow(/household/i);
  expect(() => buildPremiumTaxCreditInputs(actualPremiumTaxCredit(), null, "single", completePersonalInfo)).toThrow(/year/i);
  const state = stateWithCoverage(); state.sectionData.credits!.premiumTaxCredit!.selfEmployedHealthInsuranceCoordinationRequired = true;
  expect(premiumTaxCreditFactErrors(state)).toHaveProperty("premiumTaxCreditSources");
  state.sectionData.credits!.premiumTaxCredit!.selfEmployedHealthInsuranceCoordinationRequired = false;
  const changed = updateSectionData(state, "additional-deductions", { tipIncomeAccounts: [{ sourceFactsConfirmed: true, sourceTaxYear: "2025" }] });
  expect(changed.sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBeNull();
});

it("excludes claimable filers from the actual tax family without inventing a member", () => {
  const data = actualPremiumTaxCredit(); const household = structuredClone(completePersonalInfo);
  household.standardDeductionFacts!.primaryCanBeClaimedAsDependent = true; data.canBeClaimedAsDependent = true;
  expect(buildPremiumTaxCreditInputs(data, 2025, "mfj", household).form8962?.taxFamilySize).toBe(1);
  data.taxFamilySize = "2"; expect(() => buildPremiumTaxCreditInputs(data, 2025, "mfj", household)).toThrow(/family/i);
  household.standardDeductionFacts!.primaryCanBeClaimedAsDependent = false; household.standardDeductionFacts!.spouseCanBeClaimedAsDependent = true;
  data.taxFamilySize = "1"; expect(buildPremiumTaxCreditInputs(data, 2025, "mfj", household).form8962?.taxFamilySize).toBe(1);
  household.standardDeductionFacts!.primaryCanBeClaimedAsDependent = true; data.taxFamilySize = "0";
  expect(() => buildPremiumTaxCreditInputs(data, 2025, "mfj", household)).toThrow(/zero.family|allocation/i);
  household.standardDeductionFacts!.primaryCanBeClaimedAsDependent = false; household.standardDeductionFacts!.spouseCanBeClaimedAsDependent = false;
  household.dependents = [structuredClone(completeDependent)]; household.dependentCount = "1";
  data.taxFamilySize = "3"; data.canBeClaimedAsDependent = false; data.requiredFilingDependentsModifiedAGI = "-100.25";
  expect(buildPremiumTaxCreditInputs(data, 2025, "mfj", household).form8962?.requiredFilingDependentsModifiedAGI).toBe("-100.25");
  household.standardDeductionFacts!.primaryCanBeClaimedAsDependent = null;
  expect(() => buildPremiumTaxCreditInputs(data, 2025, "mfj", household)).toThrow(/primary.*dependency|dependency.*primary/i);
});
