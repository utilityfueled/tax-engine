/**
 * Spec: spec/federal/form-2555.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm2555ReferenceSummary,
  FORM_2555_REFERENCE_FILENAME,
} from "@/pdf/fill-form-2555.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-2555-"));
}

describe("Form 2555 packet reference summary", () => {
  it("fillForm2555Reference keeps the packet artifact reference-only and limited to supported exclusion outputs", () => {
    const foreignEarnedIncomeFixture = {
      ...simpleW2Fixture,
      form2555: {
        foreignEarnedIncome: "90000",
        qualifyingDays: 365,
        totalDaysInYear: 365,
        qualifiedHousingExpenses: "30000",
        employerProvidedHousingAmount: "5000",
        isSelfEmployed: false,
      },
    };

    const result = calculateFederalTax(foreignEarnedIncomeFixture);
    const summary = buildForm2555ReferenceSummary(result.form2555!);

    expect(summary.title).toBe("Form 2555 Foreign Earned Income Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.lines.map((line) => line.line)).toEqual([
      "19-24",
      "27",
      "29",
      "28-30",
      "42",
      "43",
      "43-45 (Part VIII)",
      "44-45",
      "total",
    ]);
    expect(summary.lines.map((line) => line.value)).toEqual([
      "90000",
      "20800",
      "39000",
      "9200",
      "130000",
      "130000",
      "4200",
      "85800",
      "90000",
    ]);
  });

  it("fillReturn includes a Form 2555 reference summary when exclusion inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const foreignEarnedIncomeFixture = {
        ...simpleW2Fixture,
        form2555: {
          foreignEarnedIncome: "90000",
          qualifyingDays: 365,
          totalDaysInYear: 365,
          qualifiedHousingExpenses: "30000",
          employerProvidedHousingAmount: "5000",
          isSelfEmployed: false,
        },
      };

      const result = calculateFederalTax(foreignEarnedIncomeFixture);
      const { filledForms } = await fillReturn(foreignEarnedIncomeFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_2555_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 2555 reference summary when no exclusion inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_2555_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
