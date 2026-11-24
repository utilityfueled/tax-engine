/** Spec: spec/federal/form-8801.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Decimal from "decimal.js";
import { PDFTextField } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { calculateForm8801 } from "@/engine/forms/form-8801.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { FORM_8801_2026_CANDIDATE as candidate } from "@/pdf/mappings/2026/form-8801-candidate.js";
import { loadPdfDocumentQuietly } from "@/pdf/pdf-utils.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f8801.pdf", import.meta.url);

describe("Final 2026 Form 8801 physical source", () => {
  it("pins the official annual bytes and confirms all four pages and 57 text widgets", async () => {
    const bytes = await readFile(blank);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(sha256).toBe("782d879f1d6e3ca636c129a61092f957f86e028e056e5261e5feb3895410d8f1");
    expect(bytes.length).toBe(99515);
    expect(candidate).toMatchObject({
      taxYear: 2026, sha256,
      sourceUrl: "https://www.irs.gov/pub/irs-pdf/f8801.pdf",
      annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f8801--2026.pdf",
      sourceRevision: "Created 5/27/26",
      postedDate: "2026-11-23",
    });
    const pdf = await loadPdfDocumentQuietly(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 8801");
    const pages = pdf.getPages();
    const fields = pdf.getForm().getFields();
    expect(pages.map(page => page.getSize())).toEqual(Array.from({ length: 4 }, () => ({ width: 612, height: 792 })));
    expect(fields).toHaveLength(57);
    expect(fields.every(field => field instanceof PDFTextField && !field.getText())).toBe(true);
    expect(pages.map(page => page.node.Annots()?.size())).toEqual([17, 11, 16, 13]);
    const widgets = fields.flatMap(field => field.acroField.getWidgets());
    expect(widgets).toHaveLength(57);
    expect(pages.map(page => widgets.filter(widget => widget.P() === page.ref).length)).toEqual([17, 11, 16, 13]);
  });

  it("round-trips a signed adjustment, credit limit, and carry in the physical Part II widgets", async () => {
    // Synthetic source amounts exercise the existing individual calculator only.
    const amount = (value: string) => new Decimal(value);
    const result = calculateForm8801({
      taxYear: 2026, priorYear: 2025, sourceFactsConfirmed: true, priorYearFilingStatus: "single",
      priorYearForm6251Line1And2e: amount("200000"), priorYearExclusionItemAdjustments: amount("10000"),
      priorYearMinimumTaxCreditNOLDeduction: amount("0"), priorYearMinimumTaxForeignTaxCredit: amount("1000"),
      priorYearForm6251Line10: amount("20000"), priorYearAMT: amount("10000"),
      unusedMinimumTaxCreditCarryforward: amount("5000"), priorYearUnallowedQualifiedElectricVehicleCredit: amount("0"),
      priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
      currentYearRegularTaxAfterCredits: amount("40000"), currentYearTMT: amount("37000"),
    });
    expect(result.sourceFactsVerified).toBe(true);
    const expected = ["10000", "10694", "-694", "5000", "0", "4306", "40000", "37000", "3000", "3000", "1306"];
    const doc = await loadPdfDocumentQuietly(await readFile(blank));
    const page = doc.getPage(1);
    let previousWidgetY = page.getHeight();
    const fields = Object.entries(candidate.partIIFields).map(([line, name]) => {
      const field = doc.getForm().getTextField(name);
      const [widget] = field.acroField.getWidgets();
      expect(widget.P()).toBe(page.ref);
      // Each successive printed line is below the previous one on Part II.
      const { y } = widget.getRectangle();
      expect(y).toBeLessThan(previousWidgetY);
      previousWidgetY = y;
      const entry = result.lines.find(entry => entry.form === "Form 8801" && entry.line === line);
      if (!entry) throw new Error(`Form 8801 test needs calculation line ${line}`);
      const value = entry.value.toFixed();
      field.setText(value);
      return value;
    });
    expect(fields).toEqual(expected);
    await markReviewPdf(doc);
    const reopened = await loadPdfDocumentQuietly(await doc.save());
    expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
    expect(Object.values(candidate.partIIFields).map(name => reopened.getForm().getTextField(name).getText())).toEqual(expected);
  });

  it("keeps the source receipt outside the public review and filing registries", async () => {
    const bytes = await readFile(blank);
    expect(candidate).toMatchObject({ reviewStatus: "independent-review-pending", exportsEnabled: false, filingQualified: false });
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
    expect(() => assertReviewTemplateBytes("f8801.pdf", bytes, 2025)).toThrow(/No registered review template|Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8801.pdf", bytes, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  });
});
