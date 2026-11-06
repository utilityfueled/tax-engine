/**
 * Spec: spec/federal/form-8829.yaml
 */

import { access, mkdtemp, rm } from "fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { Form8829Input } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm8829ReferenceSummary,
  FORM_8829_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8829.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8829-"));
}

function extractPdfText(pdfPath: string) {
  return execFileSync(
    process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3",
    [
      "-c",
      `
from pypdf import PdfReader
reader = PdfReader(r"${pdfPath}")
print("\\n".join((page.extract_text() or "") for page in reader.pages))
`,
    ],
    { encoding: "utf8" },
  );
}

function makeForm8829Input(overrides: Partial<Form8829Input> = {}): Form8829Input {
  return {
    areaUsedForBusiness: 250,
    totalAreaOfHome: 1000,
    grossIncomeLimit: "300",
    indirectExpenses: {
      deductibleMortgageInterest: "400",
      insurance: "800",
      utilities: "200",
    },
    directExpenses: {
      realEstateTaxes: "50",
    },
    priorYearOperatingExpensesCarryover: "20",
    excessCasualtyLosses: "40",
    priorYearExcessCasualtyLossesCarryover: "15",
    priorYearDepreciationCarryover: "7",
    adjustedBasisOrFairMarketValue: "20000",
    landValue: "4000",
    depreciationPercentage: "0.02564",
    ...overrides,
  };
}

describe("Form 8829 packet reference summary", () => {
  it("buildForm8829ReferenceSummary keeps the packet artifact reference-only and limited to supported actual-expense home-office outputs", () => {
    const summary = buildForm8829ReferenceSummary(makeForm8829Input());

    expect(summary.title).toBe("Form 8829 Home Office Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.lines.map(({ line, value }) => ({ line, value }))).toEqual([
      { line: "1", value: "250" },
      { line: "2", value: "1000" },
      { line: "3", value: "0.25" },
      { line: "7", value: "0.25" },
      { line: "8", value: "300" },
      { line: "14", value: "150" },
      { line: "15", value: "150" },
      { line: "24", value: "250" },
      { line: "27", value: "150" },
      { line: "29", value: "10" },
      { line: "30", value: "103" },
      { line: "31", value: "22" },
      { line: "32", value: "135" },
      { line: "33", value: "0" },
      { line: "35", value: "0" },
      { line: "36", value: "300" },
      { line: "42", value: "103" },
      { line: "43", value: "120" },
      { line: "44", value: "135" },
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Schedule C Line 30 home-office deduction",
        value: "300",
      },
      {
        label: "Operating-expense carryover to next year",
        value: "120",
      },
      {
        label: "Casualty and depreciation carryover to next year",
        value: "135",
      },
    ]);
  });

  it("fillReturn includes a Form 8829 reference summary when actual-method home-office facts are supplied", async () => {
    const outputDir = await makeOutputDir();

    try {
      const homeOfficeFixture = {
        ...simpleW2Fixture,
        scheduleC: {
          businessName: "Studio Ledger",
          grossReceipts: "20000",
          expenses: {
            supplies: "2000",
            utilities: "500",
          },
          homeOffice: {
            method: "actual" as const,
            form8829: {
              areaUsedForBusiness: 200,
              totalAreaOfHome: 1000,
              indirectExpenses: {
                insurance: "2400",
                utilities: "1200",
                otherExpenses: "600",
              },
            },
          },
        },
      };

      const result = calculateFederalTax(homeOfficeFixture);
      const { filledForms } = await fillReturn(homeOfficeFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_8829_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);

      const pdfText = extractPdfText(referencePath!);

      expect(pdfText).toContain("Form 8829 Home Office Reference Summary");
      expect(pdfText).toContain("REFERENCE SUMMARY ONLY");
      expect(pdfText).toContain("Schedule C Line 30 home-office deduction: 840");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 8829 reference summary when Schedule C uses a manual actual home-office amount", async () => {
    const outputDir = await makeOutputDir();

    try {
      const manualOnlyFixture = {
        ...simpleW2Fixture,
        scheduleC: {
          businessName: "Manual Office LLC",
          grossReceipts: "20000",
          expenses: {
            supplies: "1000",
          },
          homeOffice: {
            method: "actual" as const,
            actualAmount: "500",
          },
        },
      };

      const result = calculateFederalTax(manualOnlyFixture);
      const { filledForms } = await fillReturn(manualOnlyFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_8829_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
