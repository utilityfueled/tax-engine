/** Spec: spec/federal/form-2106-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assertPdfExportAllowed, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f2106.pdf", import.meta.url);

async function loadCandidate() {
  const { FORM_2106_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-2106-candidate.js");
  return FORM_2106_2026_CANDIDATE;
}

describe("Final 2026 Form 2106 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const [candidate, bytes] = await Promise.all([loadCandidate(), readFile(blank)]);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(sha256).toBe("794f7d7f84fd3a878e18751622949403d8499474c807fb05b3ee2e0bd811bc1b");
    expect(bytes.length).toBe(108061);
    expect(candidate).toMatchObject({
      sha256,
      sourceUrl: "https://www.irs.gov/pub/irs-pdf/f2106.pdf",
      annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f2106--2026.pdf",
      sourceRevision: "Created 8/18/26",
      postedDate: "2026-11-20",
      retrievedAt: "2026-11-20T18:56:43Z",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 2106");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([
      { width: 611.976, height: 791.968 },
      { width: 611.976, height: 791.968 },
    ]);
  });

  it("confirms the physical page and widget census", async () => {
    const pdf = await PDFDocument.load(await readFile(blank));
    const fields = pdf.getForm().getFields();
    expect(fields).toHaveLength(87);
    expect(fields.filter(field => field instanceof PDFTextField)).toHaveLength(79);
    expect(fields.filter(field => field instanceof PDFCheckBox)).toHaveLength(8);
    const pages = pdf.getPages();
    const widgets = fields.flatMap(field => field.acroField.getWidgets());
    expect(widgets).toHaveLength(87);
    expect(pages.map(page => page.node.Annots()?.size())).toEqual([24, 63]);
    expect(pages.map(page => widgets.filter(widget => widget.P() === page.ref).length)).toEqual([24, 63]);
  });

  it("keeps the physical candidate outside public exports", async () => {
    const [candidate, bytes] = await Promise.all([loadCandidate(), readFile(blank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026,
      reviewStatus: "independent-review-pending",
      exportsEnabled: false,
      filingQualified: false,
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.hasOwn(candidate, "fields")).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
    expect(() => assertReviewTemplateBytes("f2106.pdf", bytes, 2025)).toThrow(/No registered review template/);
    expect(() => assertReviewTemplateBytes("f2106.pdf", bytes, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  });
});
