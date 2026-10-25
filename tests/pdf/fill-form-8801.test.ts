/**
 * Spec: spec/federal/form-8801.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { PDFDocument } from "pdf-lib";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { calculateForm8801 } from "@/engine/forms/form-8801.js";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm8801ReferenceSummary,
  fillForm8801Reference,
  FORM_8801_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8801.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8801-"));
}

function worksheetResult() {
  const d = (value: string) => new Decimal(value);
  return calculateForm8801({
    priorYearFilingStatus: "single", priorYearTaxableIncome: d("200000"),
    priorYearExclusionItemAdjustments: d("10000"), priorYearAMT: d("1000"),
    priorYearRegularTax: d("35000"), unusedMinimumTaxCreditCarryforward: d("2500"),
    currentYearRegularTaxAfterCredits: d("40000"), currentYearTMT: d("35000"),
    priorYearCapitalGainsWorksheet: { method: "qualified_dividends", preferentialIncome: d("30000"), ordinaryIncomeForZeroRate: d("170000"), ordinaryIncomeForFifteenRate: d("170000") },
  });
}

describe("Form 8801 packet reference summary", () => {
  it("buildForm8801ReferenceSummary keeps the packet artifact reference-only and limited to supported prior-year minimum-tax-credit outputs", () => {
    const form8801Fixture = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "200000", federalWithheld: "40000" }],
      form8801: {
        priorYearFilingStatus: "single",
        priorYearTaxableIncome: "180000",
        priorYearExclusionItemAdjustments: "15000",
        priorYearAMT: "3000",
        priorYearRegularTax: "35000",
        unusedMinimumTaxCreditCarryforward: "2500",
      },
    };

    const result = calculateFederalTax(form8801Fixture);
    if (!result.form8801) throw new Error("Expected calculated Form8801");
    const summary = buildForm8801ReferenceSummary(result.form8801);

    expect(summary.title).toBe("Form 8801 Prior Year Minimum Tax Credit Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.introduction).toContain("unverified historical");
    expect(summary.introduction).toContain("2025");
    expect(summary.introduction).toContain("2024");
    expect(summary.lines.map((line) => line.line)).toEqual(Array.from({ length: 26 }, (_, index) => String(index + 1)));
    expect(summary.lines.map((line) => line.value)).toEqual([
      "180000", "15000", "0", "195000", "85700", "609350", "0", "0", "85700", "109300", "28418", "0", "28418", "35000", "0", "3000", "0", "3000", "2500", "0", "5500", "37067", "29094", "7973", "5500", "0",
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Total available minimum tax credit",
        value: "5500",
      },
      {
        label: "Allowable current-year minimum tax credit",
        value: "5500",
      },
      {
        label: "Carryforward to next year",
        value: "0",
      },
    ]);
  });

  it("rejects missing duplicate nonfinite inconsistent and wrong-year audits", () => {
    const result = worksheetResult();
    const first = result.lines.find(line => line.line === "1");
    if (!first) throw new Error("Expected actual source audit");
    for (const lines of [
      result.lines.filter(line => line.line !== "4"),
      result.lines.filter(line => line.line !== "35"),
      [...result.lines, first],
      result.lines.map(line => line.line === "11" ? { ...line, value: new Decimal("NaN") } : line),
      result.lines.map(line => line.line === "25" ? { ...line, value: new Decimal("999") } : line),
      result.lines.map(line => line.line === "4" ? { ...line, form: "Other Form" } : line),
    ]) expect(() => buildForm8801ReferenceSummary({ ...result, lines })).toThrow(/audit/i);
    expect(() => buildForm8801ReferenceSummary({ ...result, taxYear: 2026, priorYear: 2025 })).toThrow(/year|mapping/i);
    expect(() => buildForm8801ReferenceSummary({ ...result, priorYear: 2023 })).toThrow(/year/i);
  });

  it("copies PartIII audits and marks every page as review-only", async () => {
    const result = worksheetResult();
    const summary = buildForm8801ReferenceSummary(result);
    expect(summary.lines.map(line => line.line)).toEqual(Array.from({ length: 55 }, (_, index) => String(index + 1)));
    expect(summary.lines.find(line => line.line === "35")?.value).toBe("170000");
    expect(summary.lines.find(line => line.line === "55")?.value).toBe("29018");
    const outputDir = await makeOutputDir();
    try {
      const path = await fillForm8801Reference(result, outputDir);
      const doc = await PDFDocument.load(await readFile(path));
      expect(doc.getPageCount()).toBeGreaterThan(1);
      expect(doc.getSubject()).toBe(REVIEW_PDF_NOTICE);
      for (const page of doc.getPages()) expect(page.node.Contents()).toBeDefined();
    } finally { await rm(outputDir, { recursive: true, force: true }); }
  });

  it("fillReturn includes a Form 8801 reference summary when prior-year minimum tax credit input is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const form8801Fixture = {
        ...simpleW2Fixture,
        w2s: [{ ...simpleW2Fixture.w2s[0], wages: "200000", federalWithheld: "40000" }],
        form8801: {
          priorYearFilingStatus: "single",
          priorYearTaxableIncome: "180000",
          priorYearExclusionItemAdjustments: "15000",
          priorYearAMT: "3000",
          priorYearRegularTax: "35000",
          unusedMinimumTaxCreditCarryforward: "2500",
        },
      };

      const result = calculateFederalTax(form8801Fixture);
      const { filledForms } = await fillReturn(form8801Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_8801_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      if (!referencePath) throw new Error("Expected Form8801 review reference");
      await access(referencePath);
      const pdfBytes = await readFile(referencePath);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 8801 reference summary when no prior-year minimum tax credit input is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_8801_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
