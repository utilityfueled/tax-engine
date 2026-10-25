/**
 * Spec: spec/federal/form-8801.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm8801ReferenceSummary,
  FORM_8801_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8801.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8801-"));
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
    const summary = buildForm8801ReferenceSummary(result.form8801!);

    expect(summary.title).toBe("Form 8801 Prior Year Minimum Tax Credit Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.lines.map((line) => line.line)).toEqual([
      "1",
      "3",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "22",
      "23",
      "24",
      "25",
      "26",
    ]);
    expect(summary.lines.map((line) => line.value)).toEqual([
      "15000",
      "195000",
      "85700",
      "109300",
      "28418",
      "35000",
      "0",
      "3000",
      "0",
      "3000",
      "2500",
      "5500",
      "37067",
      // 2025 TMT: (200,000 AMTI - 88,100 exemption) × 26% = 29,094.
      "29094",
      // Regular tax 37,067 - TMT 29,094 = 7,973 current-year limitation.
      "7973",
      "5500",
      "0",
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
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
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
