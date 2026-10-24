import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type PdfExportPurpose = "review" | "filing";
export const REVIEW_PDF_NOTICE = "FOR REVIEW ONLY - NOT FOR FILING";

/** Mapping versions are separate from the tax engine's calculation availability. */
export const PDF_MAPPING_PACKS = Object.freeze({
  2025: Object.freeze({ taxYear: 2025, version: "2025.1-review", reviewAvailable: true, filingQualified: false }),
  2026: Object.freeze({ taxYear: 2026, version: "2026.0-unavailable", reviewAvailable: false, filingQualified: false }),
});

export function assertPdfExportAllowed(inputYear: number, resultYear: number, purpose: PdfExportPurpose = "review"): void {
  if (inputYear !== resultYear) throw new Error("PDF input and calculation years must match.");
  if (purpose !== "review") throw new Error("Filing exports are unavailable until scenarios and final forms are independently qualified.");
  if (inputYear !== 2025) throw new Error(`No qualified review PDF mapping is available for tax year ${inputYear}.`);
}

/** A visible notice stays with each page when a packet is split or printed. */
export async function markReviewPdf(doc: PDFDocument): Promise<void> {
  if (doc.getSubject() === REVIEW_PDF_NOTICE) return;
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const page of doc.getPages()) {
    const size = Math.min(10, (page.getWidth() - 24) / font.widthOfTextAtSize(REVIEW_PDF_NOTICE, 1));
    page.drawRectangle({ x: 8, y: 3, width: page.getWidth() - 16, height: 15, color: rgb(1, 1, 1) });
    page.drawText(REVIEW_PDF_NOTICE, { x: 12, y: 7, size, font, color: rgb(0.65, 0.05, 0.05) });
  }
  doc.setSubject(REVIEW_PDF_NOTICE);
}
