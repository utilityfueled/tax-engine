// Spec: spec/federal/schedule-1-a-sources.yaml.
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { Schedule1ASchema } from "@/models/inputs.js";
import { calculateSchedule1A } from "@/engine/schedules/schedule-1-a.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
const common = { owner: "primary", occupationCode: "102", eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true };
function actualFacts() {
  return { sourceTaxYear: 2025, sourceReference: "Actual wage, tip and loan records", sourceFactsConfirmed: true, allSourcesIncluded: true, primarySsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", seniorOwners: [],
    employeeTips: [{ ...common, employer: "Actual restaurant", w2SourceIds: ["formW2:0"], form4137EmployerSourceId: "restaurant", reportingMethod: "form4070", reportingSourceReference: "Actual monthly employer reports", reportedEmployerTips: "7010.10", qualifiedW2Tips: "7000.10", qualifiedForm4137Tips: "7018.10" }],
    businessTips: [{ ...common, businessName: "Actual service", businessSourceId: "scheduleC", qualifiedReportedTips: "100.10", reportedTipSources: [{ sourceId: "form1099Nec:0", qualifiedTips: "100.10" }] }],
    overtime: [{ owner: "primary", qualifiedPremium: "123.45", reportedCompensation: "50000", compensationExcludedFromWages: "0", requiredByFlsa: true, compensationSourceId: "formW2:0", reportingSourceReference: "Actual wage premium statement" }],
    vehicleLoans: [{ owner: "primary", lenderName: "Actual lender", loanAccountReference: "loan-1", sourceTaxYear: 2025, sourceReference: "Actual loan statement", borrowerQualificationConfirmed: true, vin: "1HGCM82633A004352", acquiredDate: "2025-01-01", loanOriginationDate: "2025-01-01", interestPaid: "100.10", businessInterestDeducted: "0", nonqualifyingInterest: "0", firstLien: true, originalUse: true, finalAssemblyUnitedStates: true, personalUse: true, vehicleType: "car", grossVehicleWeightRating: 4000, relatedParty: false, lease: false, fleet: false, salvageOrScrap: false, refinanced: false }],
  };
}
it("preserves actual linked Schedule1-A sources without inferred business amounts", () => {
  const parsed = Schedule1ASchema.parse(actualFacts());
  expect(parsed.employeeTips[0]).toMatchObject({ w2SourceIds: ["formW2:0"], form4137EmployerSourceId: "restaurant", reportingMethod: "form4070", reportingSourceReference: "Actual monthly employer reports", reportedEmployerTips: "7010.10" });
  expect(parsed.businessTips[0]).toMatchObject({ businessSourceId: "scheduleC", reportedTipSources: [{ sourceId: "form1099Nec:0", qualifiedTips: "100.10" }] });
  expect(parsed.businessTips[0]?.netProfit).toBeUndefined(); expect(parsed.businessTips[0]?.otherAllocableDeductions).toBeUndefined();
  expect(parsed.overtime[0]?.compensationExcludedFromWages).toBe("0");
  expect(parsed.overtime[0]?.compensationSourceId).toBe("formW2:0"); expect(parsed.vehicleLoans[0]?.borrowerQualificationConfirmed).toBe(true);
  expect(Schedule1ASchema.parse({ ...actualFacts(), vehicleLoans: [{ ...actualFacts().vehicleLoans[0], borrowerQualificationConfirmed: false }] }).vehicleLoans[0]?.borrowerQualificationConfirmed).toBe(false);
});
it("rejects unverified linked deductions and missing canonical business values", () => {
  const facts = Schedule1ASchema.parse(actualFacts());
  const params = { taxpayer: simpleW2Fixture.taxpayer, agi: new Decimal("50000"), foreignExcludedIncome: new Decimal(0), facts };
  expect(() => calculateSchedule1A(params)).toThrow(/canonical|source/i);
  expect(() => calculateSchedule1A({ ...params, canonicalSourcesVerified: true })).toThrow(/business|profit|deduction/i);
  const complete = { ...facts, businessTips: facts.businessTips.map(entry => ({ ...entry, netProfit: "1000.10", otherAllocableDeductions: "50.01" })) };
  expect(calculateSchedule1A({ ...params, facts: complete, canonicalSourcesVerified: true }).tipsDeduction.toFixed()).toBe("7118");
  for (const patch of [{ sourceFactsConfirmed: false }, { allSourcesIncluded: false }, { sourceTaxYear: 2026 }, { sourceReference: undefined }]) expect(() => calculateSchedule1A({ ...params, facts: { ...complete, ...patch }, canonicalSourcesVerified: true })).toThrow(/source|year|confirm/i);
  expect(calculateSchedule1A({ ...params, facts: { ...complete, vehicleLoans: complete.vehicleLoans.map(loan => ({ ...loan, borrowerQualificationConfirmed: false })) }, canonicalSourcesVerified: true }).vehicleInterestDeduction.toFixed()).toBe("0");
  expect(() => calculateSchedule1A({ ...params, facts: { ...complete, vehicleLoans: complete.vehicleLoans.map(loan => ({ ...loan, borrowerQualificationConfirmed: undefined })) }, canonicalSourcesVerified: true })).toThrow(/borrower|source/i);
  const legacy = Schedule1ASchema.parse({ ...complete, sourceTaxYear: undefined, sourceReference: undefined, sourceFactsConfirmed: undefined, allSourcesIncluded: undefined, employeeTips: [], overtime: [], businessTips: [], vehicleLoans: [], seniorOwners: [] });
  expect(calculateSchedule1A({ ...params, facts: legacy }).totalDeduction.toFixed()).toBe("0");
});
