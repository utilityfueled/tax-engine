/** Spec: spec/federal/form-3903-2026-template.yaml. */
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const blank = new URL("../../forms/blank/2026/f3903.pdf", import.meta.url);
type SourceContract = {
  filename: string;
  sha256: string;
  bytes: number;
  leaves: number;
  locations: Record<string, { name: string; rect: number[]; type: "/Tx" | "/Btn"; onState?: string }>;
};

async function original() {
  return JSON.parse(await readFile(new URL("../fixtures/pdf-2026/form-3903-source.json", import.meta.url), "utf8")) as SourceContract;
}

async function mapping() {
  const { FORM_3903_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-3903-candidate.js");
  return FORM_3903_2026_CANDIDATE;
}

function expectNonemptyStream(appearance: unknown) {
  expect(appearance).toBeInstanceOf(PDFRawStream);
  expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
}

const eligibility = { kind: "military", activeDuty: true, permanentChangeOfStationOrdered: true } as const;
const move = {
  moveReference: "PRIVATE-2026-MOVE", accountHolder: "primary", date: "2026-07-01",
  domesticSameYearConfirmed: true, eligibility, lineAmountsConfirmed: true,
  transportationAndStorage: "20.10", reimbursementsExcludedFromIncome: "0",
  travel: { transportationAndLodging: "1.12", vehicle: { method: "mileage", parkingAndTolls: "1.01", entries: [
    { date: "2026-06-30", miles: "101.2" }, { date: "2026-07-01", miles: "202.4" },
  ] } },
} as const;
const base = { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 } };
const annualMove = (facts: object = {}) => ({ taxYear: 2026, moves: [{ ...move, ...facts }] });
const codeP = (amount: string) => [{ ...base.w2s[0], accountHolder: "primary" as const, taxYear: 2026, box12CodeP: amount }];
const projection = async () => (await import("@/pdf/mappings/2026/form-3903-candidate.js")).projectForm3903CandidateFields;

describe("Final 2026 Form 3903 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const bytes = await readFile(blank).catch(() => undefined);
    expect(bytes, "the final 2026 physical source must exist").toBeDefined();
    if (!bytes) return;
    const [source, candidate, pdf] = await Promise.all([original(), mapping(), PDFDocument.load(bytes)]);
    expect(bytes.length).toBe(source.bytes);
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("d1d0b934ba9b046509b33f1aa7617d619241c3334b476f233dfb8e04a9902373");
    expect(candidate.sha256).toBe(source.sha256);
    expect(candidate.sourceRevision).toBe("Created 9/17/26");
    expect(pdf.getTitle()).toBe("2026 Form 3903");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([{ width: 612, height: 792 }]);
  });

  it("maps every leaf to its exact annual physical location", async () => {
    const [source, candidate, pdf] = await Promise.all([original(), mapping(), readFile(blank).then(bytes => PDFDocument.load(bytes))]);
    const form = pdf.getForm();
    expect(form.getFields()).toHaveLength(source.leaves);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(source.locations).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
    for (const [key, location] of Object.entries(source.locations)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name).toBe(location.name);
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
      expect(widget.P()).toEqual(pdf.getPage(0).ref);
      if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(location.onState);
    }
  });

  it("records the printed branch destinations", async () => {
    const candidate = await mapping();
    expect(candidate.printedReferences).toEqual({
      line4: ["Form W-2 box 1", "Form W-2 box 12 code P"],
      line5Yes: ["Schedule 1 (Form 1040) line 14"],
      line5NoWithExcess: ["Form 1040 / 1040-SR / 1040-NR line 1h"],
    });
  });

  it("retains the diagnostic values and checkbox states after save", async () => {
    const [candidate, source] = await Promise.all([mapping(), readFile(blank)]);
    const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
    for (const deduction of [false, true]) {
      const pdf = await PDFDocument.load(source);
      const form = pdf.getForm();
      const { fields } = candidate;
      const textValues = new Map([
        [fields.name, "FICTIONAL FIELD PROBE"], [fields.ssn, "REDACTED"],
        [fields.line1, "3100"], [fields.line2, "420"], [fields.line3, "3520"],
        [fields.line4, deduction ? "100" : "4000"],
      ]);
      if (deduction) textValues.set(fields.line5, "3420");
      for (const [name, value] of textValues) form.getTextField(name).setText(value);
      const checkboxValues = new Map([
        [fields.certification, deduction], [fields.line5No, !deduction], [fields.line5Yes, deduction],
      ]);
      for (const [name, selected] of checkboxValues) {
        const checkbox = form.getCheckBox(name);
        if (selected) checkbox.check(); else checkbox.uncheck();
      }
      await markReviewPdf(pdf);
      const bytes = await pdf.save();
      const reopened = await PDFDocument.load(bytes);
      const saved = reopened.getForm();
      expect(saved.getFields()).toHaveLength(10);
      if (!deduction) expect(saved.getTextField(fields.line5).getText()).toBeUndefined();
      for (const [name, value] of textValues) {
        const field = saved.getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        expectNonemptyStream(field.acroField.getWidgets()[0].getAppearances()?.normal);
      }
      for (const [name, selected] of checkboxValues) {
        const checkbox = saved.getCheckBox(name);
        const widget = checkbox.acroField.getWidgets()[0];
        const state = selected ? checkbox.acroField.getOnValue() : PDFName.of("Off");
        expect(checkbox.isChecked()).toBe(selected);
        expect(widget.getAppearanceState()).toEqual(state);
        const normal = widget.getAppearances()?.normal;
        expect(normal).toBeInstanceOf(PDFDict);
        expectNonemptyStream((normal as PDFDict).lookup(state as PDFName));
      }
      const contents = reopened.getPage(0).node.Contents();
      const streams = contents instanceof PDFArray
        ? contents.asArray().map(ref => reopened.context.lookup(ref)) : [contents];
      const text = streams.filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
        .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
      expect(text.split(noticeHex).length - 1).toBe(1);
      if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
        const directory = process.env.TAX_CANDIDATE_ARTIFACT_DIR;
        const stat = await lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Artifact directory must be a real directory");
        await writeFile(join(directory, `form-3903-${deduction ? "yes" : "no"}.pdf`), bytes, { flag: "wx", mode: 0o600 });
      }
    }
  });

  it("projects complete source amounts and both certified line 5 branches", async () => {
    const [candidate, project, source] = await Promise.all([mapping(), projection(), readFile(blank)]);
    const { fields } = candidate;
    const cases = [
      { label: "deduction", reimbursement: "0", w2s: base.w2s, omitted: undefined, lines: ["20", "70", "90", "0", "90"], yes: true },
      { label: "excess", reimbursement: "110", w2s: codeP("90"), omitted: "20", lines: ["20", "70", "90", "110", undefined], yes: false },
      { label: "equal", reimbursement: "90", w2s: codeP("90"), omitted: "0", lines: ["20", "70", "90", "90", undefined], yes: false },
    ];
    for (const item of cases) {
      const form3903 = annualMove(item.label === "deduction" ? { transportationAndStorage: "19.50" } : {
        eligibility: { kind: "intelligence-community", employmentStatus: "new-appointee", qualifyingElement: true, nonMilitary: true, assignmentRequiresRelocation: true },
        transportationAndStorage: "19.56", reimbursementsExcludedFromIncome: item.reimbursement, omittedTaxableExcess: item.omitted,
      });
      const input = TaxYearInputSchema.parse({ ...base, w2s: item.w2s, form3903 });
      const projected = project(input);
      expect(Object.keys(projected)).toHaveLength(item.yes ? 8 : 7);
      expect([fields.line1, fields.line2, fields.line3, fields.line4, fields.line5].map(field => projected[field])).toEqual(item.lines);
      expect([fields.certification, fields.line5Yes, fields.line5No].map(field => projected[field])).toEqual([true, item.yes, !item.yes]);
      const pdf = await PDFDocument.load(source);
      const form = pdf.getForm();
      for (const [name, value] of Object.entries(projected)) {
        if (typeof value === "string") form.getTextField(name).setText(value);
        else if (value) form.getCheckBox(name).check();
        else form.getCheckBox(name).uncheck();
      }
      await markReviewPdf(pdf);
      const bytes = await pdf.save();
      const saved = (await PDFDocument.load(bytes)).getForm();
      expect(saved.getTextField(fields.name).getText()).toBeUndefined();
      expect(saved.getTextField(fields.ssn).getText()).toBeUndefined();
      expect(saved.getTextField(fields.line5).getText()).toBe(item.lines[4]);
      for (const [name, value] of Object.entries(projected)) {
        if (typeof value === "string") expect(saved.getTextField(name).getText()).toBe(value);
        else expect(saved.getCheckBox(name).isChecked()).toBe(value);
      }
      if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
        const directory = process.env.TAX_CANDIDATE_ARTIFACT_DIR;
        const stat = await lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Artifact directory must be a real directory");
        await writeFile(join(directory, `form-3903-project-${item.label}.pdf`), bytes, { flag: "wx", mode: 0o600 });
      }
    }
  });

  it("holds unqualified or inconsistent moving projections", async () => {
    const project = await projection();
    const current = TaxYearInputSchema.parse({ ...base, form3903: annualMove() });
    const rejects = [
      [{ ...current, form3903: undefined }, /source/i],
      [{ ...current, taxpayer: { ...current.taxpayer, taxYear: 2025 } }, /2026/i],
      [{ ...current, form2555: {} }, /federal-only/i],
      [{ ...current, ohioResidency: {} }, /federal-only/i],
      [{ ...current, taxpayer: { ...current.taxpayer, filingStatus: "head_of_household" } }, /single/i],
      [{ ...current, form3903: annualMove({ accountHolder: "spouse" }) }, /primary/i],
      [{ ...current, form3903: annualMove({ domesticSameYearConfirmed: false }) }, /source/i],
      [{ ...current, form3903: { taxYear: 2026, moves: [move, { ...move, date: "2026-08-01", moveReference: "OTHER" }] } }, /one/i],
      [TaxYearInputSchema.parse({ ...base, form3903: annualMove({ reimbursementsExcludedFromIncome: "10" }) }), /Code P/i],
      [TaxYearInputSchema.parse({ ...base, w2s: codeP("9"), form3903: annualMove({ reimbursementsExcludedFromIncome: "10", omittedTaxableExcess: "0" }) }), /reconcile/i],
      [current, /rounded/i],
      [TaxYearInputSchema.parse({ ...base, w2s: codeP("90.10"), form3903: annualMove({
        transportationAndStorage: "19.69", reimbursementsExcludedFromIncome: "90.10", omittedTaxableExcess: "0",
      }) }), /rounded/i],
    ] as const;
    for (const [value, message] of rejects) expect(() => project(value as Parameters<typeof project>[0])).toThrow(message);
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
    expect(() => assertReviewTemplateBytes("f3903.pdf", source, 2025)).toThrow(/No registered review template/);
    expect(() => assertReviewTemplateBytes("f3903.pdf", source, 2026)).toThrow(/No qualified review/);
  });
});
