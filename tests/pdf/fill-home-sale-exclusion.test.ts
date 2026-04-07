/**
 * Spec: spec/federal/home-sale-exclusion.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildHomeSaleExclusionReferenceSummary,
  HOME_SALE_EXCLUSION_REFERENCE_FILENAME,
} from "@/pdf/fill-home-sale-exclusion.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-home-sale-"));
}

const homeSaleFixture = {
  ...simpleW2Fixture,
  homeSales: [
    {
      accountHolder: "primary" as const,
      salePrice: "600000",
      sellingExpenses: "30000",
      purchasePrice: "200000",
      improvements: "50000",
      depreciationAfterMay1997: "10000",
      casualtyLossDeductions: "0",
      otherBasisAdjustments: "0",
      daysOwned: 1825,
      daysUsedAsResidence: 1825,
      usedExclusionInPrior2Years: false,
      qualifiesForReducedExclusion: false,
    },
    {
      salePrice: "320000",
      sellingExpenses: "20000",
      purchasePrice: "310000",
      improvements: "0",
      depreciationAfterMay1997: "0",
      casualtyLossDeductions: "0",
      otherBasisAdjustments: "0",
      daysOwned: 1500,
      daysUsedAsResidence: 1500,
      usedExclusionInPrior2Years: false,
      qualifiesForReducedExclusion: false,
    },
  ],
} as const;

describe("Home sale exclusion packet reference summary", () => {
  it("buildHomeSaleExclusionReferenceSummary keeps the packet artifact reference-only and limited to supported home sale exclusion outputs", () => {
    const result = calculateFederalTax(homeSaleFixture);
    const summary = buildHomeSaleExclusionReferenceSummary(homeSaleFixture, result);

    expect(summary.title).toBe("Home Sale Exclusion Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.saleCount).toBe(2);
    expect(summary.sales[0]).toMatchObject({
      saleLabel: "Home sale 1",
      accountHolderLabel: "Primary taxpayer",
      hasGain: true,
      meetsFullExclusionTests: true,
      qualifiesForReducedExclusion: false,
      hasDepreciationRecapture: true,
      notes: [],
    });
    expect(summary.sales[0]?.checks).toEqual([
      { line: "ownership-test", description: "Ownership test", status: "pass" },
      { line: "use-test", description: "Use test", status: "pass" },
      { line: "frequency-test", description: "Frequency limitation", status: "pass" },
    ]);
    expect(summary.sales[0]?.lines).toEqual([
      { line: "1", description: "Amount realized from sale", value: "570000" },
      { line: "2", description: "Adjusted basis of home", value: "240000" },
      { line: "3", description: "Gain or loss on sale", value: "330000" },
      { line: "4", description: "Maximum exclusion amount", value: "250000" },
      { line: "5", description: "Excludable gain", value: "250000" },
      { line: "6", description: "Taxable gain", value: "80000" },
      {
        line: "depreciation-recapture",
        description: "Depreciation recapture (unrecaptured Section 1250 gain)",
        value: "10000",
      },
    ]);
    expect(summary.sales[1]).toMatchObject({
      saleLabel: "Home sale 2",
      accountHolderLabel: "Taxpayer",
      hasGain: false,
      meetsFullExclusionTests: false,
      qualifiesForReducedExclusion: false,
      hasDepreciationRecapture: false,
      notes: ["Loss on personal-use property is not deductible."],
    });
    expect(summary.sales[1]?.checks).toEqual([
      { line: "ownership-test", description: "Ownership test", status: "not-applicable" },
      { line: "use-test", description: "Use test", status: "not-applicable" },
      { line: "frequency-test", description: "Frequency limitation", status: "not-applicable" },
    ]);
    expect(summary.sales[1]?.lines).toEqual([
      { line: "1", description: "Amount realized from sale", value: "300000" },
      { line: "2", description: "Adjusted basis of home", value: "310000" },
      { line: "3", description: "Gain or loss on sale", value: "-10000" },
      { line: "4", description: "Maximum exclusion amount", value: "0" },
      { line: "5", description: "Excludable gain", value: "0" },
      { line: "6", description: "Taxable gain", value: "0" },
      {
        line: "depreciation-recapture",
        description: "Depreciation recapture (unrecaptured Section 1250 gain)",
        value: "0",
      },
    ]);
    expect(summary.totals).toEqual([
      { label: "Aggregate Schedule D taxable gain", value: "80000" },
      { label: "Aggregate depreciation recapture included in taxable gain", value: "10000" },
    ]);
  });

  it("fillReturn includes a home sale exclusion reference summary when supported home sale inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(homeSaleFixture);
      const { filledForms } = await fillReturn(homeSaleFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(HOME_SALE_EXCLUSION_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the home sale exclusion reference summary when no supported home sale inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(HOME_SALE_EXCLUSION_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
