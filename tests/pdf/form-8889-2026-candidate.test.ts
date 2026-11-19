/** Spec: spec/federal/form-8889-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { FORM_8889_2026_CANDIDATE as candidate } from "@/pdf/mappings/2026/form-8889-candidate.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f8889.pdf", import.meta.url);
const historicalBlank = new URL("../../forms/blank/2025/f8889.pdf", import.meta.url);
const officialSha256 = "e206d84f0ce3b2a4add7a97e5de8f873b11bd0a16e34e7cd98f9c4dcc87a178d";

// Native suffix, rectangle in PDF points, and checkbox on-state when present.
const locations = {
  name: ["f1_1[0]", 36, 677.970, 424.050, 689.969],
  ssn: ["f1_2[0]", 424.8, 677.970, 576, 689.969],
  selfOnly: ["c1_1[0]", 482.4, 614.468, 490.4, 622.468, "/1"],
  family: ["c1_1[1]", 536.8, 614.468, 544.8, 622.468, "/2"],
  line2: ["f1_3[0]", 504, 575.968, 576, 587.967],
  line3: ["f1_4[0]", 504, 539.968, 576, 551.967],
  line4: ["f1_5[0]", 504, 503.968, 576, 515.967],
  line5: ["f1_6[0]", 504, 491.969, 576, 503.968],
  line6: ["f1_7[0]", 504, 467.968, 576, 479.967],
  line7: ["f1_8[0]", 504, 443.970, 576, 455.969],
  line8: ["f1_9[0]", 504, 431.968, 576, 443.967],
  line9: ["f1_10[0]", 410.4, 419.969, 481.65, 431.968],
  line10: ["f1_11[0]", 410.4, 407.970, 481.65, 419.969],
  line11: ["f1_12[0]", 504, 395.968, 576, 407.967],
  line12: ["f1_13[0]", 504, 383.969, 576, 395.968],
  line13: ["f1_14[0]", 504, 371.970, 576, 383.969],
  line14a: ["f1_15[0]", 504, 335.970, 576, 347.969],
  line14b: ["f1_16[0]", 504, 299.970, 576, 311.969],
  line14c: ["f1_17[0]", 504, 287.968, 576, 299.967],
  line15: ["f1_18[0]", 504, 275.969, 576, 287.968],
  line16: ["f1_19[0]", 504, 251.968, 576, 263.967],
  line17a: ["c1_2[0]", 467.2, 229.968, 475.2, 237.968, "/1"],
  line17b: ["f1_20[0]", 504, 191.970, 576, 203.969],
  line18: ["f1_21[0]", 504, 143.968, 576, 155.967],
  line19: ["f1_22[0]", 504, 131.969, 576, 143.968],
  line20: ["f1_23[0]", 504, 119.970, 576, 131.969],
  line21: ["f1_24[0]", 504, 95.969, 576, 107.968],
} as const;

describe("Final 2026 Form 8889 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const bytes = await readFile(blank);
    const doc = await PDFDocument.load(bytes);
    expect(bytes).toHaveLength(70785);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(officialSha256);
    expect(candidate).toMatchObject({
      sourceUrl: "https://www.irs.gov/pub/irs-prior/f8889--2026.pdf",
      sourceRevision: "Created 4/30/26",
      sha256: officialSha256,
    });
    expect(doc.getTitle()?.trim()).toBe("2026 Form 8889");
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 611.976, height: 791.968 });
  });

  it("matches every leaf and page widget to its printed location", async () => {
    const doc = await PDFDocument.load(await readFile(blank));
    const form = doc.getForm();
    const page = doc.getPage(0);
    expect(form.getFields()).toHaveLength(27);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(locations).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
    const widgetRefs = page.node.Annots()?.asArray().filter(ref =>
      doc.context.lookup(ref, PDFDict).get(PDFName.of("Subtype")) === PDFName.of("Widget"),
    );
    expect(widgetRefs?.map(String).sort()).toEqual(form.getFields().map(field => String(field.ref)).sort());

    for (const [key, [suffix, left, bottom, right, top, onState]] of Object.entries(locations)) {
      const name = candidate.fields[key as keyof typeof locations];
      expect(name).toBe(`topmostSubform[0].Page1[0].${suffix}`);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(onState ? PDFCheckBox : PDFTextField);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const [widget] = widgets;
      expect(widget.P()).toEqual(page.ref);
      const { x, y, width, height } = widget.getRectangle();
      expect(x).toBeCloseTo(left, 3);
      expect(y).toBeCloseTo(bottom, 3);
      expect(x + width).toBeCloseTo(right, 3);
      expect(y + height).toBeCloseTo(top, 3);
      if (field instanceof PDFCheckBox) {
        expect(field.acroField.getOnValue()?.toString()).toBe(onState);
        expect(field.acroField.getValue()).toBe(PDFName.of("Off"));
        expect(widget.getAppearanceState()).toBe(PDFName.of("Off"));
      }
    }
  });

  it("records the final printed limits and transfer destinations", () => {
    expect(candidate.printedLine3FullYearUnder55).toEqual({ selfOnly: "4400", family: "8750" });
    expect(candidate.printedReferences).toEqual({
      line16: "Schedule 1 (Form 1040) line 8f",
      line17b: "Schedule 2 (Form 1040) line 13c",
      line20: "Schedule 1 (Form 1040) line 8f",
      line21: "Schedule 2 (Form 1040) line 13d",
    });
  });

  it("round-trips diagnostic amounts and checkbox states", async () => {
    const bytes = await readFile(blank);
    const { fields } = candidate;
    const amountKeys = Object.keys(locations).filter(key => key.startsWith("line") && key !== "line17a");
    expect(amountKeys).toHaveLength(22);
    const textEntries = new Map<string, string>([[fields.name, "FICTIONAL FIELD PROBE"], [fields.ssn, "REDACTED"]]);
    for (const [index, key] of amountKeys.entries()) {
      textEntries.set(fields[key as keyof typeof fields], index === 0 ? "0" : String(4000 + index));
    }
    for (const [coverage, exception] of [["selfOnly", false], ["family", true], [undefined, false]] as const) {
      const doc = await PDFDocument.load(bytes);
      const form = doc.getForm();
      const checks = {
        [fields.selfOnly]: coverage === "selfOnly" ? "/1" : "/Off",
        [fields.family]: coverage === "family" ? "/2" : "/Off",
        [fields.line17a]: exception ? "/1" : "/Off",
      };
      for (const [name, value] of textEntries) form.getTextField(name).setText(value);
      for (const [name, state] of Object.entries(checks)) {
        const box = form.getCheckBox(name);
        if (state === "/Off") box.uncheck();
        else box.check();
      }
      await markReviewPdf(doc);
      const reopened = await PDFDocument.load(await doc.save());
      const saved = reopened.getForm();
      expect(saved.getFields()).toHaveLength(27);
      for (const [name, value] of textEntries) {
        const field = saved.getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        const stream = field.acroField.getWidgets()[0].getAppearances()?.normal;
        expect(stream).toBeInstanceOf(PDFRawStream);
        expect(decodePDFRawStream(stream as PDFRawStream).decode().length).toBeGreaterThan(0);
      }
      for (const [name, state] of Object.entries(checks)) {
        const box = saved.getCheckBox(name);
        const [widget] = box.acroField.getWidgets();
        const stateName = PDFName.of(state.slice(1));
        expect(box.isChecked()).toBe(state !== "/Off");
        expect(box.acroField.dict.get(PDFName.of("V"))).toBe(stateName);
        expect(widget.getAppearanceState()).toBe(stateName);
        const normal = widget.getAppearances()?.normal;
        expect(normal).toBeInstanceOf(PDFDict);
        const stream = (normal as PDFDict).lookup(stateName, PDFRawStream);
        expect(decodePDFRawStream(stream).decode().length).toBeGreaterThan(0);
      }
      const contents = reopened.getPage(0).node.normalizedEntries().Contents;
      const noticeStreams = contents?.asArray().map(ref => reopened.context.lookup(ref))
        .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream && stream.dict.has(PDFName.of("TaxEngineReviewNotice"))) ?? [];
      expect(noticeStreams).toHaveLength(1);
      const notice = Buffer.from(decodePDFRawStream(noticeStreams[0]).decode()).toString("ascii");
      expect(notice).toContain(Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase());
    }
  });

  it("keeps the annual and historical export gates in effect", async () => {
    const [current, historical] = await Promise.all([readFile(blank), readFile(historicalBlank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending",
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/);
    expect(() => assertPdfExportAllowed(2025, 2026)).toThrow(/years must match/);
    expect(() => assertPdfExportAllowed(2026, 2025)).toThrow(/years must match/);
    expect(() => assertReviewTemplateBytes("f8889.pdf", current, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8889.pdf", current, 2026)).toThrow(/No qualified review/);
    expect(() => assertReviewTemplateBytes("f8889.pdf", historical, 2026)).toThrow(/No qualified review/);
    expect(assertReviewTemplateBytes("f8889.pdf", historical, 2025).sha256).toBe(createHash("sha256").update(historical).digest("hex"));
  });
});
