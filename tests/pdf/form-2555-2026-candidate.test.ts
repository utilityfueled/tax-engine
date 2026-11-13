/** Spec: spec/federal/form-2555-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFCheckBox, PDFDocument, PDFName, PDFTextField } from "pdf-lib";
import { expect, it } from "vitest";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import { REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f2555.pdf", import.meta.url);
const digest = "a88984fa3dd5b5846cc446032aaa2e0a6489d5efc8ac63f62632613c7e3d6b11";
type Location = [page: number, name: string, kind: "/Tx" | "/Btn", rect: [number, number, number, number], states: string[]];

async function candidate() {
  const { FORM_2555_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-2555-candidate.js");
  return FORM_2555_2026_CANDIDATE;
}

async function readBlank() {
  const pdf = await PDFDocument.load(await readFile(blank));
  pdf.catalog.getAcroForm()?.dict.delete(PDFName.of("XFA"));
  return pdf;
}

it("pins the final blank and its revision", async () => {
  const bytes = await readFile(blank);
  expect(bytes.length).toBe(151196);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
  expect(await candidate()).toMatchObject({ taxYear: 2026, sha256: digest, sourceRevision: "Created 9/18/26" });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getTitle()).toBe("2026 Form 2555");
  expect(pdf.getPageCount()).toBe(3);
});

it("matches every field and widget to the official physical layout", async () => {
  const [pdf, mapping, locations] = await Promise.all([
    readBlank(), candidate(), readFile(new URL("../fixtures/pdf-2026/form-2555-source.json", import.meta.url), "utf8")
      .then(text => JSON.parse(text) as Location[]),
  ]);
  const form = pdf.getForm();
  const allMapped = [...Object.values(mapping.fields), ...mapping.usTravel.flatMap(row => Object.values(row)), ...mapping.physicalPresenceTravel.flatMap(row => Object.values(row))];
  expect(locations).toHaveLength(160);
  expect(locations.map(row => row[0]).reduce<number[]>((counts, page) => {
    counts[page - 1]++;
    return counts;
  }, [0, 0, 0])).toEqual([78, 53, 29]);
  expect(allMapped.sort()).toEqual(locations.map(([, name]) => name).sort());
  expect(allMapped).toEqual(form.getFields().map(field => field.getName()).sort());
  for (const [page, name, kind, [left, bottom, right, top], states] of locations) {
    const field = form.getField(name);
    expect(field).toBeInstanceOf(kind === "/Tx" ? PDFTextField : PDFCheckBox);
    const widgets = field.acroField.getWidgets();
    expect(widgets).toHaveLength(1);
    const [widget] = widgets;
    const { x, y, width, height } = widget.getRectangle();
    expect(x).toBeCloseTo(left, 3);
    expect(y).toBeCloseTo(bottom, 3);
    expect(width).toBeCloseTo(right - left, 3);
    expect(height).toBeCloseTo(top - bottom, 3);
    expect(widget.P()).toEqual(pdf.getPage(page - 1).ref);
    if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(states[0]);
  }
});

it("records the printed factors, split ratios and transfers", async () => {
  const mapping = await candidate();
  expect(mapping.printed).toEqual({
    dailyHousingBase: "58.26", annualHousingBase: "21264", annualExclusion: "132900", minimumRatioFractionDigits: 3,
    housingDeductionCarryoverYear: 2025, exclusionTransfer: "Schedule 1 line 8d", housingDeductionTransfer: "Schedule 1 line 24j",
  });
  const { fields } = mapping;
  expect([fields.line35Integer, fields.line35Fraction, fields.line39Integer, fields.line39Fraction]).toEqual(
    [10, 11, 15, 16].map(index => `topmostSubform[0].Page3[0].f3_${index}[0]`),
  );
  expect(mapping.usTravel).toHaveLength(8);
  expect(mapping.physicalPresenceTravel).toHaveLength(4);
});

it("reopens a marked diagnostic with distinct fields and blank identifiers", async () => {
  const [pdf, { fields, usTravel, physicalPresenceTravel }] = await Promise.all([readBlank(), candidate()]);
  const form = pdf.getForm();
  const diagnostic = new Map<string, string>([
    [fields.line2Occupation, "Synthetic analyst"],
    [usTravel[0].arrival, "01/14/26"], [usTravel[7].usBusinessIncome, "45"],
    [physicalPresenceTravel[0].country, "Canada"], [physicalPresenceTravel[3].usBusinessIncome, "23"],
    [fields.line26, "7342"], [fields.line27, "7342"], [fields.line35Integer, "0"], [fields.line35Fraction, "750"],
    [fields.line39Integer, "1"], [fields.line39Fraction, "000"], [fields.line44, "27"], [fields.line45, "5900"], [fields.line50, "310"],
  ]);
  for (const [field, value] of diagnostic) form.getTextField(field).setText(value);
  const checks = [fields.line6cNo, fields.line8aNo, fields.line15dYes, fields.claimHousingYes];
  for (const name of checks) form.getCheckBox(name).check();
  await markReviewPdf(pdf);
  const bytes = await pdf.save();
  const reopened = (await PDFDocument.load(bytes)).getForm();
  for (const [name, value] of diagnostic) {
    const field = reopened.getTextField(name);
    expect(field.getText()).toBe(value);
    expect(field.acroField.getWidgets()[0].getAppearances()?.normal).toBeDefined();
  }
  for (const name of checks) expect(reopened.getCheckBox(name).isChecked()).toBe(true);
  for (const name of [fields.name, fields.ssn]) expect(reopened.getTextField(name).getText()).toBeUndefined();
  expect(reopened.getCheckBox(fields.claimHousingNo).isChecked()).toBe(false);
  const evidence = process.env.TAX_ENGINE_FORM2555_CANDIDATE_EVIDENCE_DIR;
  if (evidence) await writeFile(join(evidence, "form-2555-diagnostic.pdf"), bytes);
});

it("keeps all annual export gates closed", async () => {
  const mapping = await candidate();
  expect(mapping).toMatchObject({ filingQualified: false, exportsEnabled: false, reviewStatus: "independent-review-pending" });
  expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
  expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified/u);
  expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/u);
});
