// Spec: spec/federal/form-2441-benefits.yaml review-pdf-*.
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema, type DependentCareBenefits } from "@/models/inputs.js";
import { fillForm2441, FORM_2441_FIELDS as F } from "@/pdf/fill-form-2441.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import * as pdfUtils from "@/pdf/pdf-utils.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const blank = "forms/blank/2025/f2441.pdf";
const provider = { name: "Actual Care Provider", address: "12 Source St, Seattle WA 98101", identifierType: "tin" as const, taxId: "12-9876543", householdEmployee: false, amountPaid: "5000" };
const facts = (patch: Partial<DependentCareBenefits> = {}): DependentCareBenefits => ({
  sourceFactsConfirmed: true, exclusionEligibilityConfirmed: true, usesDeemedIncome: false, providers: [provider],
  employeeBenefits: [{ sourceId: "w2:0", owner: "primary", benefitsReported: "2000", alreadyIncludedInWages: "0", priorYearCarryoverUsed: "0", forfeited: "0", carriedForward: "0" }],
  selfEmployedBenefits: [], deductionAllocations: [], planExclusionLimit: "5000", qualifiedExpensesIncurred: "5000",
  primaryEarnedIncome: "85000", earnedIncomeWorksheetConfirmed: true, qualifyingIndividuals: 1, qualifiedExpensesPaidForCredit: "0", creditExpenseCoordinationConfirmed: true, ...patch,
});
const input = (benefits = facts(), patch: Record<string, unknown> = {}) => TaxYearInputSchema.parse({ ...simpleW2Fixture,
  w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", box10DependentCareBenefits: benefits.employeeBenefits?.[0]?.benefitsReported ?? "0" }], dependentCareBenefits: benefits, ...patch });
const creditSource = (priorYearExpenseCredit = "0") => ({ expenses: "5000", qualifyingIndividuals: 1, primaryEarnedIncome: "85000", eligibilityConfirmed: true,
  priorYearExpenseCredit, sourceFactsConfirmed: true, receivedBenefits: true, usesDeemedIncome: false, providers: [provider],
  qualifyingPersons: [{ firstName: "Actual", lastName: "Child", identifierType: "tax_id" as const, taxId: "888-77-6666", over12Disabled: false, qualifyingPersonConfirmed: true, qualifiedExpenses: "3000" }] });
const reopen = async (doc: PDFDocument) => PDFDocument.load(await doc.save());
afterEach(() => vi.restoreAllMocks());

describe("Form2441 actual PartIII review", () => {
  it("fills and reopens actual PartIII fields on a benefits-only return", async () => {
    const source = input(facts({ qualifiedExpensesIncurred: "900", providers: [{ ...provider, amountPaid: "900" }] }));
    const result = calculateFederalTax(source); const before = JSON.stringify(source);
    expect(result.form2441).toBeUndefined();
    const doc = await reopen(await fillForm2441(source, result, blank)); const form = doc.getForm();
    for (const [line, value] of [[12, "2000"], [13, "0"], [14, "0"], [15, "2000"], [16, "900"], [17, "900"], [18, "85000"], [19, "85000"], [20, "900"], [21, "5000"], [22, "0"], [23, "2000"], [24, "0"], [25, "900"], [26, "1100"]] as const) expect(form.getTextField(F[`line${line}`]).getText(), `line ${line}`).toBe(value);
    for (const key of ["line3", "line4", "line11", "line27", "line28", "line29", "line30", "line31"] as const) expect(form.getTextField(F[key]).getText() ?? "").toBe("");
    expect(form.getCheckBox(F.line22No).isChecked()).toBe(true); expect(form.getCheckBox(F.line22Yes).isChecked()).toBe(false);
    expect(form.getTextField(F.provider1Name).getText()).toBe(provider.name);
    expect(form.getTextField(F.provider1Amount).getText()).toBe("900");
    expect(form.getTextField(F.qp1FirstName).getText() ?? "").toBe("");
    expect(doc.getSubject()).toBe(REVIEW_PDF_NOTICE); expect(doc.getPageCount()).toBe(2);
    expect(JSON.stringify(source)).toBe(before);
    const noEligibleCare = input(facts({ exclusionEligibilityConfirmed: false, qualifyingIndividuals: 0, qualifiedExpensesIncurred: "0", providers: [] }));
    const noCareForm = (await fillForm2441(noEligibleCare, calculateFederalTax(noEligibleCare), blank)).getForm();
    expect(noCareForm.getTextField(F.line25).getText()).toBe("0");
    expect(noCareForm.getTextField(F.line26).getText()).toBe("2000");
    expect(noCareForm.getTextField(F.provider1Name).getText() ?? "").toBe("");
  });
  it("prints coordinated credit amounts once and obeys the nonpositive line29 stop", async () => {
    const source = input(facts({ qualifiedExpensesPaidForCredit: "3000" }), { dependentCare: creditSource() });
    const result = calculateFederalTax(source); const doc = await reopen(await fillForm2441(source, result, blank)); const form = doc.getForm();
    for (const [key, value] of [["line27", "3000"], ["line28", "2000"], ["line29", "1000"], ["line30", "3000"], ["line31", "1000"], ["line3", "1000"], ["line11", "200"], ["qp1Expenses", "3000"]] as const) expect(form.getTextField(F[key]).getText()).toBe(value);
    const cap = input(facts({ employeeBenefits: [{ ...facts().employeeBenefits![0], benefitsReported: "5000" }], qualifiedExpensesPaidForCredit: "0" }), {
      dependentCare: { ...creditSource("40"), qualifyingPersons: creditSource().qualifyingPersons.map(person => ({ ...person, qualifiedExpenses: "0" })) },
    });
    const stopped = await reopen(await fillForm2441(cap, calculateFederalTax(cap), blank));
    expect(stopped.getForm().getTextField(F.line29).getText()).toBe("(2000)");
    expect(stopped.getForm().getTextField(F.line30).getText() ?? "").toBe(""); expect(stopped.getForm().getTextField(F.line31).getText() ?? "").toBe("");
    expect(stopped.getForm().getTextField(F.line9b).getText()).toBe("40"); expect(stopped.getForm().getTextField(F.line11).getText()).toBe("40");
    await expect(fillForm2441({ ...source, dependentCare: { ...source.dependentCare!, providers: [{ ...provider, amountPaid: "4999" }] } }, result, blank)).rejects.toThrow(/provider source records do not reconcile/);
  });
  it("preserves actual business amounts signed income and the source checkboxes", async () => {
    const source = input(facts({ employeeBenefits: [], selfEmployedBenefits: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", benefitsReceived: "2000", priorYearCarryoverUsed: "0", alreadyDeducted: "2500" }], deductionAllocations: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", amount: "2000" }], primaryEarnedIncome: "91076" }), { w2s: [], scheduleC: { accountHolder: "primary", grossReceipts: "100000", expenses: { employeeBenefitPrograms: "2500" } } });
    const form = (await reopen(await fillForm2441(source, calculateFederalTax(source), blank))).getForm();
    expect(form.getCheckBox(F.line22Yes).isChecked()).toBe(true); expect(form.getCheckBox(F.line22No).isChecked()).toBe(false);
    expect(form.getTextField(F.line22).getText()).toBe("2000"); expect(form.getTextField(F.line24).getText()).toBe("2000"); expect(form.getTextField(F.line23).getText()).toBe("0");
    const loss = input(facts({ primaryEarnedIncome: "-125.75", usesDeemedIncome: false }));
    const negative = (await fillForm2441(loss, calculateFederalTax(loss), blank)).getForm();
    expect(negative.getTextField(F.line18).getText()).toBe("(126)"); expect(negative.getTextField(F.line20).getText()).toBe("0");
    const mfs = input(facts({ qualifiedExpensesPaidForCredit: "3000", usesDeemedIncome: true, spouseLivedApartLast6Months: true, paidOverHalfHomeCost: true, qualifyingPersonMainHomeOverHalfYear: true }), { taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" }, dependentCare: creditSource() });
    const mfsForm = (await fillForm2441(mfs, calculateFederalTax(mfs), blank)).getForm();
    expect(mfsForm.getCheckBox(F.mfsException).isChecked()).toBe(true); expect(mfsForm.getCheckBox(F.studentOrDisabled).isChecked()).toBe(true);
  });
  it("includes benefits-only review packets and redacts provider identifiers after calculation", async () => {
    const source = input(); const result = calculateFederalTax(source);
    const redacted = redactReviewIdentifiers(source);
    expect(redacted.dependentCareBenefits?.providers?.[0]?.taxId).toBe(""); expect(source.dependentCareBenefits?.providers?.[0]?.taxId).toBe("12-9876543");
    const folder = await mkdtemp(join(tmpdir(), "care-benefits-packet-"));
    try {
      const packet = await fillReturn(redacted, result, { blankFormsDir: "forms/blank", outputDir: folder, flatten: false });
      const path = packet.filledForms.find(file => file.endsWith("f2441-filled.pdf")); expect(path).toBeDefined();
      const doc = await PDFDocument.load(await readFile(path!));
      expect(doc.getForm().getTextField(F.provider1TIN).getText() ?? "").toBe("");
      expect(doc.getForm().getTextField(F.line25).getText()).toBe("2000");
    } finally { await rm(folder, { recursive: true, force: true }); }
  });
  it("rejects missing contradictory unverified and wrongly attributed PartIII audits", async () => {
    const source = input(); const result = calculateFederalTax(source); const benefits = result.form2441Benefits!;
    const amount = benefits.lines.find(line => line.line === "24")!;
    for (const invalid of [undefined, { ...benefits, sourceFactsVerified: false }, { ...benefits, taxYear: 2026 },
      { ...benefits, lines: benefits.lines.filter(line => line.line !== "24") }, { ...benefits, lines: [...benefits.lines, amount] },
      { ...benefits, lines: benefits.lines.map(line => line.line === "24" ? { ...line, form: "Other form" } : line) },
      { ...benefits, lines: benefits.lines.map(line => line.line === "18" ? { ...line, value: d("NaN") } : line) },
      { ...benefits, lines: benefits.lines.map(line => line.line === "24" ? { ...line, value: d("1") } : line) },
      { ...benefits, taxableBenefits: d("1") },
    ]) await expect(fillForm2441(source, { ...result, form2441Benefits: invalid }, blank)).rejects.toThrow(/audit|source|year|Part III/i);
    await expect(fillForm2441({ ...source, dependentCareBenefits: undefined }, result, blank)).rejects.toThrow(/source/i);
    await expect(fillForm2441({ ...source, w2s: [{ ...source.w2s[0], box10DependentCareBenefits: "1999" }] }, result, blank)).rejects.toThrow(/Box10|source/i);
    for (const patch of [{ providers: undefined }, { providers: [] }, { usesDeemedIncome: undefined }]) await expect(fillForm2441({ ...source, dependentCareBenefits: { ...source.dependentCareBenefits, ...patch } }, result, blank)).rejects.toThrow(/source|provider|deemed/i);
    await expect(fillForm2441({ ...source, taxpayer: { ...source.taxpayer, taxYear: 2026 } }, { ...result, taxYear: 2026 }, blank)).rejects.toThrow(/mapping/);
  });
  it("rejects missing or wrongly typed physical benefit fields", async () => {
    const source = input(); const result = calculateFederalTax(source);
    for (const wrongType of [false, true]) {
      const doc = await pdfUtils.loadBlankPdf(blank); const form = doc.getForm();
      form.updateFieldAppearances();
      form.removeField(form.getTextField("topmostSubform[0].Page2[0].f2_15[0]"));
      if (wrongType) form.createCheckBox("topmostSubform[0].Page2[0].f2_15[0]");
      vi.spyOn(pdfUtils, "loadReviewTemplate").mockResolvedValueOnce(doc);
      await expect(fillForm2441(source, result, blank)).rejects.toThrow(/mapped PDF|wrong type/);
    }
  });
});
