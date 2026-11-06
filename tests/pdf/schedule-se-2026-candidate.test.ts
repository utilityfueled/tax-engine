/** Spec: spec/federal/schedule-se-2026-template.yaml. Physical source only. */
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { SCHEDULE_SE_2026_CANDIDATE as candidate } from "@/pdf/mappings/2026/schedule-se-candidate.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const sourceUrl = new URL("../../forms/blank/2026/f1040sse.pdf", import.meta.url);
type SourceContract = {
  sha256: string; filename: string; leafWidgets: number;
  locations: Record<string, { fieldName: string; page: number; rect: string[]; type: string }>;
  emptyPrintedAmountAnchors: string[];
};
const original = JSON.parse(await readFile(
  new URL("../fixtures/pdf-2026/schedule-se-source.json", import.meta.url), "utf8",
)) as SourceContract;

describe("Final 2026 Schedule SE physical candidate", () => {
  it("pins the exact final annual source", async () => {
    // An absent physical asset is an assertion failure, not a module-load error.
    const bytes = await readFile(sourceUrl).catch(() => undefined);
    expect(bytes, "the final 2026 physical source must exist").toBeDefined();
    if (!bytes) return;
    expect(bytes.length).toBe(77739);
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("a42f5a19c0e84a966a49b5f4ca021d3f49c4fda2e087da0b00bf2003525f8655");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("2026 Schedule SE (Form 1040)");
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getForm().getFields()).toHaveLength(27);
    expect(candidate.sha256).toBe(original.sha256);
    expect(candidate.sourceRevision).toBe("Created 4/27/26");
  });

  it("maps every leaf to its original physical location", async () => {
    const pdf = await PDFDocument.load(await readFile(sourceUrl));
    const form = pdf.getForm();
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(original.locations).sort());
    expect(Object.values(candidate.fields).slice().sort())
      .toEqual(form.getFields().map(field => field.getName()).sort());
    expect(candidate.emptyPrintedAmountAnchors).toEqual(original.emptyPrintedAmountAnchors);
    for (const [key, location] of Object.entries(original.locations)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name).toBe(location.fieldName);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(location.type === "/Tx" ? PDFTextField : PDFCheckBox);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const widget = widgets[0];
      const rect = widget.getRectangle();
      const [left, bottom, right, top] = location.rect.map(Number);
      expect(rect.x).toBeCloseTo(left, 3);
      expect(rect.y).toBeCloseTo(bottom, 3);
      expect(rect.width).toBeCloseTo(right - left, 3);
      expect(rect.height).toBeCloseTo(top - bottom, 3);
      expect(widget.P()).toEqual(pdf.getPages()[location.page - 1].ref);
      if (original.emptyPrintedAmountAnchors.includes(key)) {
        expect(field).toBeInstanceOf(PDFTextField);
        expect((field as PDFTextField).getText()).toBeUndefined();
        expect(rect.width).toBe(1);
      }
    }
  });

  it("retains diagnostic values and both checkbox states after save", async () => {
    for (const checked of [false, true]) {
      const pdf = await PDFDocument.load(await readFile(sourceUrl));
      const values: Record<string, string> = {};
      let index = 0;
      for (const [key, name] of Object.entries(candidate.fields)) {
        const field = pdf.getForm().getField(name);
        if (field instanceof PDFTextField) {
          if (original.emptyPrintedAmountAnchors.includes(key)) continue;
          const value = key === "ssn" ? "REDACTED" : key === "name" ? "FICTIONAL FIELD PROBE" : String(++index);
          field.setText(value);
          values[name] = value;
        } else if (field instanceof PDFCheckBox) {
          if (checked) field.check(); else field.uncheck();
        } else throw new Error(`Unexpected original widget type: ${name}`);
      }
      await markReviewPdf(pdf);
      const bytes = await pdf.save();
      const reopened = await PDFDocument.load(bytes);
      expect(reopened.getForm().getFields()).toHaveLength(original.leafWidgets);
      for (const [name, value] of Object.entries(values)) {
        const field = reopened.getForm().getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        const appearance = field.acroField.getWidgets()[0].getAppearances()?.normal;
        expect(appearance).toBeInstanceOf(PDFRawStream);
        expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
      }
      for (const key of candidate.emptyPrintedAmountAnchors) {
        expect(reopened.getForm().getTextField(candidate.fields[key]).getText()).toBeUndefined();
      }
      const checkbox = reopened.getForm().getCheckBox(candidate.fields.ministerForm4361);
      expect(checkbox.isChecked()).toBe(checked);
      const widget = checkbox.acroField.getWidgets()[0];
      const state = checked ? checkbox.acroField.getOnValue() : PDFName.of("Off");
      expect(state).toBeDefined();
      expect(widget.getAppearanceState()).toEqual(state);
      const normal = widget.getAppearances()?.normal;
      expect(normal).toBeInstanceOf(PDFDict);
      const appearance = (normal as PDFDict).lookup(state as PDFName);
      expect(appearance).toBeInstanceOf(PDFRawStream);
      expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
      const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
      for (const page of reopened.getPages()) {
        const contents = page.node.Contents();
        const streams = contents instanceof PDFArray
          ? contents.asArray().map(ref => reopened.context.lookup(ref)) : [contents];
        const text = streams.filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
          .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
        expect(text.split(noticeHex).length - 1).toBe(1);
      }
      if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
        const output = process.env.TAX_CANDIDATE_ARTIFACT_DIR;
        const directory = await lstat(output);
        if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("Artifact directory must be a real directory");
        await writeFile(join(output, `schedule-se-${checked ? "checked" : "unchecked"}.pdf`), bytes, { flag: "wx", mode: 0o600 });
      }
    }
  });

  it("keeps every export gate closed", async () => {
    const bytes = await readFile(sourceUrl);
    expect(candidate).toMatchObject({ taxYear: 2026, filingQualified: false,
      exportsEnabled: false, reviewStatus: "independent-review-pending" });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(Object.isFrozen(candidate.printedConstants)).toBe(true);
    expect(Object.isFrozen(candidate.emptyPrintedAmountAnchors)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes(original.filename, bytes, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes(original.filename, bytes, 2026)).toThrow(/No qualified review/);
  });
});
