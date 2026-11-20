/** Spec: spec/federal/form-8829-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFRawStream, PDFTextField, StandardFonts, decodePDFRawStream, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assertPdfExportAllowed, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f8829.pdf", import.meta.url);
const blankDigest = "b2b1a269a18d254818ed084f1796223b94c4ea731d81dc2cd9bebd03f9e49c24";
// IRS field ordinals in visual row order, with the direct field before the indirect field.
const printedFields = [
  "proprietorName", "ssn", "line1", "line2", "line3", "line4", "line5", "line6", "line7", "line8",
  "line9Direct", "line9Indirect", "line10Direct", "line10Indirect", "line11Direct", "line11Indirect",
  "line12Direct", "line12Indirect", "line13", "line14", "line15",
  "line16Direct", "line16Indirect", "line17Direct", "line17Indirect", "line18Direct", "line18Indirect",
  "line19Direct", "line19Indirect", "line20Direct", "line20Indirect", "line21Direct", "line21Indirect",
  "line22Direct", "line22Indirect", "line23Direct", "line23Indirect", "line24", "line25",
  "line26", "line27", "line28", "line29", "line30", "line31", "line32", "line33", "line34", "line35",
  "line36", "line37", "line38", "line39", "line40", "line41", "line42", "line43", "line44",
] as const;

async function mapping() {
  const { FORM_8829_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-8829-candidate.js");
  return FORM_8829_2026_CANDIDATE;
}

describe("Final 2026 Form 8829 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    expect(bytes.length).toBe(78882);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(blankDigest);
    expect(candidate.sha256).toBe(blankDigest);
    expect(candidate.sourceUrl).toBe("https://www.irs.gov/pub/irs-pdf/f8829.pdf");
    expect(candidate.sourceRevision).toBe("Created 4/15/26");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 8829");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([{ width: 611.976, height: 791.968 }]);
  });

  it("locates every text widget on its printed row and column", async () => {
    const [candidate, pdf] = await Promise.all([
      mapping(), readFile(blank).then(bytes => PDFDocument.load(bytes)),
    ]);
    const page = pdf.getPage(0);
    const fields = pdf.getForm().getFields();
    const names = new Set(fields.map(field => field.getName()));
    expect(fields).toHaveLength(58);
    expect(page.node.Annots()?.size()).toBe(58);
    expect(Object.keys(candidate.fields).sort()).toEqual([...printedFields].sort());
    expect(new Set(Object.values(candidate.fields))).toEqual(names);

    const geometry = new Map<string, number[]>();
    for (const [index, key] of printedFields.entries()) {
      const name = candidate.fields[key];
      const ordinal = String(index + 1).padStart(2, "0");
      expect(name.endsWith(`.f1_${ordinal}[0]`), key).toBe(true);
      const field = pdf.getForm().getTextField(name);
      expect(field.acroField.getWidgets()).toHaveLength(1);
      const [widget] = field.acroField.getWidgets();
      expect(widget.P()).toEqual(page.ref);
      const { x, y, width, height } = widget.getRectangle();
      const rectangle = [x, y, x + width, y + height].map(value => Math.round(value * 1000));
      geometry.set(name, rectangle);
      if (key.endsWith("Direct")) expect(x).toBeCloseTo(296.2, 3);
      if (key.endsWith("Indirect")) expect(x).toBeCloseTo(382.6, 3);
    }
    // Independent pypdf page-annotation inspection, sorted by fully qualified field name.
    const orderedGeometry = [...geometry.keys()].sort().map(name => [name, geometry.get(name)]);
    expect(createHash("sha256").update(JSON.stringify(orderedGeometry)).digest("hex"))
      .toBe("e27df3603d16e4a8604478c662fccb426be9f9e7a431cd5c021e9c8ce8e6166a");
  });

  it("records the printed transfers and carryover year", async () => {
    const candidate = await mapping();
    expect(candidate.printedReferences).toEqual({
      line8From: "Schedule C (Form 1040), line 29, adjusted as printed",
      line35To: "Form 4684",
      line36To: "Schedule C (Form 1040), line 30",
      line42To: "Form 8829, line 30",
      carryoverYear: 2027,
      line43From: "Line 26 minus line 27, floored at zero",
      line44From: "Line 32 minus line 33, floored at zero",
    });
  });

  it("reopens distinct diagnostic values and widget appearances", async () => {
    const [candidate, pdf] = await Promise.all([
      mapping(), readFile(blank).then(bytes => PDFDocument.load(bytes)),
    ]);
    const form = pdf.getForm();
    const values = new Map<string, string>();
    for (const [index, key] of printedFields.entries()) {
      const name = candidate.fields[key];
      const value = key === "proprietorName" ? "SYNTHETIC PROPRIETOR" : key === "ssn" ? "000-00-0000" : String(index + 1);
      form.getTextField(name).setText(value);
      values.set(name, value);
    }
    // The IRS footer occupies the bottom margin. This isolated specimen can use the clear top margin.
    const noticeFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    pdf.getPage(0).drawText(REVIEW_PDF_NOTICE, {
      x: 36, y: 773, size: 10, font: noticeFont, color: rgb(0.65, 0.05, 0.05),
    });
    pdf.setSubject(REVIEW_PDF_NOTICE);
    form.deleteXFA();
    const reopened = await PDFDocument.load(await pdf.save());
    expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
    const saved = reopened.getForm();
    expect(saved.hasXFA()).toBe(false);
    expect(saved.getFields()).toHaveLength(58);
    for (const field of saved.getFields()) {
      expect(field).toBeInstanceOf(PDFTextField);
      const textField = field as PDFTextField;
      expect(textField.getText()).toBe(values.get(field.getName()));
      expect(textField.acroField.getValue()?.decodeText()).toBe(values.get(field.getName()));
      const appearance = field.acroField.getWidgets()[0].getAppearances()?.normal;
      expect(appearance).toBeInstanceOf(PDFRawStream);
      expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
    }
  });

  it("keeps the physical candidate outside public exports", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending",
    });
    expect(() => assertReviewTemplateBytes("f8829.pdf", bytes, 2025)).toThrow(/No registered review template/);
    expect(() => assertReviewTemplateBytes("f8829.pdf", bytes, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  });
});
