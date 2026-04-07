import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { loadPdfDocumentQuietly } from "@/pdf/pdf-utils.js";

describe("loadPdfDocumentQuietly", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("suppresses the known pdf-lib XFA warning without muting other warnings", async () => {
    const loadSpy = vi.spyOn(PDFDocument, "load").mockImplementation(async () => {
      console.warn("Removing XFA form data as pdf-lib does not support reading or writing XFA");
      console.warn("some other warning");
      return {} as PDFDocument;
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(loadPdfDocumentQuietly(new Uint8Array())).resolves.toEqual({} as PDFDocument);

    expect(loadSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith("some other warning");
  });
});
