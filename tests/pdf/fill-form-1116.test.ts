/**
 * Spec: spec/federal/form-1116.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm1116ReferenceSummary,
  FORM_1116_REFERENCE_FILENAME,
} from "@/pdf/fill-form-1116.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-1116-"));
}

describe("Form 1116 packet reference summary", () => {
  it("buildForm1116ReferenceSummary keeps the packet artifact reference-only and limited to supported foreign tax credit outputs", () => {
    const foreignTaxCreditFixture = {
      ...simpleW2Fixture,
      form1099Div: [
        {
          payer: "Global Fund",
          ordinaryDividends: "2000",
          qualifiedDividends: "1000",
          totalCapitalGainDistributions: "0",
          federalWithheld: "0",
          foreignTaxPaid: "350",
          foreignCountry: "Various",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          exemptInterestDividends: "0",
        },
      ],
    };

    const result = calculateFederalTax(foreignTaxCreditFixture);
    const summary = buildForm1116ReferenceSummary(result);

    expect(summary.title).toBe("Form 1116 Foreign Tax Credit Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.sections).toEqual([
      {
        form: "Form 1116",
        lines: [
          {
            line: "simplified_eligible",
            description: "Simplified method eligible",
            value: "No",
            formula: "Foreign tax <= threshold and no disqualifying non-1099 foreign tax sources",
          },
          {
            line: "1a",
            description: "Foreign source taxable income",
            value: "2000",
            formula: "Gross foreign income by category",
          },
          {
            line: "3e",
            description: "Apportioned deductions",
            value: "362",
            formula: "$15750 x ($2000 / $87000)",
          },
          {
            line: "3f",
            description: "Net foreign source taxable income",
            value: "1638",
            formula: "Line 1a - Line 3e",
          },
          {
            line: "7",
            description: "Foreign taxes paid or accrued",
            value: "350",
            formula: "Sum of creditable foreign taxes (no carryforward)",
          },
          {
            line: "20",
            description: "Foreign tax credit limitation",
            value: "242",
            formula: "taxBeforeCredits x (foreign source / worldwide)",
          },
          {
            line: "21",
            description: "Foreign tax credit allowed",
            value: "242",
            formula: "min(Line 7, Line 20)",
          },
          {
            line: "carryforward",
            description: "Unused FTC carryforward",
            value: "108",
            formula: "Carryforward from 1 year(s): 2025: $108",
          },
        ],
      },
    ]);
  });

  it("fillReturn includes a Form 1116 reference summary when foreign tax activity exceeds the simplified-election threshold", async () => {
    const outputDir = await makeOutputDir();

    try {
      const foreignTaxCreditFixture = {
        ...simpleW2Fixture,
        form1099Div: [
          {
            payer: "Global Fund",
            ordinaryDividends: "2000",
            qualifiedDividends: "1000",
            totalCapitalGainDistributions: "0",
            federalWithheld: "0",
            foreignTaxPaid: "350",
            foreignCountry: "Various",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            exemptInterestDividends: "0",
          },
        ],
      };

      const result = calculateFederalTax(foreignTaxCreditFixture);
      const { filledForms } = await fillReturn(foreignTaxCreditFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_1116_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn includes a Form 1116 reference summary when prior-year carryforward requires Form 1116 even with no current-year foreign tax", async () => {
    const outputDir = await makeOutputDir();

    try {
      const carryforwardFixture = {
        ...simpleW2Fixture,
        priorYear: {
          foreignTaxCreditCarryforwardByYear: [
            {
              taxYear: 2024,
              amount: "120",
            },
          ],
        },
      };

      const result = calculateFederalTax(carryforwardFixture);
      const { filledForms } = await fillReturn(carryforwardFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_1116_REFERENCE_FILENAME))).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 1116 reference summary when the taxpayer qualifies for the no-form simplified election", async () => {
    const outputDir = await makeOutputDir();

    try {
      const simplifiedElectionFixture = {
        ...simpleW2Fixture,
        form1099Div: [
          {
            payer: "Global Fund",
            ordinaryDividends: "2000",
            qualifiedDividends: "1000",
            totalCapitalGainDistributions: "0",
            federalWithheld: "0",
            foreignTaxPaid: "150",
            foreignCountry: "Various",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            exemptInterestDividends: "0",
          },
        ],
      };

      const result = calculateFederalTax(simplifiedElectionFixture);
      const { filledForms } = await fillReturn(simplifiedElectionFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_1116_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
