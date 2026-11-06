// Spec: spec/federal/savings-bond-return-identity.yaml
import { expect, it } from "vitest";
import Decimal from "decimal.js";
import { validateSavingsBondReturnIdentity } from "@/engine/forms/savings-bond-return-identity.js";
import { calculateForm8815 } from "@/engine/forms/form-8815.js";
import { Form8815Schema, SavingsBondRedemptionSchema } from "@/models/inputs.js";

function fixture() {
  return {
    taxYear: 2026, filingStatus: "married_filing_jointly" as const,
    primary: { firstName: "Jordan", lastName: "Example", ssn: "111-22-3333", dateOfBirth: "1980-01-01" },
    spouse: { firstName: "Taylor", lastName: "Example", ssn: "222-33-4444", dateOfBirth: "1982-06-01" },
    dependents: [{ firstName: "Alex", lastName: "Example", ssn: "333-44-5555", dateOfBirth: "2006-01-01" }],
    redemptions: [SavingsBondRedemptionSchema.parse({ sourceId: "bond", proceeds: "10000", bondType: "paper_ee", issueDate: "2005-01-01", redemptionDate: "2026-06-15", ownerDateOfBirth: "1980-01-01", registeredOwner: "taxpayer", ownershipConfirmed: true, faceValue: "16000", priorYearInterestReported: "0" })],
    facts: Form8815Schema.parse({ sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true, priorYearInterestIncludedInCurrentStatements: "0", educationExpenses: [{ sourceId: "college", beneficiaryName: "Alex Example", beneficiaryTaxId: "333-44-5555", relationship: "dependent", dependentClaimed: true, institutionName: "Synthetic College", institutionAddress: "1 College Rd", expenseType: "tuition_and_required_fees", paidTaxYear: 2026, amountPaid: "10000", qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }] }),
  };
}
it("binds actual bond owner dates to the return household", () => {
  expect(() => validateSavingsBondReturnIdentity(fixture())).not.toThrow();
  const bad = fixture(); bad.redemptions[0].ownerDateOfBirth = "1970-01-01";
  expect(() => validateSavingsBondReturnIdentity(bad)).toThrow(/owner.*birth|birth.*owner/i);
  bad.redemptions[0].ownerDateOfBirth = "1980-01-01"; bad.primary.dateOfBirth = "";
  expect(() => validateSavingsBondReturnIdentity(bad)).toThrow(/actual|birth/i);
  const spouse = fixture(); spouse.redemptions[0].registeredOwner = "spouse";
  expect(() => validateSavingsBondReturnIdentity(spouse)).toThrow(/owner.*birth|birth.*owner/i);
  spouse.redemptions[0].ownerDateOfBirth = spouse.spouse.dateOfBirth;
  expect(() => validateSavingsBondReturnIdentity(spouse)).not.toThrow();
  expect(() => validateSavingsBondReturnIdentity({ ...spouse, spouse: undefined })).toThrow(/spouse|household/i);
});
it("requires an explicit actual age-test owner for joint bonds", () => {
  const input = fixture(); input.redemptions[0].registeredOwner = "taxpayer_and_spouse";
  expect(() => validateSavingsBondReturnIdentity(input)).toThrow(/age.test owner/i);
  expect(() => calculateForm8815(input.redemptions, new Decimal("50000"), input.filingStatus, { taxYear: input.taxYear, facts: input.facts })).toThrow(/age.test owner/i);
  input.redemptions[0].ageTestOwner = "spouse";
  expect(() => validateSavingsBondReturnIdentity(input)).toThrow(/owner.*birth|birth.*owner/i);
  input.redemptions[0].ownerDateOfBirth = input.spouse.dateOfBirth;
  expect(() => validateSavingsBondReturnIdentity(input)).not.toThrow();
  // The named spouse was22 at issue; the older primary taxpayer is never substituted.
  expect(calculateForm8815(input.redemptions, new Decimal("50000"), input.filingStatus, { taxYear: input.taxYear, facts: input.facts }).excludableSavingsBondInterest.toFixed()).toBe("0");
  expect(() => validateSavingsBondReturnIdentity({ ...input, filingStatus: "single" })).toThrow(/married|spouse|joint/i);
  input.redemptions[0].registeredOwner = "taxpayer";
  expect(() => validateSavingsBondReturnIdentity(input)).toThrow(/age.test owner|registration/i);
});
it("reconciles education beneficiaries to actual claimed household members", () => {
  const input = fixture(); const expense = input.facts.educationExpenses?.[0];
  if (!expense) throw new Error("Missing synthetic expense");
  expense.beneficiaryTaxId = "999-88-7777";
  expect(() => validateSavingsBondReturnIdentity(input)).toThrow(/beneficiary|dependent/i);
  expense.beneficiaryTaxId = "333445555"; expense.beneficiaryName = "Unrelated Student";
  expect(() => validateSavingsBondReturnIdentity(input)).toThrow(/beneficiary|name/i);
  expense.beneficiaryName = "Alex Example";
  expect(() => validateSavingsBondReturnIdentity(input)).not.toThrow();
  input.dependents.push({ ...input.dependents[0] });
  expect(() => validateSavingsBondReturnIdentity(input)).toThrow(/unique|ambiguous/i);
  input.dependents.pop(); expense.relationship = "taxpayer";
  expect(() => validateSavingsBondReturnIdentity(input)).toThrow(/beneficiary|identity/i);
  expense.beneficiaryName = "Jordan Example"; expense.beneficiaryTaxId = input.primary.ssn;
  expect(() => validateSavingsBondReturnIdentity(input)).not.toThrow();
  expense.relationship = "spouse"; expense.beneficiaryName = "Taylor Example"; expense.beneficiaryTaxId = input.spouse.ssn;
  expect(() => validateSavingsBondReturnIdentity(input)).not.toThrow();
  expense.relationship = "other"; expense.beneficiaryName = "Other Person"; delete expense.beneficiaryTaxId;
  expect(() => validateSavingsBondReturnIdentity(input)).not.toThrow();
  expense.relationship = "dependent"; expense.dependentClaimed = false;
  expect(() => validateSavingsBondReturnIdentity(input)).not.toThrow();
});
it("preserves unknown identity facts without promoting legacy sources", () => {
  const input = fixture(); const expense = input.facts.educationExpenses?.[0];
  if (!expense) throw new Error("Missing synthetic expense");
  delete expense.beneficiaryTaxId;
  expect(Form8815Schema.parse(input.facts).educationExpenses?.[0].beneficiaryTaxId).toBeUndefined();
  expect(SavingsBondRedemptionSchema.parse(input.redemptions[0]).ageTestOwner).toBeUndefined();
  expect(() => validateSavingsBondReturnIdentity(input)).toThrow(/beneficiary|tax ID/i);
  const legacy = { ...input, taxYear: 2025, primary: {}, facts: undefined, redemptions: [SavingsBondRedemptionSchema.parse({ proceeds: "10000", interest: "2000", qualifiedExpenses: "10000" })] };
  expect(() => validateSavingsBondReturnIdentity(legacy)).not.toThrow();
  expect(() => validateSavingsBondReturnIdentity({ ...legacy, taxYear: 2026 })).toThrow(/actual|owner|source/i);
  expect(() => validateSavingsBondReturnIdentity({ ...legacy, redemptions: input.redemptions })).toThrow(/actual|owner|birth/i);
});
