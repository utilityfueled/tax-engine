/**
 * Spec: spec/federal/form-4562.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm4562ReferenceSummary,
  FORM_4562_REFERENCE_FILENAME,
} from "@/pdf/fill-form-4562.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-4562-"));
}

const scheduleCForm4562Fixture = {
  ...simpleW2Fixture,
  scheduleC: {
    businessName: "Doe Consulting",
    businessCode: "541611",
    grossReceipts: "25000",
    expenses: {
      officeExpense: "1500",
    },
  },
  form4562: {
    section179TotalCost: "10000",
    section179ElectedCost: "6000",
    section179CarryoverFromPriorYear: "0",
    section179BusinessIncomeLimit: "5000",
    specialDepreciationAllowance: "0",
    section168f1Depreciation: "0",
    otherDepreciation: "0",
    macrsPre2025AssetsDepreciation: "1200",
    macrsCurrentYearGdsDepreciation: "800",
    macrsCurrentYearAdsDepreciation: "0",
    listedPropertyDepreciation: "0",
    currentYearAmortization: "300",
    priorYearAmortization: "100",
  },
} as const;

const rentalForm4562Fixture = {
  ...simpleW2Fixture,
  rentalProperties: [
    {
      description: "123 Main St",
      rents: "18000",
      advertising: "0",
      form4562: {
        section179TotalCost: "0",
        section179ElectedCost: "0",
        section179CarryoverFromPriorYear: "0",
        section179BusinessIncomeLimit: "0",
        specialDepreciationAllowance: "0",
        section168f1Depreciation: "0",
        otherDepreciation: "0",
        macrsPre2025AssetsDepreciation: "2500",
        macrsCurrentYearGdsDepreciation: "0",
        macrsCurrentYearAdsDepreciation: "0",
        listedPropertyDepreciation: "0",
        currentYearAmortization: "150",
        priorYearAmortization: "50",
      },
    },
  ],
} as const;

describe("Form 4562 packet reference summary", () => {
  it("buildForm4562ReferenceSummary keeps the packet artifact reference-only and limited to supported depreciation, amortization, and recapture outputs", () => {
    const summary = buildForm4562ReferenceSummary(scheduleCForm4562Fixture);

    expect(summary.title).toBe("Form 4562 Depreciation and Amortization Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.activityCount).toBe(1);
    expect(summary.activities[0]).toMatchObject({
      activityLabel: "Schedule C: Doe Consulting",
      downstreamBridgeLabel: "Schedule C Line 13 depreciation and section 179 deduction",
      downstreamBridgeValue: "7000",
      amortizationBridgeLabel: "Supplemental amortization reference (Form 4562 Line 44)",
      amortizationBridgeValue: "400",
      recaptureLabel: "IRC Section 280F recapture income",
      recaptureValue: "0",
    });
    expect(summary.activities[0]?.lines.map((line) => line.line)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "19",
      "20",
      "21",
      "22",
      "42",
      "43",
      "44",
    ]);
    expect(summary.activities[0]?.lines.find((line) => line.line === "22")).toMatchObject({
      description: "Total depreciation and section 179 deduction",
      value: "7000",
    });
    expect(summary.activities[0]?.lines.find((line) => line.line === "44")).toMatchObject({
      description: "Total amortization deduction",
      value: "400",
    });
  });

  it("buildForm4562ReferenceSummary includes supported rental-property Form 4562 activity separately from Schedule C", () => {
    const summary = buildForm4562ReferenceSummary({
      ...scheduleCForm4562Fixture,
      rentalProperties: rentalForm4562Fixture.rentalProperties,
    });

    expect(summary.activityCount).toBe(2);
    expect(summary.activities.map((activity) => activity.activityLabel)).toEqual([
      "Schedule C: Doe Consulting",
      "Rental property: 123 Main St",
    ]);
    expect(summary.activities[1]).toMatchObject({
      downstreamBridgeLabel: "Schedule E depreciation bridge from Form 4562 lines 14-21",
      downstreamBridgeValue: "2500",
      amortizationBridgeValue: "200",
      recaptureValue: "0",
    });
  });

  it("fillReturn includes a Form 4562 reference summary when a supported Schedule C activity supplies Form 4562 input", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(scheduleCForm4562Fixture);
      const { filledForms } = await fillReturn(scheduleCForm4562Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_4562_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn includes a Form 4562 reference summary when only a supported rental property supplies Form 4562 input", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(rentalForm4562Fixture);
      const { filledForms } = await fillReturn(rentalForm4562Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_4562_REFERENCE_FILENAME))).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 4562 reference summary when no supported Form 4562 input is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_4562_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
