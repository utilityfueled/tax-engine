/** Spec: spec/federal/form-8863-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assertPdfExportAllowed, markReviewPdf } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f8863.pdf", import.meta.url);
const sourceContract = new URL("./sources/form-8863-2026.json", import.meta.url);

type Location = {
  name: string;
  page: number;
  rect: [number, number, number, number];
  type: "/Tx" | "/Btn";
  onState?: string;
};

async function mapping() {
  const { FORM_8863_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-8863-candidate.js");
  return FORM_8863_2026_CANDIDATE;
}

function expectNonemptyStream(appearance: unknown) {
  expect(appearance).toBeInstanceOf(PDFRawStream);
  expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
}

describe("Final 2026 Form 8863 physical candidate", () => {
  it("pins the final annual PDF", async () => {
    const [bytes, candidate] = await Promise.all([readFile(blank), mapping()]);
    expect(bytes.length).toBe(107826);
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("290771de5dbbbede2de9e7cb2ba8a7d51a08aa10e89b4ed74cfdbdb631af167f");
    expect(candidate.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(candidate.sourceRevision).toBe("Created 4/28/26");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 8863");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([
      { width: 612, height: 792 }, { width: 612, height: 792 },
    ]);
  });

  it("locates every annual field on its printed page", async () => {
    const [source, candidate, pdf] = await Promise.all([
      readFile(sourceContract, "utf8").then(text => JSON.parse(text) as Record<string, Location>),
      mapping(),
      readFile(blank).then(bytes => PDFDocument.load(bytes)),
    ]);
    const form = pdf.getForm();
    expect(form.getFields()).toHaveLength(77);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(source).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
    for (const [key, location] of Object.entries(source)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name, key).toBe(location.name);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(location.type === "/Tx" ? PDFTextField : PDFCheckBox);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const [widget] = widgets;
      const { x, y, width, height } = widget.getRectangle();
      const [left, bottom, right, top] = location.rect;
      expect(x).toBeCloseTo(left, 3);
      expect(y).toBeCloseTo(bottom, 3);
      expect(width).toBeCloseTo(right - left, 3);
      expect(height).toBeCloseTo(top - bottom, 3);
      expect(widget.P()).toEqual(pdf.getPage(location.page - 1).ref);
      if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(location.onState);
    }
  });

  it("records the printed transfers", async () => {
    const candidate = await mapping();
    expect(candidate.printedReferences).toEqual({
      line1From: "All Parts III, line 30",
      line3From: "Form 1040 or 1040-SR, line 11a",
      line8To: "Form 1040 or 1040-SR, line 29",
      line9To: "Credit Limit Worksheet, line 2",
      line10From: "All Parts III, line 31",
      line14From: "Form 1040 or 1040-SR, line 11a",
      line18To: "Credit Limit Worksheet, line 1",
      line19From: "Credit Limit Worksheet, line 7",
      line19To: "Schedule 3 (Form 1040), line 3",
    });
  });

  it("retains diagnostic values and appearances after save", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    for (const yes of [false, true]) {
      const pdf = await PDFDocument.load(bytes);
      const form = pdf.getForm();
      const textValues = new Map<string, string>();
      const selections = new Map<string, boolean>();
      for (const [key, name] of Object.entries(candidate.fields)) {
        const field = form.getField(name);
        if (field instanceof PDFCheckBox) {
          const selected = key.endsWith("No") ? !yes : yes;
          selections.set(name, selected);
          if (selected) field.check(); else field.uncheck();
        } else if (field instanceof PDFTextField) {
          const value = /Ssn|Ein/.test(key) ? "0" : key.endsWith("Fraction") ? "500" : key.endsWith("Integer") ? "0" : "1";
          textValues.set(name, value);
          field.setText(value);
        }
      }
      expect(textValues.size).toBe(60);
      expect(selections.size).toBe(17);
      await markReviewPdf(pdf);
      const reopened = await PDFDocument.load(await pdf.save());
      const saved = reopened.getForm();
      for (const [name, value] of textValues) {
        const field = saved.getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        expectNonemptyStream(field.acroField.getWidgets()[0].getAppearances()?.normal);
      }
      for (const [name, selected] of selections) {
        const field = saved.getCheckBox(name);
        const widget = field.acroField.getWidgets()[0];
        const state = selected ? field.acroField.getOnValue() : PDFName.of("Off");
        if (!state) throw new Error(`Missing checkbox on-state for ${name}`);
        expect(field.isChecked()).toBe(selected);
        expect(widget.getAppearanceState()).toEqual(state);
        const normal = widget.getAppearances()?.normal;
        expect(normal).toBeInstanceOf(PDFDict);
        expectNonemptyStream((normal as PDFDict).lookup(state));
      }
    }
  });

  it("keeps public exports closed", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending",
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes("f8863.pdf", bytes, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8863.pdf", bytes, 2026)).toThrow(/No qualified review/);
  });
});
