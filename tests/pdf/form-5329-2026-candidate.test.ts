/** Spec: spec/federal/form-5329-2026-template.yaml. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { annualCashQtpFixture } from "../fixtures/education-annual-cash.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

afterEach(() => vi.useRealTimers());

const blank = new URL("../../forms/blank/2026/f5329.pdf", import.meta.url);
const sourceContract = new URL("./sources/form-5329-2026.json", import.meta.url);

type Location = {
  name: string;
  page: number;
  rect: [number, number, number, number];
  type: "/Tx" | "/Btn";
  onState?: string;
};

async function mapping() {
  const { FORM_5329_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-5329-candidate.js");
  return FORM_5329_2026_CANDIDATE;
}

function expectNonemptyStream(appearance: unknown) {
  expect(appearance).toBeInstanceOf(PDFRawStream);
  expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
}

function documentedFirstHome(priorDistributions = "4000") {
  const distributionDate = "2026-06-15";
  const accountReference = "SYNTHETIC PRIVATE REVIEW ACCOUNT";
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, w2s: [],
    form1099R: [{
      taxYear: 2026, payer: "SYNTHETIC PRIVATE TRUSTEE", payerTin: "12-3456789", accountHolder: "primary",
      accountReference, distributionCode: "1", distributionDate, grossDistribution: "7000", taxableAmount: "7000",
      taxableAmountNotDetermined: false, iraSepSimple: true, iraBasisConfirmedZero: true,
      employeeContributions: "0", trumpAccount: false, excessContributionEarnings: "0",
    }],
    form5329FirstHomeSource: {
      sourceTaxYear: 2026, owner: "primary", accountReference, sourceFactsConfirmed: true,
      distributionReceivedDate: distributionDate, singleDistributionReceiptConfirmed: true, distributionRolledOver: false,
      boughtOwnPrincipalResidence: true, purchaseCompleted: true, bindingContractDate: "2026-08-20",
      maritalStatusAtAcquisition: "unmarried", buyerHadNoPrincipalResidenceInterest: true, noFormerSection1034Suspension: true,
      qualifiedPayment: { date: "2026-10-13", amount: "6500", kind: "purchase_price", paidFromMatchedDistribution: true },
      priorQualifiedFirstTimeHomebuyerDistributions: priorDistributions,
    },
  });
}

const readSavedPartI = `
import io, json, sys
from pypdf import PdfReader
reader = PdfReader(io.BytesIO(sys.stdin.buffer.read()))
fields = reader.get_fields()
expected, hidden, notice, protected = [json.loads(arg) for arg in sys.argv[1:]]
for name, value in expected.items():
    assert fields[name].get("/V") == value, name
for name in hidden:
    assert not fields[name].get("/V"), name
page_text = [page.extract_text() for page in reader.pages]
assert len(page_text) == 3 and all(notice in text for text in page_text)
all_values = " ".join(str(field.get("/V", "")) for field in fields.values())
assert all(value not in all_values and all(value not in text for text in page_text) for value in protected)
`;

describe("Final 2026 Form 5329 physical candidate", () => {
  it("pins the exact final annual PDF", async () => {
    const [bytes, candidate] = await Promise.all([readFile(blank), mapping()]);
    expect(bytes.length).toBe(113310);
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("ebc438f7a940285815d43980a59c6cd5fed3ac76c4aab0e85ce0895df53fca2e");
    expect(candidate.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(candidate.sourceRevision).toBe("Created 11/12/26");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 5329");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([
      { width: 612, height: 792 }, { width: 612, height: 792 }, { width: 612, height: 792 },
    ]);
  });

  it("locates all three pages and every unique field", async () => {
    const [source, candidate, pdf] = await Promise.all([
      readFile(sourceContract, "utf8").then(text => JSON.parse(text) as Record<string, Location>),
      mapping(),
      readFile(blank).then(bytes => PDFDocument.load(bytes)),
    ]);
    const form = pdf.getForm();
    expect(form.getFields()).toHaveLength(85);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(source).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
    for (const [key, location] of Object.entries(source)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name, key).toBe(location.name);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(location.type === "/Tx" ? PDFTextField : PDFCheckBox);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const [widget] = widgets;
      const { x, y, width, height } = widget.getRectangle();
      const [left, bottom, right, top] = location.rect;
      expect(x).toBeCloseTo(left, 3);
      expect(y).toBeCloseTo(bottom, 3);
      expect(width).toBeCloseTo(right - left, 3);
      expect(height).toBeCloseTo(top - bottom, 3);
      expect(widget.P()).toEqual(pdf.getPage(location.page - 1).ref);
      if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(location.onState);
    }
  });

  it("records the changed parent and retirement source references", async () => {
    const candidate = await mapping();
    expect(candidate.printedReferences).toEqual({
      schedule2Line5From: ["4", "8", "63"],
      schedule2Line18From: ["17", "25", "33", "41", "49", "51", "55", "61"],
      line55OtherDestination: "Form 1041, Schedule G, line 8",
      line62From: "Form 1099-R, box 7d",
    });
  });

  it("retains stored values and native appearances after save", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    for (const checked of [false, true]) {
      const pdf = await PDFDocument.load(bytes);
      const form = pdf.getForm();
      const textValues = new Map<string, string>();
      const selections = new Map<string, boolean>();
      for (const name of Object.values(candidate.fields)) {
        const field = form.getField(name);
        if (field instanceof PDFCheckBox) {
          selections.set(name, checked);
          if (checked) field.check(); else field.uncheck();
        } else if (field instanceof PDFTextField) {
          const value = "0";
          textValues.set(name, value);
          field.setText(value);
        }
      }
      expect(textValues.size).toBe(83);
      expect(selections.size).toBe(2);
      await markReviewPdf(pdf);
      const reopened = await PDFDocument.load(await pdf.save());
      const saved = reopened.getForm();
      for (const [name, value] of textValues) {
        const field = saved.getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        expectNonemptyStream(field.acroField.getWidgets()[0].getAppearances()?.normal);
      }
      for (const [name, selected] of selections) {
        const field = saved.getCheckBox(name);
        const widget = field.acroField.getWidgets()[0];
        const state = selected ? field.acroField.getOnValue() : PDFName.of("Off");
        if (!state) throw new Error(`Missing checkbox on-state for ${name}`);
        expect(field.isChecked()).toBe(selected);
        expect(widget.getAppearanceState()).toEqual(state);
        const normal = widget.getAppearances()?.normal;
        expect(normal).toBeInstanceOf(PDFDict);
        expectNonemptyStream((normal as PDFDict).lookup(state));
      }
    }
  });

  it("renders exact first-home Part I amounts and isolated transfer from the confirmed original", async () => {
    vi.setSystemTime(new Date(2026, 9, 13, 12));
    const input = documentedFirstHome();
    const { FORM_5329_2026_CANDIDATE: { fields }, fillForm53292026FirstHomeCandidate } =
      await import("@/pdf/mappings/2026/form-5329-candidate.js");
    const bytes = await readFile(blank);
    const { document, schedule2Line5Transfer } = await fillForm53292026FirstHomeCandidate(input, bytes);
    expect(schedule2Line5Transfer.toFixed()).toBe("100");
    const expected = {
      [fields.name]: "Jane Doe", [fields.line1]: "7000", [fields.line2ExceptionNumber]: "09",
      [fields.line2]: "6000", [fields.line3]: "1000", [fields.line4]: "100",
    };
    const saved = await document.save();
    const reopened = await PDFDocument.load(saved);
    for (const [fieldName, value] of Object.entries(expected)) {
      const field = reopened.getForm().getTextField(fieldName);
      expect(field.acroField.getValue()?.decodeText()).toBe(value);
      expectNonemptyStream(field.acroField.getWidgets()[0].getAppearances()?.normal);
    }
    const hidden = [fields.ssn, fields.streetAddress, fields.line5, fields.line8, fields.line17, fields.line63, fields.preparerName];
    const protectedValues = [input.taxpayer.primary.ssn, input.taxpayer.primary.ssn.replaceAll("-", ""),
      input.form1099R![0]!.payer!, input.form1099R![0]!.payerTin!, input.form5329FirstHomeSource!.accountReference];
    execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", readSavedPartI,
      JSON.stringify(expected), JSON.stringify(hidden), JSON.stringify(REVIEW_PDF_NOTICE), JSON.stringify(protectedValues),
    ], { input: saved });

    const full = documentedFirstHome("3000");
    full.form5329FirstHomeSource!.qualifiedPayment.amount = "7000";
    const fullyExcepted = await fillForm53292026FirstHomeCandidate(full, bytes);
    expect(fullyExcepted.schedule2Line5Transfer.toFixed()).toBe("0");
    expect(fullyExcepted.document.getForm().getTextField(fields.line4).getText()).toBe("0");
    expect(fullyExcepted.document.getForm().getTextField(fields.line2ExceptionNumber).getText()).toBe("09");
  });

  it("holds unsupported first-home preparations before writing PDF fields", async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 12));
    const { fillForm53292026FirstHomeCandidate } = await import("@/pdf/mappings/2026/form-5329-candidate.js");
    const bytes = await readFile(blank);
    const input = documentedFirstHome();
    const firstHome = input.form5329FirstHomeSource!;
    const [original] = input.form1099R!;
    for (const [changedInput, message] of [
      [{ ...input, form5329FirstHomeSource: undefined }, /2026.*first-home/],
      [{ ...input, taxpayer: { ...input.taxpayer, taxYear: 2025 } }, /2026.*first-home/],
      [{ ...input, taxpayer: { ...input.taxpayer, filingStatus: "married_filing_jointly" as const } }, /single.*primary/],
      [{ ...input, form1099R: [{ ...original!, accountHolder: "spouse" as const }] }, /single.*primary/],
      [{ ...input, form1099R: [original!, original!] }, /single.*primary/],
      [{ ...input, form5329: { qualifiedFirstTimeHomebuyerDistributionAmount: "5" } }, /manual/],
      [{ ...input, form1099R: [{ ...original!, employeeContributions: undefined }] }, /Box 5/],
      [{ ...input, form1099R: [{ ...original!, trumpAccount: true }] }, /Trump|Box 7/],
      [{ ...input, form1099R: [{ ...original!, excessContributionEarnings: "1" }] }, /Box 7/],
      [{ ...input, form5329FirstHomeSource: { ...firstHome, accountReference: "other original" } }, /match the actual IRA/],
      [{ ...input, form5329FirstHomeSource: { ...firstHome, distributionRolledOver: true } }, /distributionRolledOver/],
      [{ ...input, form5329FirstHomeSource: { ...firstHome, qualifiedPayment: { ...firstHome.qualifiedPayment, date: "2026-10-14" } } }, /day 120/],
      [{ ...input, form5329FirstHomeSource: { ...firstHome, priorQualifiedFirstTimeHomebuyerDistributions: "4000.01" } }, /whole dollar/],
    ] as const) {
      await expect(fillForm53292026FirstHomeCandidate(changedInput as typeof input, bytes).then(() => undefined)).rejects.toThrow(message);
    }
    const education = annualCashQtpFixture(2026).input;
    const withEducationPenalty = TaxYearInputSchema.parse({
      ...input, form1099Q: education.form1099Q, qualifiedEducationExpenses: education.qualifiedEducationExpenses,
    });
    await expect(fillForm53292026FirstHomeCandidate(withEducationPenalty, bytes)).rejects.toThrow(/other Form 5329 parts or transfers/);
    await expect(fillForm53292026FirstHomeCandidate(input, new Uint8Array(1))).rejects.toThrow(/revision/i);
    vi.setSystemTime(new Date(2026, 9, 12, 23, 59, 59));
    await expect(fillForm53292026FirstHomeCandidate(input, bytes)).rejects.toThrow(/occurred/);
  });

  it("keeps every export gate closed", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending",
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes("f5329.pdf", bytes, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f5329.pdf", bytes, 2026)).toThrow(/No qualified review/);
  });
});
