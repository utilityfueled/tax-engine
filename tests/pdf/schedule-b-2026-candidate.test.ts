/** Spec: spec/federal/schedule-b-2026-template.yaml. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFCheckBox, PDFTextField } from "pdf-lib";
import { expect, it } from "vitest";
import { assertPdfExportAllowed, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import { SCHEDULE_B_2026_CANDIDATE as candidate } from "@/pdf/mappings/2026/schedule-b-candidate.js";
import { loadPdfDocumentQuietly } from "@/pdf/pdf-utils.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f1040sb.pdf", import.meta.url);
const page1 = "topmostSubform[0].Page1[0].";

it("pins the final bytes and checks the printed year and destinations", async () => {
  const bytes = await readFile(blank);
  const sha256 = "f4b1827b12113dcdc2b5e14181b3c658fa5553a277dea02e5106000b592815af";
  expect(bytes).toHaveLength(72863);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
  expect(candidate).toMatchObject({
    taxYear: 2026, sourceRevision: "Created 6/9/26", postedDate: "2026-11-24", sha256,
    sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040sb.pdf",
    annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f1040sb--2026.pdf",
  });
  const pdf = await loadPdfDocumentQuietly(bytes);
  expect(pdf.getTitle()).toBe("2026 Schedule B (Form 1040)");
  expect(pdf.getPages().map(page => page.getSize())).toEqual([{ width: 612, height: 792 }]);
  const printed = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
    "from sys import argv; from pypdf import PdfReader; print(PdfReader(argv[1]).pages[0].extract_text())",
    fileURLToPath(blank)], { encoding: "utf8", timeout: 10000, maxBuffer: 65536 });
  expect(printed).toContain("Schedule B (Form 1040) 2026 Created 6/9/26");
  expect(printed).toContain("Enter the result here and on Form 1040 or 1040-SR, line 2b");
  expect(printed).toContain("Enter the total here and on Form 1040 or 1040-SR, line 3b");
  expect(printed).not.toMatch(/DRAFT|DO NOT FILE/iu);
});

it("inventories the exact blank text and checkbox widgets", async () => {
  const pdf = await loadPdfDocumentQuietly(await readFile(blank));
  const page = pdf.getPage(0);
  expect(page.node.Annots()?.size()).toBe(72);
  const fields = pdf.getForm().getFields();
  const textFields = fields.filter(field => field instanceof PDFTextField);
  const checkboxes = fields.filter(field => field instanceof PDFCheckBox);
  expect(fields).toHaveLength(72);
  expect(textFields).toHaveLength(66);
  expect(checkboxes).toHaveLength(6);
  expect(textFields.every(field => !field.getText())).toBe(true);
  expect(checkboxes.every(field => !field.isChecked())).toBe(true);
  expect(textFields.map(field => field.getName())).toEqual(candidate.nativeTextFields);
  expect(checkboxes.map(field => field.getName())).toEqual(candidate.nativeCheckboxFields);
  expect(new Set(fields.map(field => field.getName())).size).toBe(72);
  for (const field of fields) {
    const widgets = field.acroField.getWidgets();
    expect(widgets).toHaveLength(1);
    expect(widgets[0].P()).toBe(page.ref);
  }
  expect(candidate.nativeTextFields[2]).toBe(page1 + "Line1_ReadOrder[0].f1_03[0]");
  expect(candidate.nativeTextFields[33]).toBe(page1 + "ReadOrderControl[0].f1_34[0]");
  expect(candidate.nativeCheckboxFields.slice(0, 2)).toEqual([
    page1 + "TagcorrectingSubform[0].c1_1[0]", page1 + "TagcorrectingSubform[0].c1_1[1]",
  ]);
});

it("keeps the source pin outside public review and filing", async () => {
  const bytes = await readFile(blank);
  expect(Object.isFrozen(candidate)).toBe(true);
  expect(Object.isFrozen(candidate.nativeTextFields)).toBe(true);
  expect(Object.isFrozen(candidate.nativeCheckboxFields)).toBe(true);
  expect(candidate).toMatchObject({ reviewStatus: "independent-review-pending", exportsEnabled: false, filingQualified: false });
  expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
  expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
  expect(() => assertReviewTemplateBytes("f1040sb.pdf", bytes, 2025)).toThrow(/No registered review template|Unreviewed template revision/);
  expect(() => assertReviewTemplateBytes("f1040sb.pdf", bytes, 2026)).toThrow(/No qualified review/);
  expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
});
