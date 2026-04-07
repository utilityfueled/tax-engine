/**
 * Spec: spec/federal/form-3903.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm3903ReferenceSummary,
  FORM_3903_REFERENCE_FILENAME,
} from "@/pdf/fill-form-3903.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-3903-"));
}

describe("Form 3903 packet reference summary", () => {
  it("buildForm3903ReferenceSummary keeps the packet artifact reference-only and limited to supported military moving-expense outputs", () => {
    const movingExpenseFixture = {
      ...simpleW2Fixture,
      form3903: {
        military: true as const,
        moves: [
          {
            transportationAndStorage: "5000",
            travelAndLodging: "2000",
            reimbursementsExcludedFromIncome: "1000",
          },
          {
            transportationAndStorage: "1200",
            travelAndLodging: "300",
            reimbursementsExcludedFromIncome: "0",
          },
        ],
      },
    };

    const summary = buildForm3903ReferenceSummary(movingExpenseFixture.form3903);

    expect(summary.title).toBe("Form 3903 Moving Expenses Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.moveCount).toBe(2);
    expect(summary.moves).toEqual([
      {
        moveNumber: 1,
        line1TransportationAndStorage: "5000",
        line2TravelAndLodging: "2000",
        line3TotalExpenses: "7000",
        line4ExcludedReimbursements: "1000",
        line5DeductibleAmount: "6000",
      },
      {
        moveNumber: 2,
        line1TransportationAndStorage: "1200",
        line2TravelAndLodging: "300",
        line3TotalExpenses: "1500",
        line4ExcludedReimbursements: "0",
        line5DeductibleAmount: "1500",
      },
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Military eligibility indicator",
        value: "Active-duty Armed Forces PCS move supplied",
      },
      {
        label: "Schedule 1 Line 14 deduction",
        value: "7500",
      },
    ]);
  });

  it("fillReturn includes a Form 3903 reference summary when supported military moving-expense inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const movingExpenseFixture = {
        ...simpleW2Fixture,
        form3903: {
          military: true as const,
          moves: [
            {
              transportationAndStorage: "5000",
              travelAndLodging: "2000",
              reimbursementsExcludedFromIncome: "1000",
            },
          ],
        },
      };

      const result = calculateFederalTax(movingExpenseFixture);
      const { filledForms } = await fillReturn(movingExpenseFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_3903_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 3903 reference summary when only a manual Schedule 1 Line 14 adjustment is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const manualOnlyFixture = {
        ...simpleW2Fixture,
        adjustments: {
          armedForcesMovingExpenses: "3000",
        },
      };

      const result = calculateFederalTax(manualOnlyFixture);
      const { filledForms } = await fillReturn(manualOnlyFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_3903_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
