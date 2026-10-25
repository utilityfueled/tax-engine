/** Spec: spec/federal/form-4952-2026-template.yaml. No export path is enabled. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { FORM_4952_2026_CANDIDATE } from "@/pdf/mappings/2026/form-4952-candidate.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const sourcePath = "forms/blank/2026/f4952.pdf";
// Independently inspected source rectangles, left/bottom in points. These are
// printed locations, not generated from the production map or historical form.
const expectedLocations = {
  name: [36, 683.968], ssn: [460.8, 683.968],
  line1: [504, 647.968], line2: [504, 635.969], line3: [504, 623.970],
  line4a: [410.4, 575.968], line4b: [410.4, 563.969], line4c: [504, 551.970],
  line4d: [410.4, 539.968], line4e: [410.4, 515.970], line4f: [504, 503.968],
  line4g: [504, 491.969], line4h: [504, 479.970], line5: [504, 467.968],
  line6: [504, 455.969], line7: [504, 407.970], line8: [504, 395.968],
} as const;
// 6000 current expense +2000 carry, 10000 income less1000 qualified dividends,
// 4000 gain less3000 net capital gain +2000 elected income -500 expense.
const expectedValues = {
  name: "SYNTHETIC MAPPING REVIEW", ssn: "REDACTED",
  line1: "6,000", line2: "2,000", line3: "8,000", line4a: "10,000", line4b: "1,000",
  line4c: "9,000", line4d: "4,000", line4e: "3,000", line4f: "1,000", line4g: "2,000",
  line4h: "12,000", line5: "500", line6: "11,500", line7: "0", line8: "8,000",
} as const;

describe("Final 2026 Form 4952 mapping candidate", () => {
  it("pins the final 2026 source without enabling public exports", async () => {
    const bytes = await readFile(sourcePath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(FORM_4952_2026_CANDIDATE.sha256);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getForm().getFields()).toHaveLength(17);
    expect(FORM_4952_2026_CANDIDATE).toMatchObject({ taxYear: 2026, filingQualified: false, exportsEnabled: false, reviewStatus: "independent-review-pending" });
    expect(Object.isFrozen(FORM_4952_2026_CANDIDATE.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes("f4952.pdf", bytes, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f4952.pdf", bytes, 2026)).toThrow(/No qualified review/);
  });

  it("maps every candidate field to its independently inspected printed location", async () => {
    const doc = await PDFDocument.load(await readFile(sourcePath));
    for (const [key, point] of Object.entries(expectedLocations)) {
      const field = doc.getForm().getField(FORM_4952_2026_CANDIDATE.fields[key as keyof typeof expectedLocations]);
      expect(field).toBeInstanceOf(PDFTextField);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      expect(widgets[0].getRectangle().x).toBeCloseTo(point[0], 2);
      expect(widgets[0].getRectangle().y).toBeCloseTo(point[1], 2);
    }
  });

  it("retains synthetic values and appearances without changing readiness", async () => {
    const doc = await PDFDocument.load(await readFile(sourcePath));
    for (const [key, value] of Object.entries(expectedValues)) {
      doc.getForm().getTextField(FORM_4952_2026_CANDIDATE.fields[key as keyof typeof expectedValues]).setText(value);
    }
    await markReviewPdf(doc);
    const reopened = await PDFDocument.load(await doc.save());
    expect(reopened.getPageCount()).toBe(4);
    expect(reopened.getForm().getFields()).toHaveLength(17);
    for (const [key, value] of Object.entries(expectedValues)) {
      const field = reopened.getForm().getTextField(FORM_4952_2026_CANDIDATE.fields[key as keyof typeof expectedValues]);
      expect(field.getText()).toBe(value);
      expect(field.acroField.getValue()?.decodeText()).toBe(value);
      const appearance = field.acroField.getWidgets()[0].getAppearances()?.normal;
      expect(appearance).toBeInstanceOf(PDFRawStream);
      expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
    }
    const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
    for (const page of reopened.getPages()) {
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray().map(ref => reopened.context.lookup(ref)) : [contents];
      const text = streams.filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
        .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
      expect(text.split(noticeHex).length - 1).toBe(1);
    }
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
  });
});
