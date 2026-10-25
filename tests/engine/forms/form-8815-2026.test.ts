/** Spec: spec/federal/form-8815.yaml. Official-source, synthetic taxpayer fixtures. */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8815 } from "@/engine/forms/form-8815.js";
import { SavingsBondRedemptionSchema, Form8815Schema } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";

function bond(overrides: Record<string, unknown> = {}) {
  return { sourceId: "bond-A", proceeds: "10000", bondType: "paper_ee", issueDate: "2005-01-01", redemptionDate: "2026-06-15", ownerDateOfBirth: "1980-12-31", registeredOwner: "taxpayer", ownershipConfirmed: true, faceValue: "16000", priorYearInterestReported: "0", ...overrides };
}
function expense(overrides: Record<string, unknown> = {}) {
  return { sourceId: "college-A", beneficiaryName: "Synthetic Student", relationship: "dependent", dependentClaimed: true, institutionName: "Synthetic College", institutionAddress: "1 College Rd, Example, NY10001", expenseType: "tuition_and_required_fees", paidTaxYear: 2026, amountPaid: "10000", qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "2000", ...overrides };
}
function facts(overrides: Record<string, unknown> = {}) { return { sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true, priorYearInterestIncludedInCurrentStatements: "0", educationExpenses: [expense()], ...overrides }; }
function calc(bonds = [bond()], sourceFacts = facts(), magi = "50000", filingStatus: FilingStatus = "single") {
  return calculateForm8815(bonds.map(value => SavingsBondRedemptionSchema.parse(value)), new Decimal(magi), filingStatus, { taxYear: 2026, facts: Form8815Schema.parse(sourceFacts) });
}
function audit(result: ReturnType<typeof calc>, id: string) { return result.lines.find(line => line.form === "Form 8815" && line.line === id)?.value.toFixed(); }

describe("Form8815 source-backed2026", () => {
  it("Form8815 reproduces the official beneficiary scholarship example", () => {
    const result = calc();
    for (const [id, value] of Object.entries({ "2": "10000", "3": "2000", "4": "8000", "5": "10000", "6": "2000", "7": "0.8", "8": "1600", "9": "50000", "10": "101800", "11": "0", "12": "0", "13": "0", "14": "1600" })) expect(audit(result, id)).toBe(value);
    expect(result.sourceFactsVerified).toBe(true);
    expect(result.taxYear).toBe(2026);
  });
  it("Form8815 uses independent2026 thresholds and exact phaseout boundaries", () => {
    const complete = facts({ educationExpenses: [expense({ beneficiaryBenefits: "0" })] });
    for (const status of ["single", "head_of_household", "qualifying_surviving_spouse"] as const) {
      expect(calc([bond()], complete, "101800", status).excludableSavingsBondInterest.toFixed()).toBe("2000");
      expect(calc([bond()], complete, "109300", status).excludableSavingsBondInterest.toFixed()).toBe("1000");
      expect(calc([bond()], complete, "116800", status).excludableSavingsBondInterest.toFixed()).toBe("0");
    }
    expect(calc([bond()], complete, "152650", "married_filing_jointly").excludableSavingsBondInterest.toFixed()).toBe("2000");
    expect(calc([bond()], complete, "167650", "married_filing_jointly").excludableSavingsBondInterest.toFixed()).toBe("1000");
    expect(calc([bond()], complete, "182650", "married_filing_jointly").excludableSavingsBondInterest.toFixed()).toBe("0");
    expect(calc([bond()], complete, "0", "married_filing_separately").excludableSavingsBondInterest.toFixed()).toBe("0");
  });
  it("Form8815 derives current interest from face values and prior reporting", () => {
    const result = calc([bond({ priorYearInterestReported: "500" }), bond({ sourceId: "bond-B", bondType: "electronic_ee", proceeds: "5000", faceValue: "4000", priorYearInterestReported: "100" }), bond({ sourceId: "bond-C", bondType: "series_i", proceeds: "3000", faceValue: "2000", priorYearInterestReported: "0" })]);
    for (const [id, value] of Object.entries({ "1": "18000", "2": "16000", "3": "8000", "4": "6000", "5": "14000", "6": "4000", "7": "600", "8": "3400" })) expect(audit(result, `6-worksheet-${id}`)).toBe(value);
    expect(result.totalInterest.toFixed()).toBe("3400");
    expect(result.excludableSavingsBondInterest.toFixed()).toBe("1511");
  });
  it("Form8815 coordinates education costs once across multiple bonds", () => {
    const result = calc([bond(), bond({ sourceId: "bond-B", proceeds: "5000", faceValue: "8000" })], facts({ educationExpenses: [expense({ amountPaid: "15000", directInstitutionBenefits: "1000", educationCreditExpenses: "4000", taxFreeDistributionExpenses: "1000", beneficiaryBenefits: "1000" })] }));
    expect(audit(result, "2")).toBe("9000");
    expect(audit(result, "3")).toBe("1000");
    expect(audit(result, "4")).toBe("8000");
    expect(result.excludableSavingsBondInterest.toFixed()).toBe("1600");
  });
  it("Form8815 distinguishes known ineligible ownership issue year and owner age", () => {
    for (const change of [{ bondType: "other" }, { issueDate: "1989-12-01", ownerDateOfBirth: "1950-01-01" }, { ownerDateOfBirth: "1981-01-02" }, { registeredOwner: "other" }, { ownershipConfirmed: false }]) expect(calc([bond(change)]).excludableSavingsBondInterest.toFixed()).toBe("0");
    expect(() => calc([bond({ issueDate: "2005-01-15", ownerDateOfBirth: "1981-01-10" })])).toThrow(/issue|first|month/i);
    expect(calc([bond({ ownerDateOfBirth: "1981-01-01" })]).excludableSavingsBondInterest.toFixed()).toBe("1600");
    expect(calc([bond({ registeredOwner: "spouse" })]).excludableSavingsBondInterest.toFixed()).toBe("0");
    expect(calc([bond({ registeredOwner: "spouse" })], facts(), "50000", "married_filing_jointly").excludableSavingsBondInterest.toFixed()).toBe("1600");
  });
  it("Form8815 rejects missing original source facts and fabricated qualification", () => {
    const raw = bond(); delete (raw as Record<string, unknown>).proceeds;
    expect(() => SavingsBondRedemptionSchema.parse(raw)).toThrow();
    expect(() => calc([bond({ sourceFactsComplete: false })])).toThrow(/original|source/i);
    const incomplete = SavingsBondRedemptionSchema.parse({ proceeds: "10000", interest: "2000", qualifiedExpenses: "8000" });
    expect(incomplete.sourceFactsComplete).toBe(false);
    expect(SavingsBondRedemptionSchema.parse(incomplete).sourceFactsComplete).toBe(false);
    expect(() => calc([incomplete])).toThrow(/source|actual/i);
    expect(() => calc([bond()], facts({ sourceFactsConfirmed: false }))).toThrow(/source/i);
  });
  it.each(["issueDate", "redemptionDate", "ownerDateOfBirth", "registeredOwner", "ownershipConfirmed", "faceValue", "priorYearInterestReported"])("Form8815 rejects unknown bond fact %s", key => { expect(() => calc([bond({ [key]: undefined })])).toThrow(); });
  it("Form8815 requires actual current statement reconciliation", () => {
    expect(() => calc([bond()], facts({ currentStatementReconciliationConfirmed: undefined }))).toThrow(/statement|reconcil/i);
    expect(() => calc([bond()], facts({ priorYearInterestIncludedInCurrentStatements: undefined }))).toThrow(/statement|actual/i);
    expect(() => calc([bond({ priorYearInterestReported: "100" })], facts({ priorYearInterestIncludedInCurrentStatements: "101" }))).toThrow(/previous|prior|interest/i);
    expect(calc([bond({ priorYearInterestReported: "100" })], facts({ priorYearInterestIncludedInCurrentStatements: "100" })).totalInterest.toFixed()).toBe("1900");
  });
  it("Form8815 rejects duplicate sources and conflicting legacy expense aliases", () => {
    expect(() => calc([bond(), bond()])).toThrow(/duplicate/i);
    expect(() => calc([bond()], facts({ educationExpenses: [expense(), expense()] }))).toThrow(/duplicate/i);
    expect(() => calc([bond({ qualifiedExpenses: "10000" })])).toThrow(/legacy|expense/i);
    expect(() => calc([bond({ interest: "999" })])).toThrow(/interest|reconcile/i);
  });
  it("Form8815 known ineligible expenses remain zero while unknown coordination rejects", () => {
    for (const change of [{ qualificationConfirmed: false }, { relationship: "other" }, { dependentClaimed: false }]) expect(calc([bond()], facts({ educationExpenses: [expense(change)] })).excludableSavingsBondInterest.toFixed()).toBe("0");
    expect(() => calc([bond()], facts({ educationExpenses: [expense({ coordinationConfirmed: undefined })] }))).toThrow();
    expect(() => calc([bond()], facts({ educationExpenses: [expense({ educationCreditExpenses: "20000" })] }))).toThrow(/expense|cost/i);
  });
  it("Form8815 permits actual qualified plan contributions and prevents year or monetary contradictions", () => {
    expect(calc([bond()], facts({ educationExpenses: [expense({ relationship: "taxpayer", expenseType: "qtp_contribution", beneficiaryBenefits: "0" })] })).excludableSavingsBondInterest.toFixed()).toBe("2000");
    for (const change of [{ redemptionDate: "2025-12-31" }, { issueDate: "2026-07-01" }, { issueDate: "2005-02-30" }, { faceValue: "30000" }, { priorYearInterestReported: "3000" }, { proceeds: "-1" }]) expect(() => calc([bond(change)])).toThrow();
    expect(() => calc([bond()], facts({ educationExpenses: [expense({ paidTaxYear: 2025 })] }))).toThrow(/year/i);
  });
});
