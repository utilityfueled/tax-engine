// Spec: spec/federal/marketplace-health-premiums.yaml.
import { expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateForm7206 } from "@/engine/forms/form-7206.js";
import { calculateMarketplaceHealthPremiums } from "@/engine/forms/marketplace-health-premiums.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

function input() {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, w2s: [],
    form1095A: [{ taxYear: 2026, marketplace: "Actual Marketplace", policyNumber: "ACTUAL-POLICY", monthlyPremiums: [{ month: 1, enrolleePremium: "600.10", slcsp: "700", advancePremiumTaxCredit: "300.05" }] }],
    form8962: { taxFamilySize: 1, fplRegion: "contiguous", requiredFilingDependentsModifiedAGI: "0", householdFactsConfirmed: true, canBeClaimedAsDependent: false,
      belowPovertyException: "none", coverageFactsConfirmed: true, allocationRequired: false, alternativeMarriageCalculationElected: false,
      selfEmployedHealthInsuranceCoordinationRequired: true, lawfulPresenceReconciliationRequired: false, qsehraAffected: false,
      monthlyReconciliation: [{ month: 1, enrolleePremium: "600.10", slcsp: "700", advancePremiumTaxCredit: "300.05", coverageEligible: true, incomeBasedSepEnrollment: false }] },
    form7206: { sourceTaxYear: 2026, sourceReference: "Actual premium and policy source ledger", sourceFactsConfirmed: true, allPlansIncluded: true,
      persons: [{ personId: "primary", name: "Jane Doe", householdRole: "primary", attainedAgeAtYearEnd: 36 }],
      plans: [{ planId: "medical", policyReference: "Actual original policy", accountHolder: "primary", businessSourceId: "scheduleC", businessKind: "self_employed",
        kind: "medical", policyHolder: "individual", establishedUnderBusiness: true, insuranceQualificationConfirmed: true,
        marketplaceCoverage: true, premiumTaxCreditInvolved: true, marketplacePolicySourceIds: ["form1095A:0"], allCoveredPersonsInCoverageFamilyConfirmed: true,
        clergySpecialRules: false, coveredPersons: [{ personId: "primary", relationshipToOwner: "self" }], months: [{ month: 1, employerSubsidizedPlanEligible: false }],
        payments: [{ sourceId: "jan-premium", datePaid: "2026-01-01", coverageTaxYear: 2026, coverageMonth: 1, grossPremium: "600.10", ownerOrBusinessPaid: "300.05", otherPersonPaid: "0", advancePremiumTaxCredit: "300.05",
          personAmounts: [{ personId: "primary", payer: "owner_after_tax", amountPaid: "300.05", advancePremiumTaxCredit: "300.05", excludedPublicSafetyOfficerAmount: "0", otherTaxFreeFunding: "0" }] }] }] },
  });
}
function plan(value: ReturnType<typeof input>) {
  const actual = value.form7206?.plans?.[0];
  if (!actual) throw new Error("Missing actual test plan");
  return actual;
}
function month(value: ReturnType<typeof input>) {
  const actual = value.form8962?.monthlyReconciliation?.[0];
  if (!actual) throw new Error("Missing actual coverage month");
  return actual;
}
const contexts = [{ sourceId: "scheduleC", accountHolder: "primary" as const, kind: "self_employed" as const,
  netIncome: d(10000), ownerPositiveBusinessIncome: d(10000), ownerDeductibleSelfEmploymentTax: d(707), attributableRetirementDeduction: d(0), attributableForeignExclusion: d(0) }];
function health(value = input()) {
  if (!value.form7206) throw new Error("Actual synthetic health source missing");
  return calculateForm7206({ taxYear: 2026, filingStatus: "single", facts: value.form7206, businesses: contexts, marketplaceHandling: "separate-specified-premiums" });
}
it("preserves actual advance payments and separates specified source premiums", () => {
  const value = input();
  expect(value.form7206?.plans?.[0]?.payments?.[0]?.advancePremiumTaxCredit).toBe("300.05");
  const result = health(value);
  expect(result.deduction?.toFixed()).toBe("0");
  expect(result.businesses[0]?.specifiedPremiums.toFixed()).toBe("600.1");
  expect(result.sourceRecords[0]?.advancePremiumTaxCredit.toFixed()).toBe("300.05");
  expect(() => calculateForm7206({ taxYear: 2026, filingStatus: "single", facts: value.form7206 ?? (() => { throw new Error("Missing source"); })(), businesses: contexts })).toThrow(/coordination|Marketplace/);
  for (const field of ["advancePremiumTaxCredit", "ownerOrBusinessPaid"] as const) {
    const bad = input(); const payment = bad.form7206?.plans?.[0]?.payments?.[0]; if (!payment) throw new Error("Missing source");
    payment[field] = undefined;
    expect(() => health(bad)).toThrow(/actual|source|unknown/i);
  }
});
it("reconciles actual policy months without inventing coverage or payment shares", () => {
  const value = input();
  const ledger = calculateMarketplaceHealthPremiums({ input: value, healthInsurance: health(value) });
  expect(ledger.groups[0]?.specifiedPremiums.toFixed()).toBe("600.1");
  expect(ledger.groups[0]?.remainingEarnedIncome.toFixed()).toBe("9293");
  for (const change of [
    (bad: ReturnType<typeof input>) => { plan(bad).marketplacePolicySourceIds = ["form1095A:00"]; },
    (bad: ReturnType<typeof input>) => { plan(bad).allCoveredPersonsInCoverageFamilyConfirmed = undefined; },
    (bad: ReturnType<typeof input>) => { bad.form1095A[0].monthlyPremiums[0].advancePremiumTaxCredit = "299"; },
    (bad: ReturnType<typeof input>) => { bad.form1095A[0].taxYear = 2025; },
    (bad: ReturnType<typeof input>) => { month(bad).enrolleePremium = "599"; },
  ]) { const bad = input(); change(bad); expect(() => calculateMarketplaceHealthPremiums({ input: bad, healthInsurance: health(bad) })).toThrow(/source|reconcile|coverage|year|identity|policy/i); }
});
it("keeps nonspecified premiums and actual business limits separate", () => {
  const value = input(); const marketplace = value.form7206?.plans?.[0]; if (!marketplace || !value.form7206) throw new Error("Missing source");
  value.form7206.plans = [marketplace, { ...marketplace, planId: "dental", policyReference: "Actual dental source", marketplaceCoverage: false, premiumTaxCreditInvolved: false,
    marketplacePolicySourceIds: undefined, allCoveredPersonsInCoverageFamilyConfirmed: undefined,
    payments: [{ sourceId: "dental", datePaid: "2026-01-01", coverageTaxYear: 2026, coverageMonth: 1, grossPremium: "100", ownerOrBusinessPaid: "100", otherPersonPaid: "0",
      personAmounts: [{ personId: "primary", payer: "owner_after_tax", amountPaid: "100", excludedPublicSafetyOfficerAmount: "0", otherTaxFreeFunding: "0" }] }] }];
  const result = health(value);
  expect(result.deduction?.toFixed()).toBe("100");
  expect(result.businesses[0]?.medicalPremiums.toFixed()).toBe("100");
  expect(calculateMarketplaceHealthPremiums({ input: value, healthInsurance: result }).groups[0]?.remainingEarnedIncome.toFixed()).toBe("9193");
});
it("retains a separate business nonspecified deduction in the completed source ledger", () => {
  const value = input(); const marketplace = value.form7206?.plans?.[0]; if (!marketplace || !value.form7206) throw new Error("Missing source");
  value.form7206.plans = [marketplace, { ...marketplace, planId: "farm-dental", businessSourceId: "scheduleF", policyReference: "Actual farm plan", marketplaceCoverage: false, premiumTaxCreditInvolved: false,
    marketplacePolicySourceIds: undefined, allCoveredPersonsInCoverageFamilyConfirmed: undefined,
    payments: [{ sourceId: "farm-dental", datePaid: "2026-01-01", coverageTaxYear: 2026, coverageMonth: 1, grossPremium: "100", ownerOrBusinessPaid: "100", otherPersonPaid: "0",
      personAmounts: [{ personId: "primary", payer: "owner_after_tax", amountPaid: "100", excludedPublicSafetyOfficerAmount: "0", otherTaxFreeFunding: "0" }] }] }];
  const businesses = [contexts[0], { ...contexts[0], sourceId: "scheduleF" }].map(row => ({ ...row, ownerPositiveBusinessIncome: d(20000), ownerDeductibleSelfEmploymentTax: d(1414) }));
  const actual = calculateForm7206({ taxYear: 2026, filingStatus: "single", facts: value.form7206, businesses, marketplaceHandling: "separate-specified-premiums" });
  const result = calculateMarketplaceHealthPremiums({ input: value, healthInsurance: actual });
  expect(result.groups.map(row => [row.businessSourceId,row.specifiedPremiums.toFixed(),row.nonspecifiedDeduction.toFixed()])).toEqual([["scheduleC","600.1","0"],["scheduleF","0","100"]]);
});
it("requires actual PTC exception facts for an employer-eligible health month", () => {
  const base = input(); const month = base.form7206?.plans?.[0]?.months?.[0];
  if (!month) throw new Error("Missing source");
  month.employerSubsidizedPlanEligible = true;
  expect(() => calculateMarketplaceHealthPremiums({ input: base, healthInsurance: health(base) })).toThrow(/employer.*source|employer.*exception/i);
  const actual = TaxYearInputSchema.parse({ ...base, form7206: { ...base.form7206, plans: base.form7206?.plans?.map(plan => ({ ...plan,
    months: [{ ...month, employerOfferPtcException: "unaffordable", employerCoverageEnrolled: false, employerOfferSourceReference: "Actual2026 affordability worksheet" }],
  })) } });
  expect(calculateMarketplaceHealthPremiums({ input: actual, healthInsurance: health(actual) }).groups[0]?.specifiedPremiums.toFixed()).toBe("0");
  const enrolled = TaxYearInputSchema.parse({ ...actual, form7206: { ...actual.form7206, plans: actual.form7206?.plans?.map(plan => ({ ...plan,
    months: plan.months?.map(row => ({ ...row, employerCoverageEnrolled: true })),
  })) } });
  expect(() => calculateMarketplaceHealthPremiums({ input: enrolled, healthInsurance: health(enrolled) })).toThrow(/employer.*enroll|contradict/i);
});
it("preserves an actual business loss for the combined WorksheetW limit", () => {
  const value = input();
  if (!value.form7206) throw new Error("Missing source");
  const source = calculateForm7206({ taxYear: 2026, filingStatus: "single", facts: value.form7206,
    businesses: [{ ...contexts[0], netIncome: d(-1000), ownerPositiveBusinessIncome: d(0), ownerDeductibleSelfEmploymentTax: d(0) }],
    marketplaceHandling: "separate-specified-premiums" });
  expect(source.businesses[0]?.earnedIncomeLimit?.toFixed()).toBe("0");
  expect(calculateMarketplaceHealthPremiums({ input: value, healthInsurance: source }).groups[0]?.remainingEarnedIncome.toFixed()).toBe("-1000");
});
