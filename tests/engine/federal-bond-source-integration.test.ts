// Spec: spec/federal/2026/savings-bond-return-integration.yaml.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

function fixture(year = 2025) {
  const parsed = TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    form1099Int: [{ payer: "Treasury", interestIncome: "100", usSavingsBondInterest: "2000" }],
    savingsBondRedemptions: [{ sourceId: "synthetic-bond", proceeds: "10000", bondType: "paper_ee", issueDate: "2005-01-01", redemptionDate: `${year}-06-15`, ownerDateOfBirth: "1980-01-01", registeredOwner: "taxpayer", ownershipConfirmed: true, faceValue: "16000", priorYearInterestReported: "0" }],
    form8815: {
      sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true,
      priorYearInterestIncludedInCurrentStatements: "0", americanSamoaIncomeExclusion: "0", puertoRicoIncomeExclusion: "0", royaltyInterestAdjustment: "0",
      educationExpenses: [{ sourceId: "synthetic-college", beneficiaryName: "Synthetic Student", relationship: "taxpayer", institutionName: "Synthetic College", institutionAddress: "1 College Rd, Example, NY10001", expenseType: "tuition_and_required_fees", paidTaxYear: year, amountPaid: "10000", qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }],
    },
  });
  if (!parsed.form8815) throw new Error("Synthetic source facts must be present");
  return { ...parsed, form8815: parsed.form8815 };
}

describe("Savings-bond return source integration", () => {
  it("uses actual source facts and the return year for bond exclusion", () => {
    const input = fixture(2026);
    input.w2s[0].wages = "107200";
    const result = calculateFederalTax(input);
    expect(result.form8815?.sourceFactsVerified).toBe(true);
    expect(result.form8815?.taxYear).toBe(2026);
    expect(result.form8815?.modifiedAGI.toString()).toBe("109300");
    expect(result.form8815?.excludableSavingsBondInterest.toString()).toBe("1000");
    expect(result.agi.toString()).toBe("108300");
  });
  it("reconciles previously reported interest once before the current exclusion", () => {
    const input = fixture();
    input.savingsBondRedemptions[0].priorYearInterestReported = "500";
    input.form8815.priorYearInterestIncludedInCurrentStatements = "500";
    const result = calculateFederalTax(input);
    expect(result.scheduleB?.totalInterest.toString()).toBe("1600");
    expect(result.scheduleB?.previouslyReportedSavingsBondInterest.toString()).toBe("500");
    expect(result.form8815?.totalInterest.toString()).toBe("1500");
    expect(result.form8815?.excludableSavingsBondInterest.toString()).toBe("1500");
    expect(result.totalInterest.toString()).toBe("100");
    expect(result.agi.toString()).toBe("85100");
    expect(input.form1099Int[0].usSavingsBondInterest).toBe("2000");
    expect(() => calculateFederalTax({ ...input, form1099Int: [{ ...input.form1099Int[0], usSavingsBondInterest: "200" }] })).toThrow(/statement|Box.?3|reported interest/i);
    const insufficient = fixture();
    insufficient.form1099Int[0].usSavingsBondInterest = "1000";
    expect(() => calculateFederalTax(insufficient)).toThrow(/statement|Box.?3|exclusion/i);
  });
  it("uses actual territory and signed royalty MAGI adjustments", () => {
    const input = fixture();
    input.w2s[0].wages = "104900";
    input.form8815.puertoRicoIncomeExclusion = "5000";
    input.form8815.royaltyInterestAdjustment = "-500";
    const result = calculateFederalTax(input);
    expect(result.form8815?.modifiedAGI.toString()).toBe("111500");
    expect(result.form8815?.excludableSavingsBondInterest.toString()).toBe("400");
    for (const key of ["americanSamoaIncomeExclusion", "puertoRicoIncomeExclusion", "royaltyInterestAdjustment"] as const) {
      const missing = fixture(); delete missing.form8815[key];
      expect(() => calculateFederalTax(missing)).toThrow(/actual|known|MAGI/i);
    }
  });
});
