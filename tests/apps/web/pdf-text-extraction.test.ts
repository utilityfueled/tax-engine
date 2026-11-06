import { describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfTextFromFile } from "../../../apps/web/src/lib/uploaded-document-detection";

vi.mock("server-only", () => ({}));

async function syntheticDocument() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage();
  first.drawText("Wages 12345.67", { x: 40, y: 700, size: 12, font });
  first.drawText("Federal withholding 890.12", { x: 40, y: 680, size: 12, font });
  pdf.addPage().drawText("Second page 2025-12-31", { x: 40, y: 700, size: 12, font });
  return new Uint8Array(await pdf.save());
}

describe("PDF.js 6 text extraction with synthetic documents", () => {
  it("preserves monetary/date text and page order without a provider", async () => {
    const file = new File([await syntheticDocument()], "synthetic.pdf", { type: "application/pdf" });
    const text = await extractPdfTextFromFile(file);
    expect(text).toContain("Wages 12345.67\nFederal withholding 890.12");
    expect(text).toContain("\n\nSecond page 2025-12-31");
  });

  it("rejects malformed bytes and can read the next document", async () => {
    await expect(extractPdfTextFromFile(new File(["not a PDF"], "bad.pdf"))).rejects.toThrow();
    const text = await extractPdfTextFromFile(new File([await syntheticDocument()], "next.pdf"));
    expect(text).toContain("Wages 12345.67");
  });
});
