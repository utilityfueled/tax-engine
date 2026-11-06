/**
 * Spec: spec/federal/taxable-refund-worksheet.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildTaxableRefundWorksheetReferenceSummary,
  TAXABLE_REFUND_WORKSHEET_REFERENCE_FILENAME,
} from "@/pdf/fill-taxable-refund-worksheet.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-taxable-refund-"));
}

describe("Taxable Refund Worksheet packet reference summary", () => {
  it("buildTaxableRefundWorksheetReferenceSummary keeps the packet artifact reference-only and limited to supported prior-year refund inputs", () => {
    const taxableRefundFixture = {
      ...simpleW2Fixture,
      form1099G: [
        {
          payer: "Oregon Department of Revenue",
          unemploymentCompensation: "0",
          stateLocalIncomeTaxRefund: "2500",
          refundTaxYear: 2024,
        },
        {
          payer: "Multnomah County Revenue Division",
          unemploymentCompensation: "0",
          stateLocalIncomeTaxRefund: "500",
          refundTaxYear: 2024,
        },
      ],
      taxableRefundWorksheet: {
        priorTaxYear: 2024,
        priorYearPropertyTaxesPaid: "0",
        priorYearItemized: true,
        priorYearItemizedTotal: "20000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "11000",
        priorYearAlternativeGeneralSalesTaxDeduction: "8500",
        priorYearFilingStatus: "single",
      },
    };

    const result = calculateFederalTax(taxableRefundFixture);
    const summary = buildTaxableRefundWorksheetReferenceSummary(
      taxableRefundFixture.form1099G,
      taxableRefundFixture.taxableRefundWorksheet,
      result.taxableRefundWorksheet!,
    );

    expect(summary.title).toBe("Taxable Refund Worksheet Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.sections).toEqual([
      {
        heading: "Refund inputs",
        lines: [
          {
            line: "1099-G #1",
            description: "Oregon Department of Revenue Box 2 state/local income tax refund for tax year 2024",
            value: "2500",
            formula: "Supported Form 1099-G Box 2 amount included in Worksheet Line 1.",
          },
          {
            line: "1099-G #2",
            description: "Multnomah County Revenue Division Box 2 state/local income tax refund for tax year 2024",
            value: "500",
            formula: "Supported Form 1099-G Box 2 amount included in Worksheet Line 1.",
          },
        ],
      },
      {
        heading: "Prior-year comparison inputs",
        lines: [
          {
            line: "itemized",
            description: "Prior-year return itemized deductions",
            value: "Yes",
            formula: "Provided by taxableRefundWorksheet.priorYearItemized.",
          },
          {
            line: "status",
            description: "Prior-year filing status",
            value: "Single",
            formula: "Provided by taxableRefundWorksheet.priorYearFilingStatus.",
          },
          {
            line: "sched-a",
            description: "Prior-year Schedule A Line 17 itemized deductions",
            value: "20000",
            formula: "Provided by taxableRefundWorksheet.priorYearItemizedTotal.",
          },
          {
            line: "std",
            description: "Prior-year Form 1040 Line 12a standard deduction",
            value: "14600",
            formula: "Provided by taxableRefundWorksheet.priorYearStandardDeduction.",
          },
          {
            line: "salt-paid",
            description: "Prior-year state and local income taxes paid before the SALT cap",
            value: "11000",
            formula: "Provided by taxableRefundWorksheet.priorYearStateLocalTaxesPaid.",
          },
          {
            line: "sales-tax-alt",
            description: "Prior-year alternative general sales tax deduction",
            value: "8500",
            formula: "Provided by taxableRefundWorksheet.priorYearAlternativeGeneralSalesTaxDeduction.",
          },
        ],
      },
      {
        heading: "Taxable Refund Worksheet",
        lines: [
          {
            line: "1",
            description: "Total state/local income tax refunds",
            value: "3000",
            formula: "Sum of 2 Form 1099-G Box 2 amount(s)",
          },
          {
            line: "2",
            description: "Prior-year standard deduction",
            value: "14600",
            formula: "Prior-year Form 1040 Line 12a",
          },
          {
            line: "3",
            description: "Prior-year itemized?",
            value: "1",
            formula: "Yes — continue to Line 4",
          },
          {
            line: "4",
            description: "Prior-year total itemized deductions",
            value: "20000",
            formula: "Prior-year Schedule A Line 17",
          },
          {
            line: "6",
            description: "Excess of itemized over standard deduction",
            value: "5400",
            formula: "20000 - 14600",
          },
          {
            line: "7",
            description: "Tax benefit amount",
            value: "3000",
            formula: "min(refund 3000, excess 5400)",
          },
          {
            line: "8",
            description: "State/local income taxes paid (before cap)",
            value: "11000",
            formula: "Total state/local income taxes actually paid in prior year",
          },
          {
            line: "9",
            description: "SALT deduction cap",
            value: "10000",
            formula: "Origin tax year 2024, filing status single; IRC §164(b)(6)",
          },
          {
            line: "10",
            description: "Excess of taxes paid over SALT cap",
            value: "1000",
            formula: "max(0, 11000 - 10000)",
          },
          {
            line: "11",
            description: "Refund from above-cap taxes (not taxable)",
            value: "1000",
            formula: "min(refund 3000, excess over cap 1000)",
          },
          {
            line: "12",
            description: "Refund that could have affected deduction",
            value: "2000",
            formula: "3000 - 1000",
          },
          {
            line: "13",
            description: "Taxable refund (with SALT cap adjustment)",
            value: "2000",
            formula: "min(tax benefit 3000, affecting deduction 2000)",
          },
          {
            line: "sales_tax_alt_cap",
            description: "Maximum taxable refund after alternative sales-tax comparison",
            value: "1500",
            formula: "max(0, chosen income-tax deduction - alternative sales-tax deduction)",
          },
          {
            line: "result",
            description: "Taxable refund",
            value: "1500",
            formula: "SALT cap adjustment applied; limited further by alternative sales-tax cap",
          },
        ],
      },
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Total Form 1099-G Box 2 refunds",
        value: "3000",
      },
      {
        label: "Tax benefit amount before SALT-cap adjustments",
        value: "3000",
      },
      {
        label: "Excess over SALT cap",
        value: "1000",
      },
      {
        label: "Alternative sales-tax comparison cap",
        value: "1500",
      },
      {
        label: "Schedule 1 Line 1 taxable refund",
        value: "1500",
      },
      {
        label: "SALT cap adjustment applied",
        value: "Yes",
      },
      {
        label: "Alternative sales-tax cap applied",
        value: "Yes",
      },
    ]);
  });

  it("fillReturn includes the taxable-refund worksheet reference summary when the worksheet input is provided", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxableRefundFixture = {
        ...simpleW2Fixture,
        form1099G: [
          {
            payer: "Oregon Department of Revenue",
            unemploymentCompensation: "0",
            stateLocalIncomeTaxRefund: "3000",
            refundTaxYear: 2024,
          },
        ],
        taxableRefundWorksheet: {
        priorTaxYear: 2024,
        priorYearPropertyTaxesPaid: "0",
          priorYearItemized: true,
          priorYearItemizedTotal: "20000",
          priorYearStandardDeduction: "14600",
          priorYearStateLocalTaxesPaid: "11000",
          priorYearAlternativeGeneralSalesTaxDeduction: "8500",
          priorYearFilingStatus: "single",
        },
      };

      const result = calculateFederalTax(taxableRefundFixture);
      const { filledForms } = await fillReturn(taxableRefundFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) =>
        path.endsWith(TAXABLE_REFUND_WORKSHEET_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the taxable-refund worksheet reference summary when the worksheet input is absent", async () => {
    const outputDir = await makeOutputDir();

    try {
      const unsupportedRefundFixture = {
        ...simpleW2Fixture,
        form1099G: [
          {
            payer: "Oregon Department of Revenue",
            unemploymentCompensation: "0",
            stateLocalIncomeTaxRefund: "3000",
            refundTaxYear: 2024,
          },
        ],
      };

      const result = calculateFederalTax(unsupportedRefundFixture);
      const { filledForms } = await fillReturn(unsupportedRefundFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) =>
        path.endsWith(TAXABLE_REFUND_WORKSHEET_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
