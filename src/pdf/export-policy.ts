import { PDFBool, PDFContentStream, PDFDocument, PDFName, PDFStream, StandardFonts, degrees, drawRectangle, drawText, rgb, type PDFFont } from "pdf-lib";

export type PdfExportPurpose = "review" | "filing";
export const REVIEW_PDF_NOTICE = "FOR REVIEW ONLY - NOT FOR FILING";
const reviewStreamKey = PDFName.of("TaxEngineReviewNotice");
const reviewFontKey = PDFName.of("TaxEngineReviewNoticeFont");
const reviewFonts = new WeakMap<PDFDocument, PDFFont>();

/** Mapping versions are separate from the tax engine's calculation availability. */
export const PDF_MAPPING_PACKS = Object.freeze({
  2025: Object.freeze({ taxYear: 2025, version: "2025.2-review", reviewAvailable: true, filingQualified: false }),
  2026: Object.freeze({ taxYear: 2026, version: "2026.0-unavailable", reviewAvailable: false, filingQualified: false }),
});

export function assertPdfExportAllowed(inputYear: number, resultYear: number, purpose: PdfExportPurpose = "review"): void {
  if (inputYear !== resultYear) throw new Error("PDF input and calculation years must match.");
  if (purpose !== "review") throw new Error("Filing exports are unavailable until scenarios and final forms are independently qualified.");
  if (inputYear !== 2025) throw new Error(`No qualified review PDF mapping is available for tax year ${inputYear}.`);
}

/** A visible notice stays with each page when a packet is split or printed. */
export async function markReviewPdf(doc: PDFDocument): Promise<void> {
  const pages = doc.getPages();
  if (pages.length) {
    const font = reviewFonts.get(doc) ?? await doc.embedFont(StandardFonts.HelveticaBold);
    reviewFonts.set(doc, font);
    for (const page of pages) {
      // The dedicated drawing stream survives saving and copying pages. Replace
      // it, rather than trusting metadata or hiding repeated notices underneath
      // a new rectangle. Other form/page drawing streams remain untouched.
      const contents = page.node.normalizedEntries().Contents;
      if (contents) for (let index = contents.size() - 1; index >= 0; index -= 1) {
        const stream = doc.context.lookup(contents.get(index));
        if (stream instanceof PDFStream && stream.dict.get(reviewStreamKey) === PDFBool.True) contents.remove(index);
      }
      page.node.setFontDictionary(reviewFontKey, font.ref);
      const size = Math.min(10, (page.getWidth() - 24) / font.widthOfTextAtSize(REVIEW_PDF_NOTICE, 1));
      const rotation = { rotate: degrees(0), xSkew: degrees(0), ySkew: degrees(0) };
      const stream = PDFContentStream.of(doc.context.obj({ TaxEngineReviewNotice: true }), [
        ...drawRectangle({ x: 8, y: 3, width: page.getWidth() - 16, height: 15, color: rgb(1, 1, 1), borderWidth: 0, borderColor: undefined, ...rotation }),
        ...drawText(font.encodeText(REVIEW_PDF_NOTICE), { x: 12, y: 7, size, font: reviewFontKey, color: rgb(0.65, 0.05, 0.05), ...rotation }),
      ]);
      page.node.addContentStream(doc.context.register(stream));
    }
  }
  doc.setSubject(REVIEW_PDF_NOTICE);
}
