/**
 * Spec: spec/federal/form-8915-f.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm8915FReferenceSummary,
  FORM_8915_F_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8915-f.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8915f-"));
}

describe("Form 8915-F packet reference summary", () => {
  it("buildForm8915FReferenceSummary keeps the packet artifact reference-only and limited to supported qualified disaster distribution outputs", () => {
    const disasterFixture = {
      ...simpleW2Fixture,
      form8915F: {
        currentYearDistributions: [
          {
            disasterName: "2025 Wildfire Atlas",
            disasterDate: "2025-02-15",
            grossDistribution: "22000",
            iraDistribution: "12000",
            currentYearRepayments: "2000",
            electFullInclusion: false,
          },
        ],
        priorYearDeferrals: [
          {
            disasterName: "2024 Hurricane Beacon",
            distributionYear: 2024,
            spreadYear: 2,
            annualSpreadAmount: "4000",
            remainingDeferredBalance: "8000",
            iraFraction: "0.25",
            currentYearRepayments: "500",
          },
        ],
      },
    };

    const result = calculateFederalTax(disasterFixture);
    const summary = buildForm8915FReferenceSummary(
      disasterFixture.form8915F,
      disasterFixture.taxpayer.taxYear,
      result.form8915F!,
    );

    expect(summary.title).toBe("Form 8915-F Qualified Disaster Distribution Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.lines).toEqual([
      {
        line: "1",
        description: "Total qualified disaster distributions (current year)",
        value: "22000",
        formula: "Sum of per-disaster grossDistribution each capped at $22,000",
      },
      {
        line: "2",
        description: "Current-year repayments for current-year distributions",
        value: "2000",
        formula: "Sum of per-disaster currentYearRepayments, each limited to qualified amount",
      },
      {
        line: "3",
        description: "Net current-year distributions after repayments",
        value: "20000",
        formula: "Line 1 minus Line 2",
      },
      {
        line: "4",
        description: "Current-year includable amount",
        value: "6667",
        formula: "Sum of per-disaster includable: 1/3 for 3-year spread, full for full-inclusion election",
      },
      {
        line: "5",
        description: "Prior-year deferred amounts includable this year",
        value: "3500",
        formula: "Sum of prior-year per-disaster deferred records after repayments",
      },
      {
        line: "6",
        description: "Total amount includable in income this year",
        value: "10167",
        formula: "Line 4 plus Line 5",
      },
      {
        line: "7",
        description: "IRA portion of includable amount",
        value: "4512",
        formula: "Prorated from IRA/non-IRA source mix per disaster",
      },
      {
        line: "8",
        description: "Non-IRA (pension) portion of includable amount",
        value: "5655",
        formula: "Line 6 minus Line 7",
      },
      {
        line: "9",
        description: "Penalty exception amount",
        value: "30000",
        formula: "Total qualified distributions (current + prior year deferred) exempt from IRC 72(t) 10% penalty",
      },
      {
        line: "10",
        description: "Total deferred to future years",
        value: "13333",
        formula: "Remaining 2/3 for 3-year spread elections",
      },
    ]);
    expect(summary.currentYearDistributions).toEqual([
      {
        disasterName: "2025 Wildfire Atlas",
        qualifiedAmount: "22000",
        repayments: "2000",
        netAfterRepayments: "20000",
        currentYearIncludable: "6667",
        deferredToFutureYears: "13333",
        iraPortionOfIncludable: "3637",
        pensionPortionOfIncludable: "3030",
        electFullInclusion: false,
      },
    ]);
    expect(summary.priorYearDeferrals).toEqual([
      {
        disasterName: "2024 Hurricane Beacon",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "4000",
        remainingBefore: "8000",
        repayments: "500",
        includableThisYear: "3500",
        iraPortionOfIncludable: "875",
        pensionPortionOfIncludable: "2625",
      },
    ]);
    expect(summary.carryforwardDeferrals).toEqual([
      {
        disasterName: "2025 Wildfire Atlas",
        distributionYear: 2025,
        spreadYear: 2,
        annualSpreadAmount: "6667",
        remainingDeferredBalance: "13333",
        iraFraction: "0.54545454545454545455",
      },
      {
        disasterName: "2024 Hurricane Beacon",
        distributionYear: 2024,
        spreadYear: 3,
        annualSpreadAmount: "4000",
        remainingDeferredBalance: "4000",
        iraFraction: "0.25",
      },
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Form 1040 Line 4b IRA disaster amount",
        value: "4512",
      },
      {
        label: "Form 1040 Line 5b pension disaster amount",
        value: "5655",
      },
      {
        label: "Form 5329 penalty exception amount",
        value: "30000",
      },
      {
        label: "Deferred amount tracked forward",
        value: "13333",
      },
    ]);
  });

  it("fillReturn includes a Form 8915-F reference summary when qualified disaster distribution activity is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const disasterFixture = {
        ...simpleW2Fixture,
        form8915F: {
          currentYearDistributions: [
            {
              disasterName: "2025 Wildfire Atlas",
              disasterDate: "2025-02-15",
              grossDistribution: "22000",
              iraDistribution: "12000",
              currentYearRepayments: "2000",
              electFullInclusion: false,
            },
          ],
          priorYearDeferrals: [],
        },
      };

      const result = calculateFederalTax(disasterFixture);
      const { filledForms } = await fillReturn(disasterFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_8915_F_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 8915-F reference summary when the form payload is absent or empty", async () => {
    const outputDir = await makeOutputDir();

    try {
      const emptyFormFixture = {
        ...simpleW2Fixture,
        form8915F: {
          currentYearDistributions: [],
          priorYearDeferrals: [],
        },
      };

      const result = calculateFederalTax(emptyFormFixture);
      const { filledForms } = await fillReturn(emptyFormFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_8915_F_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
