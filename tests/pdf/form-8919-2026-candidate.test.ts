/** Spec: spec/federal/form-8919-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assertPdfExportAllowed, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f8919.pdf", import.meta.url);

async function loadCandidate() {
  const { FORM_8919_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-8919-candidate.js");
  return FORM_8919_2026_CANDIDATE;
}

describe("Final 2026 Form 8919 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const [candidate, bytes] = await Promise.all([loadCandidate(), readFile(blank)]);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(sha256).toBe("b7bfa1eb7b4b1893acdcc6399103e8cc0388e4dd64c9522e586adccdba0b42dc");
    expect(bytes.length).toBe(85924);
    expect(candidate).toMatchObject({
      sha256,
      sourceUrl: "https://www.irs.gov/pub/irs-pdf/f8919.pdf",
      annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f8919--2026.pdf",
      sourceRevision: "Created 5/14/26",
      postedDate: "2026-11-20",
      retrievedAt: "2026-11-20T22:45:29Z",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 8919");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([
      { width: 612, height: 792 },
      { width: 612, height: 792 },
    ]);
  });

  it("confirms the physical page and widget census", async () => {
    const pdf = await PDFDocument.load(await readFile(blank));
    const fields = pdf.getForm().getFields();
    expect(fields).toHaveLength(40);
    expect(fields.filter(field => field instanceof PDFTextField)).toHaveLength(35);
    expect(fields.filter(field => field instanceof PDFCheckBox)).toHaveLength(5);
    const pages = pdf.getPages();
    const widgets = fields.flatMap(field => field.acroField.getWidgets());
    expect(widgets).toHaveLength(40);
    expect(pages.map(page => page.node.Annots()?.size() ?? 0)).toEqual([40, 0]);
    expect(pages.map(page => widgets.filter(widget => widget.P() === page.ref).length)).toEqual([40, 0]);
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
    expect(() => assertReviewTemplateBytes("f8919.pdf", bytes, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8919.pdf", bytes, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  });
});
