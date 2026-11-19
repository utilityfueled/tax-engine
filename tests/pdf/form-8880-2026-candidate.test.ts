/** Spec: spec/federal/form-8880-2026-template.yaml. */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { FORM_8880_2026_CANDIDATE as candidate } from "@/pdf/mappings/2026/form-8880-candidate.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import fixture from "./sources/form-8880-2026.json";

const blank = new URL("../../forms/blank/2026/f8880.pdf", import.meta.url);
const historicalBlank = new URL("../../forms/blank/2025/f8880.pdf", import.meta.url);

describe("Final 2026 Form 8880 physical candidate", () => {
  it("pins the final combined annual source", async () => {
    const bytes = await readFile(blank);
    const doc = await PDFDocument.load(bytes);
    expect(bytes).toHaveLength(86366);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(fixture.source.sha256);
    expect(candidate.sourceUrl).toBe(fixture.source.archiveUrl);
    expect(candidate.sha256).toBe(fixture.source.sha256);
    expect(candidate.sourceRevision).toBe("Created 3/16/26");
    expect(candidate.instructionsStatus).toBe("final-2026-integrated-page-2");
    expect(doc.getTitle()?.trim()).toBe("2026 Form 8880");
    expect(doc.getPageCount()).toBe(2);
    for (const page of doc.getPages()) expect(page.getSize()).toEqual({ width: 611.976, height: 791.968 });
  });

  it("matches every canonical field and page widget to its printed location", async () => {
    const doc = await PDFDocument.load(await readFile(blank));
    const fields = doc.getForm().getFields();
    expect(fields).toHaveLength(23);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(fixture.locations).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(fields.map(field => field.getName()).sort());
    for (const [index, page] of doc.getPages().entries()) {
      const pageFields = Object.values(fixture.locations).filter(location => location.page === index + 1);
      const widgetRefs = page.node.Annots()?.asArray().filter(ref =>
        doc.context.lookup(ref, PDFDict).get(PDFName.of("Subtype")) === PDFName.of("Widget"),
      ) ?? [];
      expect(widgetRefs.map(String).sort()).toEqual(pageFields.map(location => String(doc.getForm().getField(location.name).ref)).sort());
    }
    for (const [key, location] of Object.entries(fixture.locations)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name).toBe(location.name);
      const field = doc.getForm().getField(name);
      expect(field).toBeInstanceOf(PDFTextField);
      expect(field.acroField.dict.get(PDFName.of("FT"))?.toString()).toBe(location.type);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      expect(widgets[0].P()).toEqual(doc.getPage(location.page - 1).ref);
      const { x, y, width, height } = widgets[0].getRectangle();
      for (const [index, value] of [x, y, x + width, y + height].entries()) expect(value).toBeCloseTo(location.rect[index], 3);
      expect((field as PDFTextField).getMaxLength() ?? null).toBe(location.maxLength);
    }
  });

  it("records the annual printed references and rate table", () => {
    expect(candidate.printed).toEqual(fixture.printed);
    expect(candidate.printed.line8).toContain("line 11a");
    expect(candidate.printed.line12).toBe("Schedule 3 (Form 1040) line 4");
    expect(candidate.printed.rateTable).toHaveLength(10);
    expect(candidate.printed.rateTable[0]).toEqual(["---", "24250", "0.5", "0.5", "0.5"]);
    expect(candidate.printed.rateTable[9]).toEqual(["80500", "---", "0.0", "0.0", "0.0"]);
  });

  it("round-trips all diagnostic values and native rate digits with appearances", async () => {
    const bytes = await readFile(blank);
    for (const digit of ["5", "2", "1", "0"]) {
      const doc = await PDFDocument.load(bytes);
      const form = doc.getForm();
      expect(() => form.getTextField(candidate.fields.line9).setText("0.5")).toThrow(/length|max/i);
      const expected = new Map<string, string>();
      for (const [index, [key, name]] of Object.entries(candidate.fields).entries()) {
        const value = key === "name" ? "FICTIONAL FIELD PROBE" : key === "ssn" ? "REDACTED" : key === "line9" ? digit : key === "line1a" ? "0" : String(1000 + index);
        expected.set(name, value);
        form.getTextField(name).setText(value);
      }
      await markReviewPdf(doc);
      const saved = await PDFDocument.load(await doc.save());
      expect(saved.getForm().getFields()).toHaveLength(23);
      for (const [name, value] of expected) {
        const field = saved.getForm().getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        const [widget] = field.acroField.getWidgets();
        expect(widget.dict.get(PDFName.of("V")) ?? field.acroField.getValue()).toEqual(field.acroField.getValue());
        const stream = widget.getAppearances()?.normal;
        expect(stream).toBeInstanceOf(PDFRawStream);
        const appearance = Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("ascii");
        expect(appearance).toContain(Buffer.from(value).toString("hex").toUpperCase());
      }
      expect(saved.getForm().getTextField(candidate.fields.line9).getMaxLength()).toBe(1);
      for (const page of saved.getPages()) {
        const streams = page.node.normalizedEntries().Contents?.asArray().map(ref => saved.context.lookup(ref))
          .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream && stream.dict.has(PDFName.of("TaxEngineReviewNotice"))) ?? [];
        expect(streams).toHaveLength(1);
        expect(Buffer.from(decodePDFRawStream(streams[0]).decode()).toString("ascii")).toContain(Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase());
      }
    }
  });

  it("keeps annual and historical export gates closed", async () => {
    const [current, historical] = await Promise.all([readFile(blank), readFile(historicalBlank)]);
    expect(candidate).toMatchObject({ taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending" });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/);
    expect(() => assertPdfExportAllowed(2025, 2026)).toThrow(/years must match/);
    expect(() => assertPdfExportAllowed(2026, 2025)).toThrow(/years must match/);
    expect(() => assertReviewTemplateBytes("f8880.pdf", current, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8880.pdf", current, 2026)).toThrow(/No qualified review/);
    expect(() => assertReviewTemplateBytes("f8880.pdf", historical, 2026)).toThrow(/No qualified review/);
    expect(assertReviewTemplateBytes("f8880.pdf", historical, 2025).sha256).toBe(createHash("sha256").update(historical).digest("hex"));
  });
});
