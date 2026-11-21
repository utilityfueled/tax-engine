/** Spec: spec/federal/form-8880-2026-template.yaml. */
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL } from "node:url";
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { FORM_8880_2026_CANDIDATE as candidate, fillForm88802026OrdinaryCandidate } from "@/pdf/mappings/2026/form-8880-candidate.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { foreignTaxDirectCreditFixture } from "../fixtures/foreign-tax-direct-credit.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import fixture from "./sources/form-8880-2026.json";

// Use the draft statutory-rate preview only inside this test suite.
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return {
    ...original,
    getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year),
  };
});

const blank = new URL("../../forms/blank/2026/f8880.pdf", import.meta.url);
const historicalBlank = new URL("../../forms/blank/2025/f8880.pdf", import.meta.url);

function ordinarySourceFixture() {
  const w2 = {
    ...simpleW2Fixture.w2s[0],
    taxYear: 2026, accountHolder: "primary" as const, wages: "39000.00", federalWithheld: "3000",
    box12CodeD: "2500.00", socialSecurityWages: "41500", socialSecurityWithheld: "2573",
    medicareWages: "41500", medicareWithheld: "601.75",
  };
  const source = {
    taxYear: 2026, accountHolder: "primary" as const, employerEin: w2.employer.ein,
    sourceReference: "FICTIONAL 2026 EMPLOYEE W-2 ORIGINAL", ordinaryWageOnlyReturnAndCodeDConfirmed: true,
    box1Wages: w2.wages, box12CodeD: w2.box12CodeD,
  };
  const input = {
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    w2s: [w2],
    form8880: {
      sourceFacts2026: {
        taxYear: 2026 as const, testingPeriodComplete: true as const,
        primary: { qualifyingStudentMonths: 0, dependentDeductionAllowedToAnotherTaxpayer: false, testingPeriodDistributionReduction: "0" },
        americanSamoaAgiRestoration: "0", puertoRicoAgiRestoration: "0",
      },
    },
  };
  return { input, source, w2 };
}

const inspectSavedPdf = `
import json, sys
from pypdf import PdfReader
from pypdf.generic import ContentStream

reader = PdfReader(sys.argv[1], strict=True)
locations, expected = json.loads(sys.argv[2]), json.loads(sys.argv[3])
assert len(reader.pages) == 2
fields = {name: field for name, field in reader.get_fields().items() if field.get('/FT') == '/Tx'}
assert len(fields) == len(expected) == 23
for key, value in expected.items():
    location = locations[key]
    field = fields[location['name']]
    assert field.get('/V', '') == value, (key, field.get('/V', ''))
    page = reader.pages[location['page'] - 1]
    widgets = [ref.get_object() for ref in page.get('/Annots', [])]
    def full_name(widget):
        name = [widget.get('/T', '')]
        parent = widget.get('/Parent')
        while parent:
            node = parent.get_object()
            name.append(node.get('/T', ''))
            parent = node.get('/Parent')
        return '.'.join(reversed(name))
    widget, = [item for item in widgets if full_name(item) == location['name']]
    assert all(abs(float(actual) - pinned) < .002 for actual, pinned in zip(widget['/Rect'], location['rect'])), key
    if value:
        appearance = widget['/AP']['/N'].get_object()
        painted = [str(args[0]) for args, op in ContentStream(appearance, reader).operations if op == b'Tj']
        assert painted == [value], (key, painted)
    if key == 'line9':
        assert widget['/MaxLen'] == 1
for page in reader.pages:
    text = page.extract_text()
    assert text.count(sys.argv[4]) == 1
    assert sys.argv[5] not in text
    assert sys.argv[6] not in text
`;

describe("Final 2026 Form 8880 physical candidate", () => {
  it("pins the final combined annual source", async () => {
    const bytes = await readFile(blank);
    const doc = await PDFDocument.load(bytes);
    expect(bytes).toHaveLength(86366);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(fixture.source.sha256);
    expect(candidate.sourceUrl).toBe(fixture.source.archiveUrl);
    expect(candidate.sha256).toBe(fixture.source.sha256);
    expect(candidate.sourceRevision).toBe("Created 3/16/26");
    expect(candidate.instructionsStatus).toBe("final-2026-integrated-page-2");
    expect(doc.getTitle()?.trim()).toBe("2026 Form 8880");
    expect(doc.getPageCount()).toBe(2);
    for (const page of doc.getPages()) expect(page.getSize()).toEqual({ width: 611.976, height: 791.968 });
  });

  it("matches every canonical field and page widget to its printed location", async () => {
    const doc = await PDFDocument.load(await readFile(blank));
    const fields = doc.getForm().getFields();
    expect(fields).toHaveLength(23);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(fixture.locations).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(fields.map(field => field.getName()).sort());
    for (const [index, page] of doc.getPages().entries()) {
      const pageFields = Object.values(fixture.locations).filter(location => location.page === index + 1);
      const widgetRefs = page.node.Annots()?.asArray().filter(ref =>
        doc.context.lookup(ref, PDFDict).get(PDFName.of("Subtype")) === PDFName.of("Widget"),
      ) ?? [];
      expect(widgetRefs.map(String).sort()).toEqual(pageFields.map(location => String(doc.getForm().getField(location.name).ref)).sort());
    }
    for (const [key, location] of Object.entries(fixture.locations)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name).toBe(location.name);
      const field = doc.getForm().getField(name);
      expect(field).toBeInstanceOf(PDFTextField);
      expect(field.acroField.dict.get(PDFName.of("FT"))?.toString()).toBe(location.type);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      expect(widgets[0].P()).toEqual(doc.getPage(location.page - 1).ref);
      const { x, y, width, height } = widgets[0].getRectangle();
      for (const [index, value] of [x, y, x + width, y + height].entries()) expect(value).toBeCloseTo(location.rect[index], 3);
      expect((field as PDFTextField).getMaxLength() ?? null).toBe(location.maxLength);
    }
  });

  it("records the annual printed references and rate table", () => {
    expect(candidate.printed).toEqual(fixture.printed);
    expect(candidate.printed.line8).toContain("line 11a");
    expect(candidate.printed.line12).toBe("Schedule 3 (Form 1040) line 4");
    expect(candidate.printed.rateTable).toHaveLength(10);
    expect(candidate.printed.rateTable[0]).toEqual(["---", "24250", "0.5", "0.5", "0.5"]);
    expect(candidate.printed.rateTable[9]).toEqual(["80500", "---", "0.0", "0.0", "0.0"]);
  });

  it("round-trips all diagnostic values and native rate digits with appearances", async () => {
    const bytes = await readFile(blank);
    for (const digit of ["5", "2", "1", "0"]) {
      const doc = await PDFDocument.load(bytes);
      const form = doc.getForm();
      expect(() => form.getTextField(candidate.fields.line9).setText("0.5")).toThrow(/length|max/i);
      const expected = new Map<string, string>();
      for (const [index, [key, name]] of Object.entries(candidate.fields).entries()) {
        const value = key === "name" ? "FICTIONAL FIELD PROBE" : key === "ssn" ? "REDACTED" : key === "line9" ? digit : key === "line1a" ? "0" : String(1000 + index);
        expected.set(name, value);
        form.getTextField(name).setText(value);
      }
      await markReviewPdf(doc);
      const saved = await PDFDocument.load(await doc.save());
      expect(saved.getForm().getFields()).toHaveLength(23);
      for (const [name, value] of expected) {
        const field = saved.getForm().getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        const [widget] = field.acroField.getWidgets();
        expect(widget.dict.get(PDFName.of("V")) ?? field.acroField.getValue()).toEqual(field.acroField.getValue());
        const stream = widget.getAppearances()?.normal;
        expect(stream).toBeInstanceOf(PDFRawStream);
        const appearance = Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("ascii");
        expect(appearance).toContain(Buffer.from(value).toString("hex").toUpperCase());
      }
      expect(saved.getForm().getTextField(candidate.fields.line9).getMaxLength()).toBe(1);
      for (const page of saved.getPages()) {
        const streams = page.node.normalizedEntries().Contents?.asArray().map(ref => saved.context.lookup(ref))
          .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream && stream.dict.has(PDFName.of("TaxEngineReviewNotice"))) ?? [];
        expect(streams).toHaveLength(1);
        expect(Buffer.from(decodePDFRawStream(streams[0]).decode()).toString("ascii")).toContain(Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase());
      }
    }
  });

  it("projects an original Code D W-2 into the saved credit and worksheet", async () => {
    const { input, source } = ordinarySourceFixture();
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    const value = (form: string, line: string) => result.allLines.find(row => row.form === form && row.line === line)?.value.toFixed();
    expect(result.incomeTaxSourceStatus).toBe("statutory-rate-preview");
    expect(value("1040", "18")).toBe("2500"); // $39,000 − $16,100, then $1,240 + 12% of $10,500.
    expect(value("Sched 3", "4")).toBe("200");

    const { document, schedule3Line4 } = await fillForm88802026OrdinaryCandidate(input, source, await readFile(blank));
    expect(schedule3Line4.toFixed()).toBe("200");
    const expected = {
      name: "Jane Doe", ssn: "REDACTED",
      line1a: "0", line1b: "", line2a: "2500", line2b: "", line3a: "2500", line3b: "",
      line4a: "0", line4b: "", line5a: "2500", line5b: "", line6a: "2000", line6b: "",
      line7: "2000", line8: "39000", line9: "1", line10: "200", line11: "2500", line12: "200",
      worksheet1: "2500", worksheet2: "0", worksheet3: "2500",
    };
    const directory = await mkdtemp(join(tmpdir(), "form-8880-original-"));
    try {
      const path = join(directory, "f8880-2026-internal-review.pdf");
      await writeFile(path, await document.save());
      execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", inspectSavedPdf, path,
        JSON.stringify(fixture.locations), JSON.stringify(expected), REVIEW_PDF_NOTICE,
        input.taxpayer.primary.ssn, source.sourceReference,
      ]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("holds missing, conflicting and outside-scope originals", async () => {
    const { input, source, w2 } = ordinarySourceFixture();
    const bytes = await readFile(blank);
    const withW2 = (overrides: Partial<typeof w2>) => ({ ...input, w2s: [{ ...w2, ...overrides }] });
    for (const difference of [
      { source: { ...source, taxYear: 2025 }, message: /2026/ },
      { source: { ...source, ordinaryWageOnlyReturnAndCodeDConfirmed: false }, message: /confirm/ },
      { source: { ...source, sourceReference: " " }, message: /confirm/ },
      { source: { ...source, employerEin: "98-7654321" }, message: /match.*W-2/ },
      { source: { ...source, box1Wages: "38000" }, message: /match.*W-2/ },
      { source: { ...source, box12CodeD: "2499" }, message: /match.*W-2/ },
      { input: withW2({ taxYear: undefined }), message: /2026.*W-2/ },
      { input: withW2({ accountHolder: undefined }), message: /primary.*W-2/ },
      { input: withW2({ box12CodeG: "1" }), message: /Code D/ },
      { input: { ...input, w2s: [w2, w2] }, message: /one.*W-2/ },
      { input: { ...input, form1099Int: [{ payer: "Fictional Bank", interestIncome: "100", taxYear: 2026 }] },
        message: /ordinary wage-only/ },
      { input: withW2({ box12CodeD: "2500.01" }), source: { ...source, box12CodeD: "2500.01" }, message: /whole dollar/ },
      { input: withW2({ box12CodeD: "24501" }), source: { ...source, box12CodeD: "24501" }, message: /Code D/ },
      { input: { ...input, form8880: undefined }, message: /complete.*Form 8880/ },
      { input: { ...input, form8880: { ...input.form8880, primaryElectiveDeferrals: "2500" } }, message: /overrid/ },
      { input: { ...input, form8880: { sourceFacts2026: { ...input.form8880.sourceFacts2026, primary: {
        ...input.form8880.sourceFacts2026.primary, testingPeriodDistributionReduction: "1",
      } } } }, message: /zero.*distribution/ },
      { input: withW2({ wages: "40251" }), source: { ...source, box1Wages: "40251" }, message: /positive.*credit/ },
    ]) {
      await expect(fillForm88802026OrdinaryCandidate(difference.input ?? input, difference.source ?? source, bytes))
        .rejects.toThrow(difference.message);
    }
    const foreign = foreignTaxDirectCreditFixture(2026);
    const withEarlierCredit = {
      ...withW2({ wages: "37000" }),
      foreignTaxElection: foreign.foreignTaxElection,
      form1099Int: foreign.form1099Int.map(statement => ({ ...statement, taxYear: 2026 })),
    };
    expect(calculateFederalTax(TaxYearInputSchema.parse(withEarlierCredit)).foreignTaxCredit.gt(0)).toBe(true);
    await expect(fillForm88802026OrdinaryCandidate(withEarlierCredit, { ...source, box1Wages: "37000" }, bytes))
      .rejects.toThrow(/no preceding credits/);
    await expect(fillForm88802026OrdinaryCandidate(input, source, await readFile(historicalBlank))).rejects.toThrow(/revision/);
  });

  it("keeps annual and historical export gates closed", async () => {
    const [current, historical] = await Promise.all([readFile(blank), readFile(historicalBlank)]);
    expect(candidate).toMatchObject({ taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending" });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    const actualConstants = await vi.importActual<typeof import("@/models/constants.js")>("@/models/constants.js");
    expect(() => actualConstants.getConstants(2026)).toThrow();
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/);
    expect(() => assertPdfExportAllowed(2025, 2026)).toThrow(/years must match/);
    expect(() => assertPdfExportAllowed(2026, 2025)).toThrow(/years must match/);
    expect(() => assertReviewTemplateBytes("f8880.pdf", current, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8880.pdf", current, 2026)).toThrow(/No qualified review/);
    expect(() => assertReviewTemplateBytes("f8880.pdf", historical, 2026)).toThrow(/No qualified review/);
    expect(assertReviewTemplateBytes("f8880.pdf", historical, 2025).sha256).toBe(createHash("sha256").update(historical).digest("hex"));
  });
});
