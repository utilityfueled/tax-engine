/** Spec: spec/federal/form-1040-v-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFRawStream, PDFTextField, TextAlignment, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { removeTrustedTemplateLegacyFormData } from "@/pdf/trusted-review-template-cleanup.js";

const blank = new URL("../../forms/blank/2026/f1040v.pdf", import.meta.url);
const sha256 = "7533914c5674c1486e4c60dba1e852d65669aece7b840c3644761bac64e64335";
const prefix = "topmostSubform[0].Page1[0].";

// Printed cells transcribed against the original voucher and its widget rectangles.
const cells = {
  primaryTaxpayerId: [1, [36, 131.969, 180, 143.969], 11, TextAlignment.Center],
  spouseTaxpayerId: [2, [180, 131.969, 324, 143.969], 11, TextAlignment.Center],
  checkOrMoneyOrderAmount: [3, [461.3, 131.969, 574.5, 143.969], undefined, TextAlignment.Right],
  primaryFirstNameAndMiddleInitial: [5, [37, 107.968, 294.45, 121.969], undefined, TextAlignment.Left],
  primaryLastName: [6, [296.2, 107.968, 576, 121.969], undefined, TextAlignment.Left],
  spouseFirstNameAndMiddleInitial: [7, [37, 83.967, 294.45, 97.968], undefined, TextAlignment.Left],
  spouseLastName: [8, [296.2, 83.967, 576, 97.968], undefined, TextAlignment.Left],
  streetAddress: [9, [37, 59.966, 251.049, 73.967], undefined, TextAlignment.Left],
  apartment: [10, [252, 59.966, 295.2, 73.967], undefined, TextAlignment.Center],
  city: [11, [296.2, 59.966, 488.85, 73.967], undefined, TextAlignment.Left],
  state: [12, [489.6, 59.966, 518.4, 73.967], 2, TextAlignment.Center],
  zipCode: [13, [518.4, 59.966, 576, 73.967], 10, TextAlignment.Center],
  foreignCountry: [14, [37, 35.968, 294.45, 49.969], undefined, TextAlignment.Left],
  foreignProvince: [15, [296.2, 35.968, 488.85, 49.969], undefined, TextAlignment.Left],
  foreignPostalCode: [16, [489.6, 35.968, 576, 49.969], undefined, TextAlignment.Center],
} as const;

async function candidate() {
  const { FORM_1040_V_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-1040-v-candidate.js");
  return FORM_1040_V_2026_CANDIDATE;
}

async function loadDiagnosticBlank() {
  const bytes = await readFile(blank);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
  const pdf = await PDFDocument.load(bytes);
  removeTrustedTemplateLegacyFormData(pdf);
  return pdf;
}

const confirmedVoucher = {
  taxYear: 2026,
  returnForm: "1040",
  returnAmountOwed: "1500.00",
  annualReturnConfirmed: true,
  payment: { method: "check", amount: "1234.56", singleInstrumentConfirmed: true },
};

describe("Final 2026 Form 1040-V physical candidate", () => {
  it("pins the official annual source", async () => {
    const bytes = await readFile(blank);
    const pdf = await PDFDocument.load(bytes);
    expect(bytes.byteLength).toBe(97210);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
    expect(pdf.getTitle()).toBe("2026 Form 1040-V");
    expect(pdf.getPageCount()).toBe(2);
    expect(await candidate()).toMatchObject({
      taxYear: 2026, sha256, sourceRevision: "Created 8/19/26",
      sourceUrl: "https://www.irs.gov/pub/irs-prior/f1040v--2026.pdf",
    });
  });

  it("maps each exact printed field", async () => {
    const { fields } = await candidate();
    const pdf = await PDFDocument.load(await readFile(blank));
    const form = pdf.getForm();
    const [voucher, instructions] = pdf.getPages();
    expect(Object.keys(fields).sort()).toEqual(Object.keys(cells).sort());
    expect(form.getFields().map(field => field.getName()).sort()).toEqual(Object.values(fields).sort());
    expect(instructions.node.Annots()?.size() ?? 0).toBe(0);
    const annotatedRefs = voucher.node.Annots()?.asArray();
    expect(annotatedRefs).toHaveLength(15);
    for (const [key, [index, bounds, maxLength, alignment]] of Object.entries(cells)) {
      const name = fields[key as keyof typeof fields];
      expect(name).toBe(`${prefix}f1_${index}[0]`);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(PDFTextField);
      if (!(field instanceof PDFTextField)) throw new Error(`Expected text field ${name}`);
      expect(field.getMaxLength()).toBe(maxLength);
      expect(field.getAlignment()).toBe(alignment);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      expect(annotatedRefs?.filter(ref => pdf.context.lookup(ref) === widgets[0].dict)).toHaveLength(1);
      const [left, bottom, right, top] = bounds;
      expect(widgets[0].getRectangle()).toEqual({
        x: expect.closeTo(left, 3), y: expect.closeTo(bottom, 3),
        width: expect.closeTo(right - left, 3), height: expect.closeTo(top - bottom, 3),
      });
    }
  });

  it("reopens all diagnostic values and widget appearances", async () => {
    const { fields } = await candidate();
    const pdf = await loadDiagnosticBlank();
    const form = pdf.getForm();
    const values: Record<keyof typeof fields, string> = {
      primaryTaxpayerId: "REDACTED A", spouseTaxpayerId: "REDACTED B",
      checkOrMoneyOrderAmount: "1234.56", primaryFirstNameAndMiddleInitial: "FICTION A",
      primaryLastName: "PRIMARY SAMPLE", spouseFirstNameAndMiddleInitial: "FICTION B",
      spouseLastName: "SPOUSE SAMPLE", streetAddress: "100 EXAMPLE STREET", apartment: "4A",
      city: "EXAMPLE CITY", state: "PA", zipCode: "00000-0000", foreignCountry: "EXAMPLE COUNTRY",
      foreignProvince: "EXAMPLE PROVINCE", foreignPostalCode: "X0X 0X0",
    };
    for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
      form.getTextField(fields[key]).setText(values[key]);
    }
    await markReviewPdf(pdf);
    const bytes = await pdf.save();
    const reopened = await PDFDocument.load(bytes);
    expect(reopened.getForm().hasXFA()).toBe(false);
    expect(reopened.catalog.get(PDFName.of("Perms"))).toBeUndefined();
    expect(reopened.getForm().getFields()).toHaveLength(15);
    const reopenedAnnots = reopened.getPage(0).node.Annots()?.asArray();
    expect(reopenedAnnots).toHaveLength(15);
    for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
      const field = reopened.getForm().getTextField(fields[key]);
      const [widget] = field.acroField.getWidgets();
      expect(reopenedAnnots?.filter(ref => reopened.context.lookup(ref) === widget.dict)).toHaveLength(1);
      expect(field.getText()).toBe(values[key]);
      expect(field.acroField.getValue()?.decodeText()).toBe(values[key]);
      const normal = widget.getAppearances()?.normal;
      expect(normal).toBeInstanceOf(PDFRawStream);
      if (!(normal instanceof PDFRawStream)) throw new Error(`Missing appearance for ${fields[key]}`);
      const valueHex = Buffer.from(values[key]).toString("hex").toUpperCase();
      expect(Buffer.from(decodePDFRawStream(normal).decode()).toString("ascii")).toContain(valueHex);
    }
    const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
    for (const page of reopened.getPages()) {
      const notices = page.node.normalizedEntries().Contents?.asArray()
        .map(ref => reopened.context.lookup(ref))
        .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream && stream.dict.has(PDFName.of("TaxEngineReviewNotice"))) ?? [];
      expect(notices).toHaveLength(1);
      expect(Buffer.from(decodePDFRawStream(notices[0]).decode()).toString("ascii")).toContain(noticeHex);
    }
    const diagnosticOutput = process.env.TAX_FORM_1040_V_DIAGNOSTIC_OUTPUT;
    if (diagnosticOutput) await writeFile(diagnosticOutput, bytes, { flag: "wx", mode: 0o600 });
  });

  it("projects the confirmed payment cents and leaves identity blank", async () => {
    const { FORM_1040_V_2026_CANDIDATE: physical, projectForm1040V2026PaperPayment } = await import("@/pdf/mappings/2026/form-1040-v-candidate.js");
    const amountField = physical.fields.checkOrMoneyOrderAmount;
    const projection = projectForm1040V2026PaperPayment(confirmedVoucher);
    expect(projection).toEqual({ [amountField]: "1234.56" });
    expect(projectForm1040V2026PaperPayment({ ...confirmedVoucher, returnForm: "1040-SR",
      payment: { ...confirmedVoucher.payment, method: "money-order", amount: "50.4" } })).toEqual({ [amountField]: "50.40" });
    expect(projectForm1040V2026PaperPayment({ ...confirmedVoucher, returnForm: "1040-NR", returnAmountOwed: "99999999.99",
      payment: { ...confirmedVoucher.payment, amount: "99999999.99" } })).toEqual({ [amountField]: "99999999.99" });
    const pdf = await loadDiagnosticBlank();
    for (const [field, value] of Object.entries(projection)) pdf.getForm().getTextField(field).setText(value);
    await markReviewPdf(pdf);
    const bytes = await pdf.save();
    const reopened = await PDFDocument.load(bytes);
    for (const name of Object.values(physical.fields)) {
      expect(reopened.getForm().getTextField(name).getText()).toBe(name === amountField ? "1234.56" : undefined);
    }
    expect(reopened.catalog.get(PDFName.of("Perms"))).toBeUndefined();
    expect(reopened.catalog.getAcroForm()?.dict.get(PDFName.of("SigFlags"))).toBeUndefined();
    const diagnosticOutput = process.env.TAX_FORM_1040_V_PAYMENT_DIAGNOSTIC_OUTPUT;
    if (diagnosticOutput) await writeFile(diagnosticOutput, bytes, { flag: "wx", mode: 0o600 });
  });

  it("refuses missing or incompatible voucher originals", async () => {
    const { projectForm1040V2026PaperPayment } = await import("@/pdf/mappings/2026/form-1040-v-candidate.js");
    const sources = confirmedVoucher;
    for (const invalid of [
      { taxYear: 2025 }, { taxYear: "2026" }, { returnForm: "1040-X" }, { annualReturnConfirmed: false },
      { returnAmountOwed: undefined }, { returnAmountOwed: "0.00" }, { returnAmountOwed: "1500.001" },
      { returnAmountOwed: "99999999.98", payment: { ...sources.payment, amount: "99999999.99" } },
      { returnAmountOwed: "100000000.00", payment: { ...sources.payment, amount: "100000000.00" } },
      { payment: undefined }, { payment: { ...sources.payment, singleInstrumentConfirmed: false } },
      { payment: { ...sources.payment, method: "online" } }, { payment: { ...sources.payment, method: "cash" } },
      ...[undefined, 1234.56, "", "0", "-0.01", "1234.561", "1500.01", "1e2"].map(amount => ({ payment: { ...sources.payment, amount } })),
      { primaryTaxpayerId: "TEST IDENTIFIER" }, { payment: { ...sources.payment, sourceReference: "PRIVATE" } },
    ]) {
      expect(() => projectForm1040V2026PaperPayment({ ...sources, ...invalid })).toThrow(/Form 1040-V/);
    }
  });

  it("keeps exports filing and payments disabled", async () => {
    const physical = await candidate();
    const bytes = await readFile(blank);
    expect(physical).toMatchObject({ exportsEnabled: false, filingQualified: false, paymentsEnabled: false,
      reviewStatus: "independent-review-pending" });
    expect(Object.isFrozen(physical)).toBe(true);
    expect(Object.isFrozen(physical.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertReviewTemplateBytes("f1040v.pdf", bytes, 2025)).toThrow(/No registered review template/);
    expect(() => assertReviewTemplateBytes("f1040v.pdf", bytes, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/);
  });
});
