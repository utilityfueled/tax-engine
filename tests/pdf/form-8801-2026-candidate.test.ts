/** Spec: spec/federal/form-8801.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Decimal from "decimal.js";
import { decodePDFRawStream, PDFBool, PDFName, PDFRawStream, PDFStream, PDFTextField } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { calculateForm8801 } from "@/engine/forms/form-8801.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { FORM_8801_2026_CANDIDATE as candidate } from "@/pdf/mappings/2026/form-8801-candidate.js";
import { loadPdfDocumentQuietly } from "@/pdf/pdf-utils.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const blank = new URL("../../forms/blank/2026/f8801.pdf", import.meta.url);
const mapper = () => import("@/pdf/mappings/2026/form-8801-candidate.js");

function originalCase(carry = "3189", taxable = "200000", priorAmounts = ["30000", "20000", "10000"]) {
  const [line9, line10, line11] = priorAmounts;
  const input = TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    form8801: {
      priorYear: 2025, sourceFactsConfirmed: true, priorYearFilingStatus: "single",
      priorYearForm6251Line1And2e: taxable, priorYearExclusionItemAdjustments: "15750",
      priorYearMinimumTaxCreditNOLDeduction: "0", priorYearMinimumTaxForeignTaxCredit: "0",
      priorYearForm6251Line10: line10, priorYearAMT: line11,
      unusedMinimumTaxCreditCarryforward: carry, priorYearUnallowedQualifiedElectricVehicleCredit: "0",
      priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
    },
  });
  const owner = { firstName: "Jane", lastName: "Doe", ssnLast4: "6789" };
  const sources = {
    calendarYearReturnConfirmed: true,
    priorOrdinaryStandardDeductionConfirmed: true,
    onlyStandardDeductionExclusionConfirmed: true,
    priorFilingStatus: "single", priorFiledForm2555: false, priorFiledForm1040NR: false,
    priorCapitalGainsWorksheetRequired: false, priorNoNolConfirmed: true,
    priorNoExclusionForeignTaxCreditConfirmed: true, priorNoUnallowedQualifiedEvCreditConfirmed: true,
    priorForm6251: {
      form: "6251", taxYear: 2025, owner: { ...owner }, operativeFiledOriginalConfirmed: true,
      sourceReference: "Private prior AMT original", line1b: taxable, line2a: "15750", line2e: "0", line9, line10, line11,
    },
    priorForm8801: {
      form: "8801", taxYear: 2025, owner: { ...owner }, operativeFiledOriginalConfirmed: true,
      sourceReference: "Private carry original", line26: carry,
    },
  };
  return { input, sources };
}

function fieldNames() {
  return {
    p1: Array.from({ length: 17 }, (_, index) => `topmostSubform[0].Page1[0].f1_${index + 1}[0]`),
    p2: Array.from({ length: 11 }, (_, index) => `topmostSubform[0].Page2[0].f2_${index + 1}[0]`),
  };
}

describe("Final 2026 Form 8801 physical source", () => {
  it("pins the official annual bytes and confirms all four pages and 57 text widgets", async () => {
    const bytes = await readFile(blank);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(sha256).toBe("782d879f1d6e3ca636c129a61092f957f86e028e056e5261e5feb3895410d8f1");
    expect(bytes.length).toBe(99515);
    expect(candidate).toMatchObject({
      taxYear: 2026, sha256,
      sourceUrl: "https://www.irs.gov/pub/irs-pdf/f8801.pdf",
      annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f8801--2026.pdf",
      sourceRevision: "Created 5/27/26",
      postedDate: "2026-11-23",
    });
    const pdf = await loadPdfDocumentQuietly(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 8801");
    const pages = pdf.getPages();
    const fields = pdf.getForm().getFields();
    expect(pages.map(page => page.getSize())).toEqual(Array.from({ length: 4 }, () => ({ width: 612, height: 792 })));
    expect(fields).toHaveLength(57);
    expect(fields.every(field => field instanceof PDFTextField && !field.getText())).toBe(true);
    expect(pages.map(page => page.node.Annots()?.size())).toEqual([17, 11, 16, 13]);
    const widgets = fields.flatMap(field => field.acroField.getWidgets());
    expect(widgets).toHaveLength(57);
    expect(pages.map(page => widgets.filter(widget => widget.P() === page.ref).length)).toEqual([17, 11, 16, 13]);
  });

  it("round-trips a signed adjustment, credit limit, and carry in the physical Part II widgets", async () => {
    // Synthetic source amounts exercise the existing individual calculator only.
    const amount = (value: string) => new Decimal(value);
    const result = calculateForm8801({
      taxYear: 2026, priorYear: 2025, sourceFactsConfirmed: true, priorYearFilingStatus: "single",
      priorYearForm6251Line1And2e: amount("200000"), priorYearExclusionItemAdjustments: amount("10000"),
      priorYearMinimumTaxCreditNOLDeduction: amount("0"), priorYearMinimumTaxForeignTaxCredit: amount("1000"),
      priorYearForm6251Line10: amount("20000"), priorYearAMT: amount("10000"),
      unusedMinimumTaxCreditCarryforward: amount("5000"), priorYearUnallowedQualifiedElectricVehicleCredit: amount("0"),
      priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
      currentYearRegularTaxAfterCredits: amount("40000"), currentYearTMT: amount("37000"),
    });
    expect(result.sourceFactsVerified).toBe(true);
    const expected = ["10000", "10694", "-694", "5000", "0", "4306", "40000", "37000", "3000", "3000", "1306"];
    const doc = await loadPdfDocumentQuietly(await readFile(blank));
    const page = doc.getPage(1);
    let previousWidgetY = page.getHeight();
    const fields = Object.entries(candidate.partIIFields).map(([line, name]) => {
      const field = doc.getForm().getTextField(name);
      const [widget] = field.acroField.getWidgets();
      expect(widget.P()).toBe(page.ref);
      // Each successive printed line is below the previous one on Part II.
      const { y } = widget.getRectangle();
      expect(y).toBeLessThan(previousWidgetY);
      previousWidgetY = y;
      const entry = result.lines.find(entry => entry.form === "Form 8801" && entry.line === line);
      if (!entry) throw new Error(`Form 8801 test needs calculation line ${line}`);
      const value = entry.value.toFixed();
      field.setText(value);
      return value;
    });
    expect(fields).toEqual(expected);
    await markReviewPdf(doc);
    const reopened = await loadPdfDocumentQuietly(await doc.save());
    expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
    expect(Object.values(candidate.partIIFields).map(name => reopened.getForm().getTextField(name).getText())).toEqual(expected);
  });

  it("keeps the source receipt outside the public review and filing registries", async () => {
    const bytes = await readFile(blank);
    expect(candidate).toMatchObject({ reviewStatus: "independent-review-pending", exportsEnabled: false, filingQualified: false });
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
    expect(() => assertReviewTemplateBytes("f8801.pdf", bytes, 2025)).toThrow(/No registered review template|Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8801.pdf", bytes, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  });
});

it("reopens exact native values and stops at zero or negative line 21", async () => {
  const { fillForm88012026NoCreditCandidate } = await mapper();
  const template = await readFile(blank);
  for (const [carry, subtotal] of [["3189", "0"], ["3188", "-1"]]) {
    const { input, sources } = originalCase(carry);
    const reopened = await loadPdfDocumentQuietly(await (await fillForm88012026NoCreditCandidate(input, sources, template)).save());
    expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
    expect(reopened.getTitle()?.trim()).toBe("2026 Form 8801");
    expect(reopened.getPages().map(page => page.node.Annots()?.size())).toEqual([17, 11, 16, 13]);
    for (const page of reopened.getPages()) {
      const streams = page.node.normalizedEntries().Contents?.asArray() ?? [];
      expect(streams.some(reference => {
        const stream = reopened.context.lookup(reference);
        return stream instanceof PDFStream && stream.dict.get(PDFName.of("TaxEngineReviewNotice")) === PDFBool.True;
      })).toBe(true);
    }
    const form = reopened.getForm();
    const read = (name: string) => {
      const field = form.getTextField(name);
      const value = field.getText() ?? "";
      if (value) {
        expect(field.acroField.dict.has(PDFName.of("V"))).toBe(true);
        const appearance = reopened.context.lookup(field.acroField.getWidgets()[0].getAppearances()?.normal);
        expect(appearance).toBeInstanceOf(PDFRawStream);
        if (appearance instanceof PDFRawStream) {
          expect(Buffer.from(decodePDFRawStream(appearance).decode()).toString("ascii"))
            .toContain(`<${Buffer.from(value, "ascii").toString("hex").toUpperCase()}> Tj`);
        }
      }
      return value;
    };
    const { p1, p2 } = fieldNames();
    expect(p1.map(read)).toEqual(["Jane Doe", "", "200000", "15750", "0", "215750", "88100", "626350",
      "-0-", "-0-", "88100", "127650", "33189", "0", "33189", "20000", "13189"]);
    expect(p2.map(read)).toEqual(["10000", "13189", "-3189", carry, "0", subtotal, "", "", "", "", ""]);
    expect(form.getFields().slice(28).map(field => read(field.getName()))).toEqual(Array(29).fill(""));
    const bytes = Buffer.from(await reopened.save()).toString("latin1");
    expect(bytes).not.toContain("Private prior AMT original");
    expect(bytes).not.toContain("Private carry original");
  }
});

it("preserves both printed Part I stop branches", async () => {
  const { fillForm88012026NoCreditCandidate } = await mapper();
  const template = await readFile(blank);
  for (const [taxable, firstPartBlank] of [["-16000", 5], ["10000", 11]] as const) {
    const { input, sources } = originalCase("0", taxable, ["0", "0", "0"]);
    const form = (await loadPdfDocumentQuietly(await (await fillForm88012026NoCreditCandidate(input, sources, template)).save())).getForm();
    const { p1, p2 } = fieldNames();
    expect(form.getTextField(p1[firstPartBlank]).getText()).toBe("-0-");
    expect(p1.slice(firstPartBlank + 1, 16).every(name => !form.getTextField(name).getText())).toBe(true);
    expect(form.getTextField(p1[16]).getText()).toBe("-0-");
    expect(form.getTextField(p2[5]).getText()).toBe("0");
  }
});

it("holds missing or contradictory original return evidence", async () => {
  const { fillForm88012026NoCreditCandidate } = await mapper();
  const template = await readFile(blank);
  const { input, sources } = originalCase();
  const broken = [
    { ...sources, priorForm8801: undefined },
    { ...sources, priorForm6251: undefined },
    { ...sources, priorForm8801: { ...sources.priorForm8801, line26: undefined } },
    { ...sources, priorForm8801: { ...sources.priorForm8801, line26: "3190" } },
    { ...sources, priorForm8801: { ...sources.priorForm8801, line26: "3189.01" } },
    { ...sources, priorForm8801: { ...sources.priorForm8801, owner: { ...sources.priorForm8801.owner, ssnLast4: "6790" } } },
    { ...sources, priorForm8801: { ...sources.priorForm8801, taxYear: 2024 } },
    { ...sources, priorForm8801: { ...sources.priorForm8801, operativeFiledOriginalConfirmed: false } },
    { ...sources, priorForm8801: { ...sources.priorForm8801, sourceReference: sources.priorForm6251.sourceReference } },
    { ...sources, priorForm6251: { ...sources.priorForm6251, owner: { ...sources.priorForm6251.owner, firstName: "Janet" } } },
    { ...sources, priorForm6251: { ...sources.priorForm6251, line9: "30001" } },
    { ...sources, priorForm6251: { ...sources.priorForm6251, line2a: "15749" } },
    { ...sources, priorForm6251: { ...sources.priorForm6251, line2a: "invalid" } },
    { ...sources, priorForm6251: { ...sources.priorForm6251, line2e: "1", line1b: "199999" } },
    { ...sources, onlyStandardDeductionExclusionConfirmed: false },
    { ...sources, priorCapitalGainsWorksheetRequired: true },
  ];
  for (const original of broken) await expect(fillForm88012026NoCreditCandidate(input, original, template)).rejects.toThrow(/original|reconcile|source/i);
  if (!input.form8801) throw new Error("Expected canonical prior facts in this fixture.");
  await expect(fillForm88012026NoCreditCandidate({ ...input, form8801: { ...input.form8801, sourceFactsComplete: false } }, sources, template))
    .rejects.toThrow(/original|reconcile|source/i);
  await expect(fillForm88012026NoCreditCandidate({ ...input, form8801: { ...input.form8801, priorYearQualifiedDividends: "-1" } }, sources, template))
    .rejects.toThrow(/original|reconcile|source/i);
  const decedent = { ...input, standardDeductionFacts: { ...input.standardDeductionFacts, primaryDeathDate: "2026-06-15" } };
  await expect(fillForm88012026NoCreditCandidate(decedent, sources, template)).rejects.toThrow(/living single calendar-year/i);
  await expect(fillForm88012026NoCreditCandidate({ ...input, taxpayer: { ...input.taxpayer, taxYear: 2025 } }, sources, template))
    .rejects.toThrow(/current living single/i);
  await expect(fillForm88012026NoCreditCandidate(input, sources, template.subarray(1))).rejects.toThrow(/template revision/i);
});

it("holds a positive pool and supplied substitutes for current-year forms", async () => {
  const { fillForm88012026NoCreditCandidate } = await mapper();
  const template = await readFile(blank);
  const { input, sources } = originalCase("3190");
  await expect(fillForm88012026NoCreditCandidate(input, sources, template)).rejects.toThrow(/positive.*2026.*6251/i);
  const noCredit = originalCase();
  await expect(fillForm88012026NoCreditCandidate(noCredit.input, { ...noCredit.sources, currentYearTMT: "37000" }, template))
    .rejects.toThrow(/original|source/i);
  const fractional = originalCase("3188.99");
  await expect(fillForm88012026NoCreditCandidate(fractional.input, fractional.sources, template)).rejects.toThrow(/original|source/i);
});
