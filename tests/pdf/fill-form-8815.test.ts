/**
 * Spec: spec/federal/form-8815.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm8815ReferenceSummary,
  FORM_8815_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8815.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8815-"));
}

describe("Form 8815 packet reference summary", () => {
  it("buildForm8815ReferenceSummary keeps the packet artifact reference-only and limited to supported savings-bond outputs", () => {
    const savingsBondFixture = {
      ...simpleW2Fixture,
      savingsBondRedemptions: [
        {
          proceeds: "10000",
          interest: "500",
          qualifiedExpenses: "5000",
        },
        {
          proceeds: "5000",
          interest: "250",
          qualifiedExpenses: "2500",
        },
      ],
    };

    const result = calculateFederalTax(savingsBondFixture);
    const summary = buildForm8815ReferenceSummary(
      savingsBondFixture.savingsBondRedemptions,
      result.form8815!,
    );

    expect(summary.title).toBe("Form 8815 Savings Bond Interest Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.redemptionCount).toBe(2);
    expect(summary.redemptions).toEqual([
      {
        redemptionNumber: 1,
        proceeds: "10000",
        interest: "500",
        qualifiedExpenses: "5000",
      },
      {
        redemptionNumber: 2,
        proceeds: "5000",
        interest: "250",
        qualifiedExpenses: "2500",
      },
    ]);
    expect(summary.lines).toEqual([
      {
        line: "2",
        description: "Qualified higher education expenses",
        value: "7500",
        formula: "Tuition + fees, reduced by scholarships",
      },
      {
        line: "3",
        description: "Total bond proceeds",
        value: "15000",
        formula: "Principal + interest from redeemed bonds",
      },
      {
        line: "4",
        description: "Interest included in proceeds",
        value: "750",
        formula: "Interest earned on redeemed bonds",
      },
      {
        line: "5",
        description: "Expenses-to-proceeds ratio",
        value: "0.5",
        formula: "min(1, 7500 / 15000)",
      },
      {
        line: "6",
        description: "Excludable interest before phase-out",
        value: "375",
        formula: "750 x 0.5",
      },
      {
        line: "7",
        description: "Modified AGI",
        value: "85000",
        formula: "AGI for phase-out purposes",
      },
      {
        line: "8",
        description: "Phase-out threshold",
        value: "99500",
        formula: "single threshold",
      },
      {
        line: "9",
        description: "Excess over threshold",
        value: "0",
        formula: "max(0, 85000 - 99500)",
      },
      {
        line: "10",
        description: "Phase-out range",
        value: "15000",
        formula: "single phase-out range",
      },
      {
        line: "11",
        description: "Phase-out ratio",
        value: "0",
        formula: "min(1, 0 / 15000)",
      },
      {
        line: "12",
        description: "Phase-out reduction",
        value: "0",
        formula: "375 x 0",
      },
      {
        line: "13",
        description: "Excludable savings bond interest",
        value: "375",
        formula: "375 - 0 -> Schedule B Line 3",
      },
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Schedule B Line 3 exclusion",
        value: "375",
      },
    ]);
  });

  it("fillReturn includes a Form 8815 reference summary when savings bond redemptions produce an exclusion claim", async () => {
    const outputDir = await makeOutputDir();

    try {
      const savingsBondFixture = {
        ...simpleW2Fixture,
        savingsBondRedemptions: [
          {
            proceeds: "10000",
            interest: "500",
            qualifiedExpenses: "6000",
          },
        ],
      };

      const result = calculateFederalTax(savingsBondFixture);
      const { filledForms } = await fillReturn(savingsBondFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_8815_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 8815 reference summary when savings bond redemptions do not produce an exclusion claim", async () => {
    const outputDir = await makeOutputDir();

    try {
      const noExclusionFixture = {
        ...simpleW2Fixture,
        w2s: [{ ...simpleW2Fixture.w2s[0], wages: "130000", federalWithheld: "22000" }],
        savingsBondRedemptions: [
          {
            proceeds: "10000",
            interest: "500",
            qualifiedExpenses: "6000",
          },
        ],
      };

      const result = calculateFederalTax(noExclusionFixture);
      const { filledForms } = await fillReturn(noExclusionFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(result.form8815?.excludableSavingsBondInterest.toString()).toBe("0");
      expect(filledForms.some((path) => path.endsWith(FORM_8815_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
