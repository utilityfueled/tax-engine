/** Spec: spec/federal/form-7206-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Decimal from "decimal.js";
import { PDFDocument, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { calculateForm7206, type Form7206Result } from "@/engine/forms/form-7206.js";
import { calculateForm7206Return } from "@/engine/forms/form-7206-return.js";
import { Form7206Schema, TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { healthFacts } from "../fixtures/form7206.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const blank = new URL("../../forms/blank/2026/f7206.pdf", import.meta.url);
const sourceContract = new URL("./sources/form-7206-2026.json", import.meta.url);

type Location = { name: string; page: number; rect: [number, number, number, number]; type: "/Tx" };

async function mapping() {
  const { FORM_7206_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-7206-candidate.js");
  return FORM_7206_2026_CANDIDATE;
}

function annualHealthFacts(amount: string) {
  const base = healthFacts("scheduleC", amount);
  const person = { ...base.persons[0], attainedAgeAtYearEnd: 36 };
  const plan = base.plans[0];
  const payment = { ...plan.payments[0], datePaid: "2026-01-15", coverageTaxYear: 2026 };
  const paid = payment.personAmounts[0];
  return { base, person, plan: { ...plan, payments: [payment] }, payment, paid };
}

async function diagnosticPage(result: Form7206Result, business: Form7206Result["businesses"][number]) {
  const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  form.getTextField(candidate.fields.name).setText("Synthetic review household");
  form.getTextField(candidate.fields.taxpayerId).setText("000-00-0000");
  const expected = new Map<string, string>();
  for (const { form: label, line, value, inputs } of result.lines) {
    if (label !== "Form 7206" || inputs.Owner !== business.accountHolder || inputs.Business !== business.businessSourceId) continue;
    const name = candidate.fields[`line${line}` as keyof typeof candidate.fields];
    if (!name) continue;
    const text = line === "6" ? `${value.times(100).toDecimalPlaces(6).toFixed()}%` : value.toFixed();
    form.getTextField(name).setText(text);
    expected.set(name, text);
  }
  expected.set(candidate.fields.name, "Synthetic review household");
  expected.set(candidate.fields.taxpayerId, "000-00-0000");
  await markReviewPdf(pdf);
  const reopened = await PDFDocument.load(await pdf.save());
  expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
  const saved = reopened.getForm();
  for (const name of Object.values(candidate.fields)) {
    const field = saved.getTextField(name);
    const value = expected.get(name);
    expect(field.getText(), name).toBe(value);
    expect(field.acroField.getValue()?.decodeText(), name).toBe(value);
    if (value !== undefined) {
      const normal = field.acroField.getWidgets()[0].getAppearances()?.normal;
      expect(normal).toBeInstanceOf(PDFRawStream);
      expect(decodePDFRawStream(normal as PDFRawStream).decode().length).toBeGreaterThan(0);
    }
  }
  return Object.fromEntries(Object.entries(candidate.fields).map(([key, name]) => [key, saved.getTextField(name).getText()]));
}

describe("Final 2026 Form 7206 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const bytes = await readFile(blank);
    expect(bytes.length).toBe(63429);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(sha256).toBe("863c82bd31b674d693653546a6479c34b8fa0b2e8a2a97a7a11d0d4f5030c9bb");
    const candidate = await mapping();
    expect(candidate).toMatchObject({ sha256, sourceRevision: "Created 4/15/26", sourceUrl: "https://www.irs.gov/pub/irs-pdf/f7206.pdf" });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 7206");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([{ width: 611.976, height: 791.968 }]);
  });

  it("locates all annual fields on their printed rows", async () => {
    const [source, candidate, pdf] = await Promise.all([
      readFile(sourceContract, "utf8").then(text => JSON.parse(text) as Record<string, Location>),
      mapping(),
      readFile(blank).then(bytes => PDFDocument.load(bytes)),
    ]);
    const form = pdf.getForm();
    expect(form.getFields()).toHaveLength(16);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(source).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
    for (const [key, { name, page, rect, type }] of Object.entries(source)) {
      expect(candidate.fields[key as keyof typeof candidate.fields], key).toBe(name);
      const field = form.getTextField(name);
      expect(field).toBeInstanceOf(PDFTextField);
      expect(field.acroField.FT()?.toString()).toBe(type);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const [widget] = widgets;
      const { x, y, width, height } = widget.getRectangle();
      const [left, bottom, right, top] = rect;
      expect([x, y, x + width, y + height].map(point => Number(point.toFixed(3)))).toEqual([left, bottom, right, top]);
      expect(widget.P()).toEqual(pdf.getPage(page - 1).ref);
    }
  });

  it("records the printed sources and transfer", async () => {
    expect((await mapping()).printedReferences).toEqual({
      line4OptionalMethodFrom: "Schedule SE (Form 1040), Part I, line 4b",
      line5From: ["Schedule C (Form 1040), line 31", "Schedule F (Form 1040), line 34", "Schedule K-1 (Form 1065), box 14, code A"],
      line7From: "Schedule 1 (Form 1040), line 15",
      line9From: "Schedule 1 (Form 1040), line 16",
      line11From: "Form W-2, box 5",
      line12From: "Form 2555, line 45",
      line14To: "Schedule 1 (Form 1040), line 17",
    });
  });

  it("renders literal line 2 limits at each age boundary", async () => {
    for (const [age, premium, allowed] of [
      [40, "7000", "500"], [41, "7000", "930"], [50, "7000", "930"], [51, "7000", "1860"],
      [60, "7000", "1860"], [61, "7000", "4960"], [70, "7000", "4960"], [71, "7000", "6200"],
      [71, "6200", "6200"], [71, "6199", "6199"],
    ] as const) {
      const { base, person, plan } = annualHealthFacts(premium);
      const facts = Form7206Schema.parse({ ...base, sourceTaxYear: 2026,
        persons: [{ ...person, attainedAgeAtYearEnd: age }], plans: [{ ...plan, kind: "qualified_ltc" }] });
      const result = calculateForm7206({
        taxYear: 2026, filingStatus: "single", facts,
        businesses: [{ sourceId: "scheduleC", accountHolder: "primary", kind: "self_employed", netIncome: new Decimal(20000),
          ownerPositiveBusinessIncome: new Decimal(20000), ownerDeductibleSelfEmploymentTax: new Decimal(1000),
          attributableRetirementDeduction: new Decimal(0), attributableForeignExclusion: new Decimal(0) }],
      });
      const saved = await diagnosticPage(result, result.businesses[0]);
      expect(saved.line1, `age ${age}`).toBe("0");
      expect(saved.line2, `age ${age}`).toBe(allowed);
    }
  });

  it("keeps owner pages separate and saves blanks apart from zeros", async () => {
    const { base, person, plan, payment, paid } = annualHealthFacts("5000");
    const spouse = { firstName: "Jordan", lastName: "Doe", ssn: "555-55-5555", dateOfBirth: "1980-06-15" };
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026, filingStatus: "married_filing_jointly", spouse },
      w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: 2026, accountHolder: "spouse", medicareWages: "600", wages: "1000" }],
      scheduleC: { accountHolder: "primary", businessName: "Synthetic sole proprietor", grossReceipts: "3000" },
      form7206: {
        ...base, sourceTaxYear: 2026, persons: [person, { personId: "spouse", name: "Jordan Doe", householdRole: "spouse", attainedAgeAtYearEnd: 46 }],
        plans: [plan, {
          ...plan, planId: "shareholder-medical", accountHolder: "spouse", businessSourceId: "formW2:0", businessKind: "s_corporation",
          moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true, coveredPersons: [{ personId: "spouse", relationshipToOwner: "self" }],
          payments: [{ ...payment, sourceId: "shareholder-premium", grossPremium: "800", ownerOrBusinessPaid: "800",
            personAmounts: [{ ...paid, personId: "spouse", payer: "business_paid_or_reimbursed", amountPaid: "800" }] }],
        }],
      },
    });
    const { form7206, healthSources } = calculateForm7206Return({
      input, scheduleCProfit: new Decimal(3000), scheduleFProfit: new Decimal(0), cryptoBusinessProfit: new Decimal(0),
      selfEmploymentDeductions: [{ accountHolder: "primary", amount: new Decimal(200) }],
      selfEmploymentSourcesVerified: true, foreignIncomeExclusion: new Decimal(0),
    });
    expect(form7206.businesses.map(({ accountHolder, businessSourceId }) => [accountHolder, businessSourceId]))
      .toEqual([["primary", "scheduleC"], ["spouse", "formW2:0"]]);
    const [primaryPage, spousePage] = await Promise.all(form7206.businesses.map(business => diagnosticPage(form7206, business)));
    expect(primaryPage).toMatchObject({ line1: "5000", line2: "0", line3: "5000", line4: "3000", line5: "3000", line6: "100%",
      line7: "200", line8: "2800", line9: "0", line10: "2800", line11: undefined, line12: "0", line13: "2800", line14: "2800" });
    expect(spousePage).toMatchObject({ line1: "800", line2: "0", line3: "800", line4: undefined, line5: undefined, line6: undefined,
      line7: undefined, line8: undefined, line9: undefined, line10: undefined, line11: "600", line12: "0", line13: "600", line14: "600" });
    expect(form7206.deductionToSchedule1.toFixed()).toBe("3400");
    expect(healthSources.map(({ accountHolder, amount }) => [accountHolder, amount.toFixed()])).toEqual([["primary", "2800"], ["spouse", "600"]]);
  });

  it("keeps public exports closed", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    expect(candidate).toMatchObject({ taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending" });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes("f7206.pdf", bytes, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f7206.pdf", bytes, 2026)).toThrow(/No qualified review/);
  });
});
