import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { loadPdfDocumentQuietly, setTextField, setCheckBox } from "@/pdf/pdf-utils.js";

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

describe("exact mapped field writes", () => {
  it("rejects missing and wrong-type fields even for empty values", async () => {
    const doc = await PDFDocument.create();
    const form = doc.getForm();
    form.createTextField("amount");
    form.createCheckBox("eligible");
    for (const value of ["", "123"]) {
      expect(() => setTextField(form, "absent", value)).toThrow(/mapped.*field/i);
      expect(() => setTextField(form, "eligible", value)).toThrow(/mapped.*text/i);
    }
    for (const value of [false, true]) {
      expect(() => setCheckBox(form, "absent", value)).toThrow(/mapped.*field/i);
      expect(() => setCheckBox(form, "amount", value)).toThrow(/mapped.*checkbox/i);
    }
  });

  it("clears a previously populated field when the new value is empty or false", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    form.createTextField("amount").addToPage(page);
    form.createCheckBox("eligible").addToPage(page);
    setTextField(form, "amount", "123");
    setCheckBox(form, "eligible", true);
    setTextField(form, "amount", "");
    setCheckBox(form, "eligible", false);
    const reopened = await PDFDocument.load(await doc.save());
    expect(reopened.getForm().getTextField("amount").getText()).toBeUndefined();
    expect(reopened.getForm().getCheckBox("eligible").isChecked()).toBe(false);
  });
});
