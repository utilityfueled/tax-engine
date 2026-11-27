/** Spec: spec/federal/form-4952-2026-template.yaml. No export path is enabled. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { FORM_4952_2026_CANDIDATE, renderPrivateForm49522026Review } from "@/pdf/mappings/2026/form-4952-candidate.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const sourcePath = "forms/blank/2026/f4952.pdf";
const currentSources = {
  sourceTaxYear: 2026, sourceReference: "Synthetic confidential brokerage source 111223333", sourceFactsConfirmed: true,
  investmentInterestExpense: "6000.25", priorYearDisallowed: "2000.50", priorYearSourceTaxYear: 2025,
  grossInvestmentIncome: "5800.50", qualifiedDividendsIncluded: "1000", netGainFromInvestmentProperty: "4000",
  netCapitalGainFromInvestmentProperty: "3000", electedPreferentialIncome: "0", investmentExpenses: "500",
  investmentExpensesDeductibleConfirmed: true,
};
// Independently inspected source rectangles, left/bottom in points. These are
// printed locations, not generated from the production map or historical form.
const expectedLocations = {
  name: [36, 683.968], ssn: [460.8, 683.968],
  line1: [504, 647.968], line2: [504, 635.969], line3: [504, 623.970],
  line4a: [410.4, 575.968], line4b: [410.4, 563.969], line4c: [504, 551.970],
  line4d: [410.4, 539.968], line4e: [410.4, 515.970], line4f: [504, 503.968],
  line4g: [504, 491.969], line4h: [504, 479.970], line5: [504, 467.968],
  line6: [504, 455.969], line7: [504, 407.970], line8: [504, 395.968],
} as const;
// 6000 current expense +2000 carry, 10000 income less1000 qualified dividends,
// 4000 gain less3000 net capital gain +2000 elected income -500 expense.
const expectedValues = {
  name: "SYNTHETIC MAPPING REVIEW", ssn: "REDACTED",
  line1: "6,000", line2: "2,000", line3: "8,000", line4a: "10,000", line4b: "1,000",
  line4c: "9,000", line4d: "4,000", line4e: "3,000", line4f: "1,000", line4g: "2,000",
  line4h: "12,000", line5: "500", line6: "11,500", line7: "0", line8: "8,000",
} as const;

describe("Final 2026 Form 4952 mapping candidate", () => {
  it("pins the final 2026 source without enabling public exports", async () => {
    const bytes = await readFile(sourcePath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(FORM_4952_2026_CANDIDATE.sha256);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getForm().getFields()).toHaveLength(17);
    expect(FORM_4952_2026_CANDIDATE).toMatchObject({ taxYear: 2026, filingQualified: false, exportsEnabled: false, reviewStatus: "independent-review-pending" });
    expect(Object.isFrozen(FORM_4952_2026_CANDIDATE.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes("f4952.pdf", bytes, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f4952.pdf", bytes, 2026)).toThrow(/No qualified review/);
  });

  it("maps every candidate field to its independently inspected printed location", async () => {
    const doc = await PDFDocument.load(await readFile(sourcePath));
    for (const [key, point] of Object.entries(expectedLocations)) {
      const field = doc.getForm().getField(FORM_4952_2026_CANDIDATE.fields[key as keyof typeof expectedLocations]);
      expect(field).toBeInstanceOf(PDFTextField);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      expect(widgets[0].getRectangle().x).toBeCloseTo(point[0], 2);
      expect(widgets[0].getRectangle().y).toBeCloseTo(point[1], 2);
    }
  });

  it("retains synthetic values and appearances without changing readiness", async () => {
    const doc = await PDFDocument.load(await readFile(sourcePath));
    for (const [key, value] of Object.entries(expectedValues)) {
      doc.getForm().getTextField(FORM_4952_2026_CANDIDATE.fields[key as keyof typeof expectedValues]).setText(value);
    }
    await markReviewPdf(doc);
    const reopened = await PDFDocument.load(await doc.save());
    expect(reopened.getPageCount()).toBe(4);
    expect(reopened.getForm().getFields()).toHaveLength(17);
    for (const [key, value] of Object.entries(expectedValues)) {
      const field = reopened.getForm().getTextField(FORM_4952_2026_CANDIDATE.fields[key as keyof typeof expectedValues]);
      expect(field.getText()).toBe(value);
      expect(field.acroField.getValue()?.decodeText()).toBe(value);
      const appearance = field.acroField.getWidgets()[0].getAppearances()?.normal;
      expect(appearance).toBeInstanceOf(PDFRawStream);
      expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
    }
    const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
    for (const page of reopened.getPages()) {
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray().map(ref => reopened.context.lookup(ref)) : [contents];
      const text = streams.filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
        .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
      expect(text.split(noticeHex).length - 1).toBe(1);
    }
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
  });

  it("renders verified current and prior Form 4952 sources in a redacted private proof", async () => {
    const bytes = await renderPrivateForm49522026Review(currentSources, await readFile(sourcePath));
    const output = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-I", "-B", "-c", [
      "from io import BytesIO", "from sys import stdin", "from json import dumps", "from pypdf import PdfReader",
      "reader = PdfReader(BytesIO(stdin.buffer.read()), strict=True)",
      "fields = {name: field.get('/V', '') for name, field in reader.get_fields().items() if field.get('/FT') == '/Tx'}",
      "print(dumps({'fields': fields, 'pages': [page.extract_text() for page in reader.pages]}))",
    ].join("\n")], { input: bytes, encoding: "utf8", timeout: 10000, maxBuffer: 65536 });
    const saved = JSON.parse(output) as { fields: Record<string, string>; pages: string[] };
    const indicators = {
      name: "", ssn: "", line1: "6000", line2: "2001", line3: "8001", line4a: "5801", line4b: "1000", line4c: "4801",
      line4d: "4000", line4e: "3000", line4f: "1000", line4g: "0", line4h: "5801", line5: "500", line6: "5301", line7: "2700", line8: "5301",
    } as const;
    expect(saved.fields).toEqual(Object.fromEntries(Object.entries(indicators).map(([key, value]) => [FORM_4952_2026_CANDIDATE.fields[key as keyof typeof indicators], value])));
    expect(saved.pages).toHaveLength(4);
    for (const page of saved.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    expect(output).not.toContain(currentSources.sourceReference);
    expect(saved.pages[0]).toMatch(/Form 4952 \(2026\) Created 5\/28\/26/);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  });

  it("holds stale or incomplete Form 4952 facts, elections, child income and foreign template bytes", async () => {
    const blank = await readFile(sourcePath);
    await expect(renderPrivateForm49522026Review({ ...currentSources, sourceTaxYear: 2025 }, blank)).rejects.toThrow(/source year/);
    await expect(renderPrivateForm49522026Review({ ...currentSources, priorYearSourceTaxYear: 2024 }, blank)).rejects.toThrow(/prior year/);
    await expect(renderPrivateForm49522026Review({ ...currentSources, grossInvestmentIncome: undefined }, blank)).rejects.toThrow(/actual source amounts/);
    await expect(renderPrivateForm49522026Review({ ...currentSources, investmentExpensesDeductibleConfirmed: false }, blank)).rejects.toThrow(/deductible/);
    await expect(renderPrivateForm49522026Review({ ...currentSources, electedPreferentialIncome: "1" }, blank)).rejects.toThrow(/elections/);
    const childIncomeSources = { sourceTaxYear: 2026, sourceReference: "Fixture parent worksheet", sourceFactsConfirmed: true,
      parentSourcesExcludeAllChildrenConfirmed: true, parentGrossInvestmentIncome: "5800.50", parentQualifiedDividends: "1000",
      parentNetInvestmentGain: "4000", parentNetLongTermGain: "3000", parentNetShortTermGain: "1000", children: [] };
    await expect(renderPrivateForm49522026Review({ ...currentSources, childIncomeSources }, blank)).rejects.toThrow(/Form 8814/);
    await expect(renderPrivateForm49522026Review(currentSources, await readFile("forms/blank/2025/f4952.pdf"))).rejects.toThrow(/pinned final 2026/);
    const modified = Buffer.from(blank);
    modified[modified.length - 1] ^= 1;
    await expect(renderPrivateForm49522026Review(currentSources, modified)).rejects.toThrow(/pinned final 2026/);
  });

  it("reconciles the printed expense subtotal on both sides of the half-dollar boundary", async () => {
    const blank = await readFile(sourcePath);
    const cases = [
      { expense: "6000.49", prior: "2000.49", printed: ["6000", "2000", "8000", "2699"] },
      { expense: "6000.50", prior: "2000.50", printed: ["6001", "2001", "8002", "2701"] },
    ];
    for (const { expense, prior, printed } of cases) {
      const bytes = await renderPrivateForm49522026Review({
        ...currentSources, investmentInterestExpense: expense, priorYearDisallowed: prior,
      }, blank);
      const form = (await PDFDocument.load(bytes)).getForm();
      expect((["line1", "line2", "line3", "line7"] as const).map(line =>
        form.getTextField(FORM_4952_2026_CANDIDATE.fields[line]).getText(),
      )).toEqual(printed);
    }
  });
});
