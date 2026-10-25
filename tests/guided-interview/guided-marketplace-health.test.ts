// Spec: spec/federal/guided-marketplace-health.yaml.
import { expect, it } from "vitest";
import { buildHealthInsuranceInput, healthInsuranceSourceErrors } from "@/lib/guided-health-insurance-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal";
import { calculateForm7206 } from "@/engine/forms/form-7206";
import { TaxYearInputSchema } from "@/models/inputs";
import { marketplacePolicyOptions } from "@/lib/guided-marketplace-health-facts";
import { guidedMarketplaceHealthFacts, guidedMarketplaceHealthState } from "../fixtures/guided-marketplace-health";

it("binds actual policy months without inventing premium sources", () => {
  const state = guidedMarketplaceHealthState(); const original = structuredClone(state);
  expect(healthInsuranceSourceErrors(state)).toEqual({});
  const built = buildHealthInsuranceInput(state.sectionData.adjustments!.healthInsuranceFacts, "single", 2025)!;
  expect(built.plans?.[0]).toMatchObject({ marketplacePolicySourceIds: ["form1095A:0"], allCoveredPersonsInCoverageFamilyConfirmed: true });
  const checked = calculateForm7206({ facts: built, filingStatus: "single", taxYear: 2025, marketplaceHandling: "separate-specified-premiums" });
  expect(checked.calculationComplete).toBe(false); expect(checked.deduction).toBeUndefined();
  expect(checked.grossSourcePremiums.toFixed()).toBe("6000"); expect(checked.paidSourcePremiums.toFixed()).toBe("2400");
  expect(state).toEqual(original);
  for (const ids of [[], [""], ["form1095A:01"], ["form1095A:1"], ["form1095A:0", "form1095A:0"]]) {
    const invalid = guidedMarketplaceHealthState(); invalid.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.marketplacePolicySourceIds = ids;
    expect(healthInsuranceSourceErrors(invalid)).toHaveProperty("healthInsuranceMarketplace"); expect(buildTaxInputFromGuidedData(invalid)).toBeNull();
  }
  const wrong = guidedMarketplaceHealthState(); wrong.sectionData.credits!.premiumTaxCredit!.policies[0]!.taxYear = "2026";
  expect(healthInsuranceSourceErrors(wrong)).toHaveProperty("healthInsuranceMarketplace");
  const missing = guidedMarketplaceHealthState(); missing.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments.pop();
  expect(healthInsuranceSourceErrors(missing)).toHaveProperty("healthInsuranceMarketplace");
  const advance = guidedMarketplaceHealthState(); advance.sectionData.credits!.premiumTaxCredit!.policies[0]!.monthlyPremiums[0]!.advancePremiumTaxCredit = "299.99";
  expect(healthInsuranceSourceErrors(advance)).toHaveProperty("healthInsuranceMarketplace");
  const changed = updateSectionData(state, "credits", { ...state.sectionData.credits, premiumTaxCredit: { ...state.sectionData.credits!.premiumTaxCredit!, policies: [] } });
  expect(changed.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.adjustments?.healthInsuranceFacts?.plans[0]?.marketplacePolicySourceIds).toEqual(["form1095A:0"]);
});
it("conserves actual person advances and retains unknown versus zero", () => {
  for (const amount of [undefined, "", "-1", "NaN"]) {
    const data = guidedMarketplaceHealthFacts(); data.plans[0]!.payments[0]!.advancePremiumTaxCredit = amount;
    expect(() => buildHealthInsuranceInput(data, "single", 2025)).toThrow();
    const share = guidedMarketplaceHealthFacts(); share.plans[0]!.payments[0]!.personAmounts[0]!.advancePremiumTaxCredit = amount;
    expect(() => buildHealthInsuranceInput(share, "single", 2025)).toThrow();
  }
  const wrong = guidedMarketplaceHealthFacts(); wrong.plans[0]!.payments[0]!.personAmounts[0]!.advancePremiumTaxCredit = "299.99";
  expect(() => buildHealthInsuranceInput(wrong, "single", 2025)).toThrow(/reconcile/i);
  const zero = guidedMarketplaceHealthState(); const payment = zero.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!;
  payment.advancePremiumTaxCredit = payment.personAmounts[0]!.advancePremiumTaxCredit = "0";
  payment.ownerOrBusinessPaid = payment.personAmounts[0]!.amountPaid = "500";
  zero.sectionData.credits!.premiumTaxCredit!.policies[0]!.monthlyPremiums[0]!.advancePremiumTaxCredit = "0";
  zero.sectionData.credits!.premiumTaxCredit!.monthlyReconciliation[0]!.advancePremiumTaxCredit = "0";
  expect(healthInsuranceSourceErrors(zero)).toEqual({});
  expect(buildTaxInputFromGuidedData(zero)?.form7206?.plans?.[0]?.payments?.[0]?.personAmounts?.[0]?.advancePremiumTaxCredit).toBe("0");
  const large = guidedMarketplaceHealthFacts(); const source = large.plans[0]!.payments[0]!;
  source.advancePremiumTaxCredit = source.personAmounts[0]!.advancePremiumTaxCredit = "9,007,199,254,740,993.01"; source.grossPremium = "9007199254741193.01";
  expect(buildHealthInsuranceInput(large, "single", 2025)?.plans?.[0]?.payments?.[0]?.advancePremiumTaxCredit).toBe("9007199254740993.01");
});
it("requires actual employer offer evidence and preserves known ineligibility", () => {
  const state = guidedMarketplaceHealthState(); const month = state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.months[0]!;
  month.employerSubsidizedPlanEligible = true;
  expect(healthInsuranceSourceErrors(state)).toHaveProperty("healthInsuranceMarketplace");
  month.employerOfferPtcException = "unaffordable"; month.employerCoverageEnrolled = false; month.employerOfferSourceReference = "Actual employer affordability and enrollment record";
  expect(healthInsuranceSourceErrors(state)).toEqual({});
  expect(buildTaxInputFromGuidedData(state)?.form7206?.plans?.[0]?.months?.[0]).toMatchObject({ employerSubsidizedPlanEligible: true, employerCoverageEnrolled: false, employerOfferPtcException: "unaffordable" });
  month.employerCoverageEnrolled = true; expect(healthInsuranceSourceErrors(state)).toHaveProperty("healthInsuranceMarketplace");
  const mixed = guidedMarketplaceHealthState(); mixed.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.allCoveredPersonsInCoverageFamilyConfirmed = false;
  expect(healthInsuranceSourceErrors(mixed)).toHaveProperty("healthInsuranceMarketplace");
  const ineligible = guidedMarketplaceHealthState(); ineligible.sectionData.credits!.premiumTaxCredit!.monthlyReconciliation[0]!.coverageEligible = false;
  expect(healthInsuranceSourceErrors(ineligible)).toHaveProperty("healthInsuranceMarketplace");
});
it("calculates the actual guided Marketplace deduction and credit once", () => {
  const state = guidedMarketplaceHealthState();
  expect(validateSection(state, "adjustments").status).toBe("complete"); expect(validateSection(state, "credits").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
  expect(input?.form7206?.plans?.[0]?.payments?.[0]?.ownerOrBusinessPaid).toBe("200");
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.scheduleSE.totalSETax.toFixed()).toBe("7065");
  expect(result.marketplaceHealthInsurance?.maximumDeduction.toFixed()).toBe("3375");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("2344");
  expect(result.agi.toFixed()).toBe("44123");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("3494");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("106");
  expect(result.form7206?.deduction?.toFixed()).toBe("0");
});

it("keeps policy timing and unsupported funding boundaries explicit", () => {
  const absent = guidedMarketplaceHealthState(); absent.sectionData.credits!.premiumTaxCredit = undefined;
  expect(healthInsuranceSourceErrors(absent)).toHaveProperty("healthInsuranceMarketplace");
  const qsehra = guidedMarketplaceHealthState(); qsehra.sectionData.credits!.premiumTaxCredit!.qsehraAffected = true;
  qsehra.sectionData.credits!.premiumTaxCredit!.monthlyReconciliation.forEach(month => { month.qsehraAffordable = false; month.qsehraMonthlyPermittedBenefit = "0"; });
  expect(healthInsuranceSourceErrors(qsehra)).toHaveProperty("healthInsuranceMarketplace");
  for (const field of ["otherTaxFreeFunding", "excludedPublicSafetyOfficerAmount"] as const) {
    const funded = guidedMarketplaceHealthState(); funded.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!.personAmounts[0]![field] = "1";
    expect(healthInsuranceSourceErrors(funded)).toHaveProperty("healthInsuranceMarketplace");
  }
  const outside = guidedMarketplaceHealthState(); outside.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!.otherPersonPaid = "1";
  expect(healthInsuranceSourceErrors(outside)).toHaveProperty("healthInsuranceMarketplace");
  const timing = guidedMarketplaceHealthState(); timing.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!.datePaid = "2024-12-31";
  expect(healthInsuranceSourceErrors(timing)).toHaveProperty("healthInsuranceMarketplace");
  const duplicate = guidedMarketplaceHealthState(); duplicate.sectionData.adjustments!.healthInsuranceFacts!.plans.push(structuredClone(duplicate.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!));
  expect(healthInsuranceSourceErrors(duplicate)).toHaveProperty("healthInsuranceMarketplace");
  const enrolled = guidedMarketplaceHealthState(); enrolled.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.months[0]!.employerCoverageEnrolled = true;
  expect(healthInsuranceSourceErrors(enrolled)).toHaveProperty("healthInsuranceMarketplace");
  const changed = guidedMarketplaceHealthState(); changed.sectionData.credits!.premiumTaxCredit!.monthlyReconciliation[0]!.enrolleePremium = "499.99";
  expect(healthInsuranceSourceErrors(changed)).toHaveProperty("healthInsuranceMarketplace");
  expect(marketplacePolicyOptions()).toEqual([]);
  expect(marketplacePolicyOptions([{ taxYear: "", marketplace: "", policyNumber: "", monthlyPremiums: [] }])).toEqual([{ sourceId: "form1095A:0", label: "Marketplace not entered — policy number not entered (year unknown)" }]);
});

it("preserves actual multiple-policy and2026 source identities", () => {
  const state = guidedMarketplaceHealthState(); const policies = state.sectionData.credits!.premiumTaxCredit!.policies;
  policies[0]!.monthlyPremiums.forEach(month => { month.enrolleePremium = "280"; month.advancePremiumTaxCredit = "200"; });
  policies.push({ ...structuredClone(policies[0]!), policyNumber: "second-actual-policy", monthlyPremiums: policies[0]!.monthlyPremiums.map(month => ({ ...month, enrolleePremium: "220", advancePremiumTaxCredit: "100", slcsp: "900" })) });
  state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.marketplacePolicySourceIds = ["form1095A:0", "form1095A:1"];
  expect(healthInsuranceSourceErrors(state)).toEqual({});
  expect(buildTaxInputFromGuidedData(state)?.form8962?.monthlyReconciliation?.[0]?.slcsp).toBe("500");
  state.taxYear = 2026;
  const health = state.sectionData.adjustments!.healthInsuranceFacts!, ptc = state.sectionData.credits!.premiumTaxCredit!;
  health.sourceTaxYear = ptc.sourceTaxYear = "2026"; health.persons[0]!.attainedAgeAtYearEnd = "36";
  ptc.policies.forEach(policy => { policy.taxYear = "2026"; });
  health.plans[0]!.payments.forEach(payment => { payment.coverageTaxYear = "2026"; payment.datePaid = payment.datePaid.replace("2025-", "2026-"); });
  expect(healthInsuranceSourceErrors(state)).toEqual({});
  expect(buildTaxInputFromGuidedData(state)?.form7206?.sourceTaxYear).toBe(2026);
  expect(buildTaxInputFromGuidedData(state)?.form1095A?.map(policy => policy.taxYear)).toEqual([2026, 2026]);
});
