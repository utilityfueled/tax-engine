/** Specs: educator-education-exclusions.yaml; savings-bond-income-ownership.yaml. */
import { describe, expect, it } from "vitest";
import { reconcileEducatorEducationExclusions } from "@/engine/forms/educator-education-exclusions.js";
import { calculateForm8815 } from "@/engine/forms/form-8815.js";
import { EducatorExpenseSourceSchema, Form8815Schema, SavingsBondRedemptionSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";

function bond(sourceId: string, registeredOwner: "taxpayer" | "spouse" | "taxpayer_and_spouse", changes: Record<string, unknown> = {}) {
  return SavingsBondRedemptionSchema.parse({ sourceId, proceeds: "10000", bondType: "paper_ee", issueDate: "2005-01-01", redemptionDate: "2026-06-15", ownerDateOfBirth: "1980-01-01", registeredOwner, ...(registeredOwner === "taxpayer_and_spouse" ? { ageTestOwner: "taxpayer" } : {}), ownershipConfirmed: true, faceValue: "16000", priorYearInterestReported: "0", ...changes });
}
function ownership(changes: Record<string, unknown> = {}) {
  return { taxpayerPurchaseFunds: "6000", spousePurchaseFunds: "2000", taxpayerPriorYearInterestReported: "100", spousePriorYearInterestReported: "400", communityProperty: false, ownershipUnchangedSinceIssueConfirmed: true, sourceFactsConfirmed: true, sourceReference: "Private original purchase and reporting records", ...changes };
}
function educator(accountHolder: "primary" | "spouse", excludedSavingsBondInterest: string) {
  return EducatorExpenseSourceSchema.parse({ accountHolder, taxYear: 2026, sourceFactsConfirmed: true, excludedSavingsBondInterest, nontaxableQualifiedTuitionProgramAmount: "0", nontaxableCoverdellEarnings: "0" });
}
function input(redemptions: ReturnType<typeof bond>[], primary: string, spouse: string, magi = "50000") {
  const facts = Form8815Schema.parse({ sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true, priorYearInterestIncludedInCurrentStatements: "0", educationExpenses: [{ sourceId: "college", beneficiaryName: "Synthetic Student", relationship: "taxpayer", institutionName: "Synthetic College", institutionAddress: "1 College Road", expenseType: "tuition_and_required_fees", paidTaxYear: 2026, amountPaid: "30000", qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }] });
  return { taxYear: 2026, filingStatus: "married_filing_jointly" as const, savingsBondRedemptions: redemptions, savingsBondResult: calculateForm8815(redemptions, d(magi), "married_filing_jointly", { taxYear: 2026, facts }), educatorSources: [educator("primary", primary), educator("spouse", spouse)] };
}

describe("actual bond income ownership for educator exclusions", () => {
  it("preserves unknown ownership facts and exact source amounts", () => {
    expect(bond("a", "taxpayer_and_spouse").incomeOwnership).toBeUndefined();
    const partial = bond("a", "taxpayer_and_spouse", { incomeOwnership: { taxpayerPurchaseFunds: "9007199254740993.03", communityProperty: false } });
    expect(partial.incomeOwnership).toEqual({ taxpayerPurchaseFunds: "9007199254740993.03", communityProperty: false });
  });
  it("attributes fully excluded mixed-owner interest without splitting a partial exclusion", () => {
    const redemptions = [bond("a", "taxpayer", { proceeds: "10000.25" }), bond("b", "spouse", { proceeds: "9999.75" })];
    const full = input(redemptions, "2000.25", "1999.75");
    expect(full.savingsBondResult.excludableSavingsBondInterest.toFixed()).toBe("4000");
    expect(reconcileEducatorEducationExclusions(full).ownerExclusions.map(row => row.savingsBondInterest.toFixed())).toEqual(["2000.25", "1999.75"]);
    expect(() => reconcileEducatorEducationExclusions(input(redemptions, "1500", "1500", "160150"))).toThrow(/unresolved.*allocation/i);
  });
  it("uses joint purchase funds and actual owner prior reporting", () => {
    // $8,000 principal: contributions 6,000/2,000 give lifetime interest
    // 1,500/500. Actual prior reports 100/400 leave current 1,400/100.
    const redemptions = [bond("a", "taxpayer_and_spouse", { priorYearInterestReported: "500", incomeOwnership: ownership() })];
    const data = input(redemptions, "1400", "100");
    const before = JSON.stringify(data);
    const result = reconcileEducatorEducationExclusions(data);
    expect(result.ownerExclusions.map(row => row.savingsBondInterest.toFixed())).toEqual(["1400", "100"]);
    expect(JSON.stringify(result)).not.toContain("Private original");
    expect(JSON.stringify(data)).toBe(before);
    // One purchaser owns all current interest even though registration is joint.
    // At MAGI160,150, 2026 excess7,500 /30,000 is25%; 1,500 *75%=1,125.
    const sole = [bond("a", "taxpayer_and_spouse", { priorYearInterestReported: "500", incomeOwnership: ownership({ taxpayerPurchaseFunds: "8000", spousePurchaseFunds: "0", taxpayerPriorYearInterestReported: "500", spousePriorYearInterestReported: "0" }) })];
    expect(reconcileEducatorEducationExclusions(input(sole, "1125", "0", "160150")).ownerExclusions[0]?.savingsBondInterest.toFixed()).toBe("1125");
  });
  it("rejects unknown ownership history and unresolved allocation boundaries", () => {
    for (const mutation of [
      { sourceFactsConfirmed: undefined }, { sourceReference: "" }, { communityProperty: undefined }, { communityProperty: true },
      { ownershipUnchangedSinceIssueConfirmed: false }, { taxpayerPurchaseFunds: undefined }, { taxpayerPurchaseFunds: "6001" },
      { spousePurchaseFunds: "-1" }, { taxpayerPriorYearInterestReported: undefined }, { taxpayerPriorYearInterestReported: "99" },
      { taxpayerPriorYearInterestReported: "1600", spousePriorYearInterestReported: "0" },
    ]) {
      const redemptions = [bond("a", "taxpayer_and_spouse", { priorYearInterestReported: "500", incomeOwnership: ownership(mutation) })];
      expect(() => reconcileEducatorEducationExclusions(input(redemptions, "1400", "100"))).toThrow(/actual|ownership|source|prior|purchase|community|history|allocation/i);
    }
    const cents = [bond("a", "taxpayer", { proceeds: "10000.10" }), bond("b", "spouse")];
    expect(() => reconcileEducatorEducationExclusions(input(cents, "2000.10", "2000"))).toThrow(/rounding|source.*interest/i);
    const joint = [bond("a", "taxpayer_and_spouse", { priorYearInterestReported: "500", incomeOwnership: ownership() })];
    expect(() => reconcileEducatorEducationExclusions(input(joint, "1050", "75", "160150"))).toThrow(/unresolved.*allocation/i);
    const excessivePrior = [bond("a", "taxpayer_and_spouse", { priorYearInterestReported: "600", incomeOwnership: ownership({ taxpayerPriorYearInterestReported: "0", spousePriorYearInterestReported: "600" }) })];
    expect(() => reconcileEducatorEducationExclusions(input(excessivePrior, "1500", "0"))).toThrow(/owner prior interest/i);
    const recurring = [bond("a", "taxpayer_and_spouse", { proceeds: "4000", faceValue: "6000", incomeOwnership: ownership({ taxpayerPurchaseFunds: "1000", spousePurchaseFunds: "2000", taxpayerPriorYearInterestReported: "0", spousePriorYearInterestReported: "0" }) })];
    expect(() => reconcileEducatorEducationExclusions(input(recurring, "333.33", "666.67"))).toThrow(/rounding/i);
    const soleWithStaleJointFacts = [bond("a", "taxpayer", { incomeOwnership: ownership() })];
    expect(() => reconcileEducatorEducationExclusions(input(soleWithStaleJointFacts, "2000", "0"))).toThrow(/conflict.*sole/i);
  });
});
