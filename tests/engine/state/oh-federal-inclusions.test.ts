/** Spec: spec/state/oh-input-adapter.yaml; final2025 Ohio booklet lines26/28 and care worksheet. */
import { describe, expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm2441 } from "@/engine/forms/form-2441.js";
import { buildOhioResidentReturnInput } from "@/engine/state/oh-input-adapter.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

describe("Ohio federal source inclusion limits", () => {
  it("Ohio deducts only the actual taxable state refund", () => {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
      form1099G: [{ payer: "Synthetic state", unemploymentCompensation: "0", stateLocalIncomeTaxRefund: "2000", refundTaxYear: 2024 }],
      taxableRefundWorksheet: { priorTaxYear: 2024, priorYearPropertyTaxesPaid: "0", priorYearItemized: true,
        priorYearItemizedTotal: "15000", priorYearStandardDeduction: "14600", priorYearStateLocalTaxesPaid: "8000", priorYearFilingStatus: "single" } });
    const result = calculateFederalTax(input);
    expect(result.schedule1?.taxableRefunds.toString()).toBe("400");
    expect(d(buildOhioResidentReturnInput(input, result).stateMunicipalTaxRefunds).toString()).toBe("400");
    const standard = TaxYearInputSchema.parse({ ...input, taxableRefundWorksheet: { ...input.taxableRefundWorksheet, priorYearItemized: false } });
    expect(d(buildOhioResidentReturnInput(standard, calculateFederalTax(standard)).stateMunicipalTaxRefunds).toString()).toBe("0");
    expect(d(buildOhioResidentReturnInput(input, result, { stateMunicipalTaxRefunds: "0" }).stateMunicipalTaxRefunds).toString()).toBe("0");
  });
  it("Ohio never deducts savings-bond interest already excluded federally", () => {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: "1980-01-01" } },
      form1099Int: [{ payer: "Treasury", interestIncome: "100", usSavingsBondInterest: "2000" }],
      savingsBondRedemptions: [{ sourceId: "synthetic-bond", proceeds: "10000", bondType: "paper_ee", issueDate: "2005-01-01", redemptionDate: "2025-06-15", ownerDateOfBirth: "1980-01-01", registeredOwner: "taxpayer", ownershipConfirmed: true, faceValue: "16000", priorYearInterestReported: "500" }],
      form8815: { sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true, priorYearInterestIncludedInCurrentStatements: "500", americanSamoaIncomeExclusion: "0", puertoRicoIncomeExclusion: "0", royaltyInterestAdjustment: "0", educationExpenses: [{ sourceId: "college", beneficiaryName: "Jane Doe", beneficiaryTaxId: simpleW2Fixture.taxpayer.primary.ssn, relationship: "taxpayer", institutionName: "Synthetic College", institutionAddress: "1 College Rd", expenseType: "tuition_and_required_fees", paidTaxYear: 2025, amountPaid: "10000", qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }] } });
    const federal = calculateFederalTax(input);
    expect(federal.totalInterest.toString()).toBe("100");
    expect(federal.form8815?.excludableSavingsBondInterest.toString()).toBe("1500");
    expect(d(buildOhioResidentReturnInput(input, federal).federalInterestExemptFromOhio).toString()).toBe("0");
  });
  it("Ohio forwards actual Form2441 line9c and refuses an unknown source", () => {
    const input = TaxYearInputSchema.parse(simpleW2Fixture);
    const form2441 = calculateForm2441({ careExpenses: d(3000), qualifyingIndividuals: 1, earnedIncome: d(25000), agi: d(19000), priorYearExpenseCredit: d(40), taxLiabilityLimit: d(123) });
    const federal = { ...calculateFederalTax(input), form2441 };
    const ohio = buildOhioResidentReturnInput(input, federal);
    expect(d(ohio.federal2441Line9c).toString()).toBe("1030");
    expect(d(ohio.federal2441Line11).toString()).toBe("123");
    const missing = { ...federal, form2441: { ...form2441, lines: form2441.lines.filter(line => line.line !== "9c") } };
    expect(() => buildOhioResidentReturnInput(input, missing)).toThrow(/2441.*9c/);
    expect(d(buildOhioResidentReturnInput(input, missing, { federal2441Line9c: "0" }).federal2441Line9c).toString()).toBe("0");
    const row = form2441.lines.find(line => line.line === "9c");
    if (!row) throw new Error("Expected synthetic worksheet credit audit");
    for (const lines of [[...form2441.lines, row],
      form2441.lines.map(line => line.line === "9c" ? { ...line, value: d("NaN") } : line),
      form2441.lines.map(line => line.line === "9c" ? { ...line, value: d("-1") } : line)]) {
      expect(() => buildOhioResidentReturnInput(input, { ...federal, form2441: { ...form2441, lines } })).toThrow(/2441.*9c/);
    }
  });
});
