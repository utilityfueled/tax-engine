// Spec: spec/federal/form-8815.yaml reference-packet-readiness.
import { expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { assessReturnReadiness } from "@/utils/return-readiness.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { actualSavingsBondData } from "../fixtures/guided-savings-bond.js";

function original(wages = "50000", withBond = true) {
  const facts = actualSavingsBondData();
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary: {
      ...simpleW2Fixture.taxpayer.primary, firstName: "Jordan", lastName: "Example", ssn: "111-22-3333", dateOfBirth: "1990-02-15",
    } },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages, federalWithheld: "100000" }],
    ...(withBond ? {
      form1099Int: [{ payer: "Synthetic Treasury", interestIncome: "0", usSavingsBondInterest: "2000" }],
      savingsBondRedemptions: facts.redemptions,
      form8815: { ...facts, educationExpenses: facts.educationExpenses.map(row => ({ ...row, paidTaxYear: 2025 })) },
    } : {}),
  });
}

it("keeps positive savings-bond exclusion packets partial until an official mapping is qualified", () => {
  const taxInput = original(), federalResult = calculateFederalTax(taxInput);
  expect(federalResult.form8815?.excludableSavingsBondInterest.toFixed()).toBe("1500");
  for (const includedForms of [
    ["f1040-filled.pdf", "f8815-reference-filled.pdf"],
    ["f1040-filled.pdf"],
    ["f1040-filled.pdf", "f8815-filled.pdf"],
  ]) {
    const assessment = assessReturnReadiness({ taxInput, federalResult, includedForms });
    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.lineCompleteness).toBe("supported");
    expect(assessment.filingQualified).toBe(false);
    expect(assessment.businessRuleValidation).toBe("not-validated");
    expect(assessment.findings).toContain(includedForms.includes("f8815-reference-filled.pdf")
      ? "Form 8815 is included as a reference summary, not an official filed Form 8815."
      : "Form 8815 applies, but no qualified official Form 8815 or reference summary was generated.");
  }
});

it("does not add a Form8815 packet requirement for zero or absent exclusions", () => {
  for (const taxInput of [original("200000"), original("50000", false)]) {
    const federalResult = calculateFederalTax(taxInput);
    expect(federalResult.form8815?.excludableSavingsBondInterest.gt(0) ?? false).toBe(false);
    const assessment = assessReturnReadiness({ taxInput, federalResult, includedForms: ["f1040-filled.pdf"] });
    expect(assessment.packetCompleteness).toBe("supported");
    expect(assessment.findings.some(finding => finding.includes("Form 8815"))).toBe(false);
    expect(assessment.filingQualified).toBe(false);
  }
});
