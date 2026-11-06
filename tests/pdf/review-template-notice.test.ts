// Spec: spec/federal/pdf-review-policy.yaml.
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { loadReviewTemplate } from "@/pdf/pdf-utils.js";
import { markReviewPdf, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
function noticeCounts(doc: PDFDocument) {
  return doc.getPages().map(page => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map(ref => doc.context.lookup(ref)) : [contents];
    const text = streams.filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
      .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
    return text.split(noticeHex).length - 1;
  });
}

describe("visible PDF review notices", () => {
  it.each(Object.keys(REVIEW_TEMPLATE_PACKS[2025].templates))("marks every registered template before callers can return it: %s", async filename => {
    const doc = await loadReviewTemplate(`forms/blank/2025/${filename}`, 2025);
    const saved = await PDFDocument.load(await doc.save());
    expect(saved.getSubject(), filename).toBe(REVIEW_PDF_NOTICE);
    expect(noticeCounts(saved), filename).toEqual(saved.getPages().map(() => 1));
  });
  it("marks appended pages and does not trust a matching metadata subject", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setSubject(REVIEW_PDF_NOTICE);
    await markReviewPdf(doc);
    doc.addPage([400, 500]);
    await markReviewPdf(doc);
    await markReviewPdf(doc);
    expect(noticeCounts(await PDFDocument.load(await doc.save()))).toEqual([1, 1]);
  });
  it("rejects an unavailable year before reading a template path", async () => {
    await expect(loadReviewTemplate("/missing-unqualified-template.pdf", 2026)).rejects.toThrow(/mapping.*2026/);
  });
  it("replaces dedicated notice streams after saving and merging pages", async () => {
    const original = await loadReviewTemplate("forms/blank/2025/f1040.pdf", 2025);
    const originalFields = original.getForm().getFields().map(field => field.getName());
    const saved = await PDFDocument.load(await original.save());
    await markReviewPdf(saved);
    expect(saved.getForm().getFields().map(field => field.getName())).toEqual(originalFields);
    expect(noticeCounts(await PDFDocument.load(await saved.save()))).toEqual([1, 1]);

    const merged = await PDFDocument.create();
    for (const page of await merged.copyPages(saved, saved.getPageIndices())) merged.addPage(page);
    merged.addPage();
    await markReviewPdf(merged);
    const reopened = await PDFDocument.load(await merged.save());
    await markReviewPdf(reopened);
    expect(noticeCounts(await PDFDocument.load(await reopened.save()))).toEqual([1, 1, 1]);
  });
});
