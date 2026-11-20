/** Spec: spec/federal/schedule-eic-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f1040sei.pdf", import.meta.url);
const blankDigest = "c46a19f4dc50bfaa6d676579a529602653a4035dabdfeb6112a2a32ce4de631c";

// Visual order follows the numbered IRS text field suffixes, with twelve one-digit year fields.
const textValues = {
  name: "SYNTHETIC HOUSEHOLD", ssn: "000-00-0000",
  child1Name: "ALPHA SAMPLE", child2Name: "BRAVO SAMPLE", child3Name: "CHARLIE SAMPLE",
  child1SSN: "000-00-0001", child2SSN: "000-00-0002", child3SSN: "000-00-0003",
  child1YearDigit1: "2", child1YearDigit2: "0", child1YearDigit3: "1", child1YearDigit4: "0",
  child2YearDigit1: "2", child2YearDigit2: "0", child2YearDigit3: "0", child2YearDigit4: "7",
  child3YearDigit1: "2", child3YearDigit2: "0", child3YearDigit3: "0", child3YearDigit4: "4",
  child1Relationship: "DAUGHTER", child2Relationship: "NEPHEW", child3Relationship: "GRANDCHILD",
  child1Months: "7", child2Months: "9", child3Months: "12",
} as const;
const pairs = [
  ["child1Line4aYes", "child1Line4aNo"], ["child2Line4aYes", "child2Line4aNo"],
  ["child3Line4aYes", "child3Line4aNo"], ["child1Line4bYes", "child1Line4bNo"],
  ["child2Line4bYes", "child2Line4bNo"], ["child3Line4bYes", "child3Line4bNo"],
] as const;

async function mapping() {
  const { SCHEDULE_EIC_2026_CANDIDATE } = await import("@/pdf/mappings/2026/schedule-eic-candidate.js");
  return SCHEDULE_EIC_2026_CANDIDATE;
}

function expectAppearance(stream: unknown) {
  expect(stream).toBeInstanceOf(PDFRawStream);
  expect(decodePDFRawStream(stream as PDFRawStream).decode().length).toBeGreaterThan(0);
}

describe("Final 2026 Schedule EIC physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    expect(bytes.length).toBe(107429);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(blankDigest);
    expect(candidate).toMatchObject({
      taxYear: 2026, sha256: blankDigest, sourceRevision: "Created 5/28/26",
      sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040sei.pdf",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Schedule EIC (Form 1040)");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([
      { width: 611.976, height: 791.968 }, { width: 611.976, height: 791.968 },
    ]);
  });

  it("locates each text box and checkbox in its printed child column", async () => {
    const [candidate, pdf] = await Promise.all([mapping(), readFile(blank).then(bytes => PDFDocument.load(bytes))]);
    const form = pdf.getForm();
    const fields = form.getFields();
    const names = fields.map(field => field.getName());
    const page = pdf.getPage(0);
    expect(fields.filter(field => field instanceof PDFTextField)).toHaveLength(26);
    expect(fields.filter(field => field instanceof PDFCheckBox)).toHaveLength(12);
    expect(pdf.getPages().map(item => item.node.Annots()?.size() ?? 0)).toEqual([38, 0]);
    expect(Object.keys(candidate.fields).sort()).toEqual([...Object.keys(textValues), ...pairs.flat()].sort());
    expect(Object.values(candidate.fields).sort()).toEqual(names.sort());
    expect(candidate.checkboxStates).toEqual({ yes: "/1", no: "/2", off: "/Off" });

    const textKeys = Object.keys(textValues) as Array<keyof typeof textValues>;
    for (const [index, key] of textKeys.entries()) {
      const name = candidate.fields[key];
      expect(name.endsWith(`.f1_${String(index + 1).padStart(2, "0")}[0]`), key).toBe(true);
      const field = form.getTextField(name);
      if (key.includes("YearDigit")) expect(field.getMaxLength(), key).toBe(1);
      if (key.endsWith("Months")) expect(field.getMaxLength(), key).toBe(2);
    }

    for (const [index, [yesKey, noKey]] of pairs.entries()) {
      const yes = form.getCheckBox(candidate.fields[yesKey]).acroField.getWidgets()[0];
      const no = form.getCheckBox(candidate.fields[noKey]).acroField.getWidgets()[0];
      const left = 216 + (index % 3) * 122.4;
      expect(yes.getRectangle().x, yesKey).toBeCloseTo(left, 3);
      expect(no.getRectangle().x, noKey).toBeCloseTo(left + 61.2, 3);
      expect(yes.getRectangle().y, yesKey).toBeCloseTo(index < 3 ? 266.468 : 224.467, 3);
      expect(no.getRectangle().y, noKey).toBeCloseTo(yes.getRectangle().y, 3);
      expect(yes.getOnValue()?.toString(), yesKey).toBe("/1");
      expect(no.getOnValue()?.toString(), noKey).toBe("/2");
      expect(yes.getAppearanceState()?.toString(), yesKey).toBe("/Off");
      expect(no.getAppearanceState()?.toString(), noKey).toBe("/Off");
    }

    // Independent pypdf widget enumeration, sorted by full AcroForm field path.
    const geometry = names.map(name => {
      const field = form.getField(name);
      expect(field.acroField.getWidgets(), name).toHaveLength(1);
      const [widget] = field.acroField.getWidgets();
      expect(widget.P(), name).toEqual(page.ref);
      const { x, y, width, height } = widget.getRectangle();
      const rect = [x, y, x + width, y + height].map(value => Math.round(value * 1000));
      const normal = widget.getAppearances()?.normal;
      const states = normal instanceof PDFDict ? normal.keys().map(key => key.toString()).sort() : [];
      return [name, 1, field.acroField.FT()?.toString(), rect, states];
    });
    expect(createHash("sha256").update(JSON.stringify(geometry)).digest("hex"))
      .toBe("9a82eb51158af1610a9f8a534a0ef494e7f4496740e535250acebad11f78c5ad");
  });

  it("records the printed attachment and credit reference", async () => {
    expect((await mapping()).printedReferences).toEqual({
      attachmentSequence: 43,
      attachesTo: ["Form 1040", "Form 1040-SR"],
      creditInstructions: "Form 1040, line 27a",
    });
  });

  it("reopens text and both checkbox choices with their native appearances", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    for (const phase of [0, 1]) {
      const pdf = await PDFDocument.load(bytes);
      const form = pdf.getForm();
      const textKeys = Object.keys(textValues) as Array<keyof typeof textValues>;
      for (const key of textKeys) form.getTextField(candidate.fields[key]).setText(textValues[key]);

      const expected = new Map<string, string>();
      for (const [index, pair] of pairs.entries()) {
        for (const [choice, key] of pair.entries()) {
          const name = candidate.fields[key];
          const checkbox = form.getCheckBox(name);
          const selected = (index + phase) % 2 === choice;
          if (selected) checkbox.check();
          else checkbox.uncheck();
          expected.set(name, selected ? `/${choice + 1}` : "/Off");
        }
      }
      await markReviewPdf(pdf);
      const reopened = await PDFDocument.load(await pdf.save());
      const saved = reopened.getForm();
      expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
      expect(saved.hasXFA()).toBe(false);
      expect(saved.getFields()).toHaveLength(38);
      expect(reopened.getPages().map(page => page.node.Annots()?.size() ?? 0)).toEqual([38, 0]);
      for (const key of textKeys) {
        const field = saved.getTextField(candidate.fields[key]);
        expect(field.getText(), key).toBe(textValues[key]);
        expect(field.acroField.getValue()?.decodeText(), key).toBe(textValues[key]);
        expectAppearance(field.acroField.getWidgets()[0].getAppearances()?.normal);
      }
      for (const [name, state] of expected) {
        const box = saved.getCheckBox(name);
        const [widget] = box.acroField.getWidgets();
        expect(box.isChecked(), name).toBe(state !== "/Off");
        expect(box.acroField.getValue().toString(), name).toBe(state);
        expect(widget.getAppearanceState()?.toString(), name).toBe(state);
        const normal = widget.getAppearances()?.normal;
        expect(normal, name).toBeInstanceOf(PDFDict);
        expectAppearance((normal as PDFDict).lookup(PDFName.of(state.slice(1))));
      }
    }
  });

  it("keeps the physical candidate outside public exports", async () => {
    const [candidate, annual2026, annual2025] = await Promise.all([
      mapping(), readFile(blank), readFile(new URL("../../forms/blank/2025/f1040sei.pdf", import.meta.url)),
    ]);
    expect(candidate).toMatchObject({ exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending" });
    expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
    expect(() => assertReviewTemplateBytes("f1040sei.pdf", annual2025, 2025)).not.toThrow();
    expect(() => assertReviewTemplateBytes("f1040sei.pdf", annual2026, 2025)).toThrow();
    expect(() => assertReviewTemplateBytes("f1040sei.pdf", annual2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "review")).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  });
});
