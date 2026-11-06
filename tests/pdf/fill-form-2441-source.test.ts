// Spec: spec/federal/form-2441.yaml; official final 2025 Form2441 lines4-11.
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateForm2441Benefits } from "@/engine/forms/form-2441-benefits.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm2441, type Form2441Input } from "@/engine/forms/form-2441.js";
import { fillForm2441, FORM_2441_FIELDS as F } from "@/pdf/fill-form-2441.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const source = (overrides: Partial<Form2441Input> = {}) => calculateForm2441({
  taxYear: 2025, filingStatus: "married_filing_jointly", careExpenses: d("6000"), qualifyingIndividuals: 2,
  earnedIncome: d("30000"), spouseEarnedIncome: d("2000"), agi: d("19000"),
  earnedIncomeFactsVerified: true, priorYearExpenseCredit: d("40.25"), taxLiabilityLimit: d("123"), ...overrides,
});
const input = { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer,
  filingStatus: "married_filing_jointly" as const,
  spouse: { firstName: "Alex", lastName: "Doe", ssn: "999-88-7777", dateOfBirth: "1990-01-01" },
} };
const base = calculateFederalTax(input);
const fill = (form2441 = source()) => fillForm2441(input, { ...base, agi: d("19000"), form2441 }, "forms/blank/2025/f2441.pdf");

describe("Form2441 actual audited review fields", () => {
  it("Form2441 review preserves provider and person source records with continuations", async () => {
    const dependentCare = { expenses: "10000", qualifyingIndividuals: 4, sourceFactsConfirmed: true,
      receivedBenefits: false, usesDeemedIncome: true, primaryEarnedIncome: "30000", spouseEarnedIncome: "2000",
      excludedDependentCareBenefits: "0", priorYearExpenseCredit: "40.25",
      providers: ["1000", "2000", "3000", "4000"].map((amountPaid, i) => ({ name: `Actual Provider ${i + 1}`, address: `${i + 1} Source St, Austin TX 78701`,
        identifierType: "tin" as const, taxId: `12-345678${i}`, householdEmployee: i === 3, amountPaid })),
      qualifyingPersons: ["1000", "2000", "3000", "4000"].map((qualifiedExpenses, i) => ({ firstName: `Person${i + 1}`, lastName: "Example",
        identifierType: "tax_id" as const, taxId: `999-88-700${i}`, over12Disabled: i === 3, qualifyingPersonConfirmed: true, qualifiedExpenses })),
    };
    const actualInput = { ...input, dependentCare };
    const actualResult = { ...base, agi: d("19000"), form2441: source({ careExpenses: d("10000"), qualifyingIndividuals: 4 }) };
    const before = JSON.stringify(actualInput);
    const doc = await fillForm2441(actualInput, actualResult, "forms/blank/2025/f2441.pdf");
    const form = doc.getForm();
    expect(form.getTextField(F.provider1Name).getText()).toBe("Actual Provider 4");
    expect(form.getTextField(F.provider1Amount).getText()).toBe("4000");
    expect(form.getCheckBox(F.provider1HouseholdYes).isChecked()).toBe(true);
    expect(form.getCheckBox(F.provider1HouseholdNo).isChecked()).toBe(false);
    expect(form.getTextField(F.qp1FirstName).getText()).toBe("Person4");
    expect(form.getTextField(F.qp1Expenses).getText()).toBe("4000");
    expect(form.getCheckBox(F.qp1Disabled).isChecked()).toBe(true);
    expect(form.getCheckBox(F.studentOrDisabled).isChecked()).toBe(true);
    expect(form.getCheckBox("topmostSubform[0].Page1[0].PartI[0].c1_3[0]").isChecked()).toBe(true);
    expect(form.getCheckBox("topmostSubform[0].Page1[0].c1_7[0]").isChecked()).toBe(true);
    expect(doc.getPageCount()).toBeGreaterThan(2);
    expect(JSON.stringify(actualInput)).toBe(before);
    const review = await fillForm2441(redactReviewIdentifiers(actualInput), actualResult, "forms/blank/2025/f2441.pdf");
    expect(review.getForm().getTextField(F.provider1TIN).getText() ?? "").toBe("");
    expect(review.getForm().getTextField(F.qp1SSN).getText() ?? "").toBe("");
  });
  it("Form2441 review prints audited income and tentative credit", async () => {
    const original = await fill();
    const doc = await PDFDocument.load(await original.save());
    for (const [line, value] of [["line3", "6000"], ["line4", "30000"], ["line5", "2000"], ["line6", "2000"],
      ["line7", "19000"], ["line8decimal", "33"], ["line9a", "660"], ["line9b", "40"], ["line9c", "700"],
      ["line10", "123"], ["line11", "123"]] as const) expect(doc.getForm().getTextField(F[line]).getText(), line).toBe(value);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getSubject()).toBe(REVIEW_PDF_NOTICE);
  });

  it("preserves unknown historical income and prior-year facts instead of reconstructing them", async () => {
    const unknown = await fill(source({ earnedIncomeFactsVerified: false, priorYearExpenseCredit: undefined }));
    for (const key of ["line4", "line5", "line9b", "line9c"] as const) expect(unknown.getForm().getTextField(F[key]).getText() ?? "").toBe("");
    expect(unknown.getForm().getTextField(F.line9a).getText()).toBe("660");
    const known = await fill(source({ priorYearExpenseCredit: d("0") }));
    expect(known.getForm().getTextField(F.line9b).getText()).toBe("0");
    expect(known.getForm().getTextField(F.line9c).getText()).toBe("660");
  });

  it("preserves actual provider identification exceptions and rejects incomplete sources", async () => {
    const dependentCare = { expenses: "5000", qualifyingIndividuals: 1, sourceFactsConfirmed: true,
      receivedBenefits: true, usesDeemedIncome: false, excludedDependentCareBenefits: "0",
      providers: [
        { name: "Employer", address: "Actual employer address", identifierType: "employer_furnished" as const, householdEmployee: false, amountPaid: "0" },
        { name: "Exempt center", address: "2 Source St", identifierType: "tax_exempt" as const, householdEmployee: false, amountPaid: "2000" },
        { name: "Provider with missing ID", address: "3 Source St", identifierType: "withheld" as const, householdEmployee: true, amountPaid: "3000", dueDiligenceStatement: "Requested signed Form W-10 on two documented dates; provider declined." },
      ],
      qualifyingPersons: [{ firstName: "Casey", lastName: "Example", identifierType: "died" as const, over12Disabled: false, qualifyingPersonConfirmed: true, qualifiedExpenses: "5000" }],
    };
    // Actual employer benefits were already included in Box1; PartIII must still
    // be retained rather than rendering only the known benefits-received answer.
    const dependentCareBenefits = { sourceFactsConfirmed: true, exclusionEligibilityConfirmed: true, usesDeemedIncome: false, providers: dependentCare.providers,
      employeeBenefits: [{ sourceId: "w2:0", owner: "primary" as const, benefitsReported: "5000", alreadyIncludedInWages: "5000", priorYearCarryoverUsed: "0", forfeited: "0", carriedForward: "0" }],
      selfEmployedBenefits: [], deductionAllocations: [], planExclusionLimit: "5000", qualifiedExpensesIncurred: "5000", primaryEarnedIncome: "30000", spouseEarnedIncome: "2000", spouseDiedDuringYear: false,
      earnedIncomeWorksheetConfirmed: true, qualifyingIndividuals: 1, qualifiedExpensesPaidForCredit: "5000", creditExpenseCoordinationConfirmed: true };
    const actualInput = { ...input, w2s: [{ ...input.w2s[0], accountHolder: "primary" as const, box10DependentCareBenefits: "5000" }], dependentCare, dependentCareBenefits };
    const actualResult = { ...base, agi: d("19000"), form2441: source({ careExpenses: d("5000"), qualifyingIndividuals: 1, dependentCareBenefits }),
      form2441Benefits: calculateForm2441Benefits({ taxYear: 2025, filingStatus: "married_filing_jointly", facts: dependentCareBenefits }) };
    const original = await fillForm2441(actualInput, actualResult, "forms/blank/2025/f2441.pdf");
    const doc = await PDFDocument.load(await original.save());
    expect(doc.getForm().getTextField(F.provider1TIN).getText()).toBe("See Attached Statement");
    expect(doc.getForm().getTextField(F.provider2TIN).getText()).toBe("Tax-Exempt");
    expect(doc.getForm().getTextField(F.provider3Address).getText()).toBe("See W-2");
    expect(doc.getForm().getTextField(F.provider3Amount).getText()).toBe("0");
    expect(doc.getForm().getTextField(F.qp1SSN).getText()).toBe("Died");
    expect(doc.getPageCount()).toBe(3);
    for (const bad of [
      { ...dependentCare, sourceFactsConfirmed: false },
      { ...dependentCare, qualifyingIndividuals: 2 },
      { ...dependentCare, providers: dependentCare.providers.map(provider => ({ ...provider, amountPaid: "NaN" })) },
      { ...dependentCare, providers: dependentCare.providers.map(provider => ({ ...provider, householdEmployee: true })) },
      { ...dependentCare, providers: dependentCare.providers.map(provider => ({ ...provider, dueDiligenceStatement: "" })) },
      { ...dependentCare, qualifyingPersons: dependentCare.qualifyingPersons.map(person => ({ ...person, qualifiedExpenses: "4999.99" })) },
    ]) await expect(fillForm2441({ ...actualInput, dependentCare: bad }, actualResult, "forms/blank/2025/f2441.pdf")).rejects.toThrow(/source|record/i);
  });

  it("rejects missing duplicate nonfinite wrong-form and contradictory audited amounts", async () => {
    const original = source();
    const amount = original.lines.find(line => line.line === "9a");
    if (!amount) throw new Error("Missing fixture audit");
    for (const form2441 of [
      { ...original, lines: original.lines.filter(line => line.line !== "10") },
      { ...original, lines: [...original.lines, amount] },
      { ...original, lines: original.lines.map(line => line.line === "9a" ? { ...line, value: d("NaN") } : line) },
      { ...original, lines: original.lines.map(line => line.line === "9a" ? { ...line, form: "Other form" } : line) },
      { ...original, credit: d("122") },
      { ...original, lines: original.lines.filter(line => line.line !== "9b") },
    ]) await expect(fill(form2441)).rejects.toThrow(/audit/i);
  });
});
