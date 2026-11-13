/** Spec: spec/federal/schedule-8812-2026-template.yaml. Physical source only. */
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f1040s8.pdf", import.meta.url);
type SourceContract = {
  filename: string;
  sha256: string;
  bytes: number;
  pages: number;
  leafWidgets: number;
  locations: Record<string, { fieldName: string; page: number; rect: string[]; type: string; onState?: string; readOnly?: boolean }>;
};
const original = JSON.parse(await readFile(
  new URL("../fixtures/pdf-2026/schedule-8812-source.json", import.meta.url), "utf8",
)) as SourceContract;

async function mapping() {
  const { SCHEDULE_8812_2026_CANDIDATE } = await import("@/pdf/mappings/2026/schedule-8812-candidate.js");
  return SCHEDULE_8812_2026_CANDIDATE;
}

describe("Final 2026 Schedule 8812 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const bytes = await readFile(blank).catch(() => undefined);
    expect(bytes, "the final 2026 physical source must exist").toBeDefined();
    if (!bytes) return;
    expect(bytes.length).toBe(96696);
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("05b96bd809b37cfd0c223ac0909d2d82645eb8bfd6244701189f40ab8a4ab45c");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("2026 Schedule 8812 (Form 1040)");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([
      { width: 612, height: 792 }, { width: 612, height: 792 },
    ]);
    const candidate = await mapping();
    expect(candidate.sha256).toBe(original.sha256);
    expect(candidate.sourceRevision).toBe("Created 8/18/26");
  });

  it("maps every leaf to its exact 2026 physical location", async () => {
    const [candidate, pdf] = await Promise.all([mapping(), readFile(blank).then(bytes => PDFDocument.load(bytes))]);
    const form = pdf.getForm();
    expect(form.getFields()).toHaveLength(41);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(original.locations).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
    for (const [key, location] of Object.entries(original.locations)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name).toBe(location.fieldName);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(location.type === "/Tx" ? PDFTextField : PDFCheckBox);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const [widget] = widgets;
      const rect = widget.getRectangle();
      const [left, bottom, right, top] = location.rect.map(Number);
      expect(rect.x).toBeCloseTo(left, 3);
      expect(rect.y).toBeCloseTo(bottom, 3);
      expect(rect.width).toBeCloseTo(right - left, 3);
      expect(rect.height).toBeCloseTo(top - bottom, 3);
      expect(widget.P()).toEqual(pdf.getPages()[location.page - 1].ref);
      if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(location.onState);
      if (location.readOnly && field instanceof PDFTextField) {
        expect(field.isReadOnly()).toBe(true);
        expect(field.getText()).toBeUndefined();
      }
    }
  });

  it("records the annual printed transfer references and amounts", async () => {
    const candidate = await mapping();
    expect(candidate.printedReferences).toEqual({
      line1: ["Form 1040 / 1040-SR / 1040-NR line 11b"],
      line22: ["Schedule 1 line 15", "Schedule 2 line 16c", "Schedule 2 line 17c"],
    });
    expect(candidate.printedAmounts).toEqual({ line5: "$2,200", line7: "$500", line16b: "$1,700" });
  });

  it("retains diagnostic values and both states of every checkbox after save", async () => {
    const candidate = await mapping();
    const source = await readFile(blank);
    const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
    for (const selectYes of [false, true]) {
      const pdf = await PDFDocument.load(source);
      const form = pdf.getForm();
      const textValues = new Map<string, string>();
      const checkboxValues = new Map<string, boolean>();
      for (const [key, name] of Object.entries(candidate.fields)) {
        const field = form.getField(name);
        if (field instanceof PDFTextField) {
          if (key === candidate.reservedField) continue;
          const probe = key === "ssn" ? "REDACTED" : key === "name" ? "FICTIONAL FIELD PROBE" : String(textValues.size + 1);
          field.setText(probe);
          textValues.set(name, probe);
        } else if (field instanceof PDFCheckBox) {
          const selected = selectYes === key.endsWith("Yes");
          if (selected) field.check(); else field.uncheck();
          checkboxValues.set(name, selected);
        } else throw new Error("Unexpected field type in the original");
      }
      await markReviewPdf(pdf);
      const bytes = await pdf.save();
      const reopened = await PDFDocument.load(bytes);
      const saved = reopened.getForm();
      expect(saved.getFields()).toHaveLength(original.leafWidgets);
      expect(textValues.size).toBe(34);
      expect(checkboxValues.size).toBe(6);
      const reserved = saved.getTextField(candidate.fields[candidate.reservedField]);
      expect(reserved.isReadOnly()).toBe(true);
      expect(reserved.getText()).toBeUndefined();
      for (const [name, value] of textValues) {
        const field = saved.getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        const appearance = field.acroField.getWidgets()[0].getAppearances()?.normal;
        expect(appearance).toBeInstanceOf(PDFRawStream);
        expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
      }
      for (const [name, selected] of checkboxValues) {
        const checkbox = saved.getCheckBox(name);
        const widget = checkbox.acroField.getWidgets()[0];
        const state = selected ? checkbox.acroField.getOnValue() : PDFName.of("Off");
        expect(checkbox.isChecked()).toBe(selected);
        expect(widget.getAppearanceState()).toEqual(state);
        const normal = widget.getAppearances()?.normal;
        expect(normal).toBeInstanceOf(PDFDict);
        const appearance = (normal as PDFDict).lookup(state as PDFName);
        expect(appearance).toBeInstanceOf(PDFRawStream);
        expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
      }
      for (const page of reopened.getPages()) {
        const contents = page.node.Contents();
        const streams = contents instanceof PDFArray
          ? contents.asArray().map(ref => reopened.context.lookup(ref)) : [contents];
        const text = streams.filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
          .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
        expect(text.split(noticeHex).length - 1).toBe(1);
      }
      if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
        const directory = process.env.TAX_CANDIDATE_ARTIFACT_DIR;
        const stat = await lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Artifact directory must be a real directory");
        await writeFile(join(directory, `schedule-8812-${selectYes ? "yes" : "no"}.pdf`), bytes, { flag: "wx", mode: 0o600 });
      }
    }
  });

  it("keeps every export gate closed", async () => {
    const [candidate, source] = await Promise.all([mapping(), readFile(blank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending",
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes(original.filename, source, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes(original.filename, source, 2026)).toThrow(/No qualified review/);
  });
});
