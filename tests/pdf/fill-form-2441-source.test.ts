// Spec: spec/federal/form-2441.yaml; official final 2025 Form2441 lines4-11.
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm2441, type Form2441Input } from "@/engine/forms/form-2441.js";
import { fillForm2441, FORM_2441_FIELDS as F } from "@/pdf/fill-form-2441.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
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
