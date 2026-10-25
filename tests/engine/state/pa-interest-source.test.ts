/** Spec: spec/state/pa-orchestrator.yaml, exclude-us-gov-interest. */
import { describe, expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { calculateFederalTax } from "@/engine/federal.js";

function source(box1: string, box3: string) {
  return { payer: "Synthetic bank and Treasury custodian", interestIncome: box1, usSavingsBondInterest: box3 };
}
function input(forms = [source("100", "2000")]) {
  return TaxYearInputSchema.parse({ taxpayer: { taxYear: 2025, filingStatus: "single", primary: { firstName: "Synthetic", lastName: "Resident", ssn: "111-22-3333", dateOfBirth: "1980-01-01" }, address: { street: "1 Example Street", city: "Harrisburg", state: "PA", zip: "17101" }, dependents: [] }, form1099Int: forms });
}

describe("PA interest source boxes and federal reconciliation", () => {
  it("PA preserves Box 1 interest when a separate Box 3 is reported", () => {
    const facts = input();
    const federal = calculateFederalTax(facts);
    const result = calculatePAReturn(facts);
    expect(federal.totalInterest.toFixed(0)).toBe("2100");
    expect(result.scheduleA?.line1.toFixed(0)).toBe("2100");
    expect(result.scheduleA?.line7.toFixed(0)).toBe("2000");
    expect(result.scheduleA?.line16.toFixed(0)).toBe("100");
    expect(result.scheduleSP.nontaxableIncome.toFixed(0)).toBe("2000");
    expect(result.scheduleSP.eligibilityIncome.toFixed(0)).toBe("2100");
  });

  it.each([
    ["0", "0", "0", "0", "0"],
    ["0", "8000", "8000", "8000", "0"],
    ["1000", "1000", "2000", "1000", "1000"],
    ["5000", "3000", "8000", "3000", "5000"],
    ["100.49", "2000.49", "2101", "2000", "101"],
    ["100.49", "2000.50", "2101", "2001", "100"],
  ])("applies separate source boxes %s/%s and PA line rounding", (box1, box3, line1, line7, taxable) => {
    const result = calculatePAReturn(input([source(box1, box3)]));
    expect(result.scheduleA?.line1.toFixed(0)).toBe(line1);
    expect(result.scheduleA?.line7.toFixed(0)).toBe(line7);
    expect(result.mappedIncome.interest.toFixed(0)).toBe(taxable);
  });

  it("aggregates multiple sources before rounding without subtracting exempt interest twice", () => {
    const result = calculatePAReturn(input([source("100.25", "500.25"), source("200.25", "600.25")]));
    expect(result.scheduleA?.line1.toFixed(0)).toBe("1401");
    expect(result.scheduleA?.line7.toFixed(0)).toBe("1101");
    expect(result.mappedIncome.interest.toFixed(0)).toBe("300");
    expect(result.exclusions.usGovInterest.toFixed(2)).toBe("1100.50");
  });

  it.each([
    ["0", "0", "2000", "100", "0"],
    ["500", "500", "1500", "100", "0"],
    ["500", "0", "1500", "600", "500"],
  ])("reconciles an actual bond exclusion and prior reported interest %s/%s", (priorReported, priorIncluded, exclusion, line1, line7) => {
    const facts = TaxYearInputSchema.parse({
      ...input(),
      savingsBondRedemptions: [{
        sourceId: "synthetic-bond", proceeds: "10000", bondType: "paper_ee",
        issueDate: "2005-01-01", redemptionDate: "2025-06-15",
        ownerDateOfBirth: "1980-01-01", registeredOwner: "taxpayer",
        ownershipConfirmed: true, faceValue: "16000", priorYearInterestReported: priorReported,
      }],
      form8815: {
        sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true,
        priorYearInterestIncludedInCurrentStatements: priorIncluded,
        americanSamoaIncomeExclusion: "0", puertoRicoIncomeExclusion: "0",
        royaltyInterestAdjustment: "0",
        educationExpenses: [{
          sourceId: "synthetic-college", beneficiaryName: "Synthetic Resident",
          relationship: "taxpayer", institutionName: "Synthetic College",
          institutionAddress: "1 College Rd, Harrisburg, PA 17101",
          expenseType: "tuition_and_required_fees", paidTaxYear: 2025,
          amountPaid: "10000", qualificationConfirmed: true, coordinationConfirmed: true,
          directInstitutionBenefits: "0", educationCreditExpenses: "0",
          taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0",
        }],
      },
    });
    const federal = calculateFederalTax(facts);
    const result = calculatePAReturn(facts);
    expect(federal.form8815?.excludableSavingsBondInterest.toFixed(0)).toBe(exclusion);
    expect(result.scheduleA?.line1.toFixed(0)).toBe(line1);
    expect(result.scheduleA?.line1.toFixed(0)).toBe(federal.totalInterest.toFixed(0));
    expect(result.scheduleA?.line7.toFixed(0)).toBe(line7);
    expect(result.mappedIncome.interest.toFixed(0)).toBe("100");
    expect(result.scheduleSP.nontaxableIncome.toFixed(0)).toBe("2000");
    expect(result.scheduleSP.eligibilityIncome.toFixed(0)).toBe("2100");
    expect(facts.form1099Int[0].usSavingsBondInterest).toBe("2000");
  });
});
