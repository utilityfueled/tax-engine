/**
 * Spec: spec/federal/form-6252.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm6252ReferenceSummary,
  FORM_6252_REFERENCE_FILENAME,
} from "@/pdf/fill-form-6252.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-6252-"));
}

describe("Form 6252 packet reference summary", () => {
  it("buildForm6252ReferenceSummary keeps the packet artifact reference-only and limited to supported installment-sale outputs", () => {
    const summary = buildForm6252ReferenceSummary([
      {
        description: "Lake cabin note sale",
        propertyType: "other",
        gainCharacter: "long_term_capital",
        isYearOfSale: true,
        sellingPrice: "200000",
        assumedLiabilities: "0",
        costBasis: "120000",
        depreciation: "0",
        sellingExpenses: "0",
        depreciationRecapture: "0",
        section121Exclusion: "0",
        paymentsReceived: "40000",
        priorYearPayments: "0",
        remainingOrdinaryRecapture: "5000",
      },
    ]);

    expect(summary.title).toBe("Form 6252 Installment Sale Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.sales).toHaveLength(1);
    expect(summary.sales[0]?.lines.map((line) => line.line)).toEqual([
      "5",
      "10",
      "13",
      "16",
      "18",
      "19",
      "20",
      "21",
      "22",
      "23",
      "24",
      "25",
      "26",
    ]);
    expect(summary.sales[0]?.lines.map((line) => line.value)).toEqual([
      "200000",
      "120000",
      "120000",
      "80000",
      "200000",
      "0.4",
      "0",
      "40000",
      "40000",
      "0",
      "16000",
      "5000",
      "11000",
    ]);
    expect(summary.aggregateTotals).toEqual([
      { label: "Short-term capital gain routed from supported sales", value: "0" },
      { label: "Long-term capital gain routed from supported sales", value: "11000" },
      { label: "Section 1231 gain routed from supported sales", value: "0" },
      { label: "Ordinary income routed from supported sales", value: "5000" },
      { label: "Year-of-sale depreciation recapture already recognized elsewhere", value: "0" },
    ]);
  });

  it("fillReturn includes a Form 6252 reference summary when current-year installment-sale filing data is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const installmentSaleFixture = {
        ...simpleW2Fixture,
        form6252: [
          {
            description: "Lake cabin note sale",
            propertyType: "other" as const,
            gainCharacter: "long_term_capital" as const,
            isYearOfSale: true,
            sellingPrice: "200000",
            assumedLiabilities: "0",
            costBasis: "120000",
            depreciation: "0",
            sellingExpenses: "0",
            depreciationRecapture: "0",
            section121Exclusion: "0",
            paymentsReceived: "40000",
            priorYearPayments: "0",
            remainingOrdinaryRecapture: "5000",
          },
        ],
      };

      const result = calculateFederalTax(installmentSaleFixture);
      const { filledForms } = await fillReturn(installmentSaleFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_6252_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 6252 reference summary when a carryforward sale has no current-year filing effect", async () => {
    const outputDir = await makeOutputDir();

    try {
      const dormantInstallmentSaleFixture = {
        ...simpleW2Fixture,
        form6252: [
          {
            description: "Dormant seller note",
            propertyType: "other" as const,
            gainCharacter: "long_term_capital" as const,
            isYearOfSale: false,
            sellingPrice: "150000",
            assumedLiabilities: "0",
            costBasis: "90000",
            depreciation: "0",
            sellingExpenses: "0",
            depreciationRecapture: "0",
            section121Exclusion: "0",
            paymentsReceived: "0",
            priorYearPayments: "30000",
            remainingOrdinaryRecapture: "0",
          },
        ],
      };

      const result = calculateFederalTax(dormantInstallmentSaleFixture);
      const { filledForms } = await fillReturn(dormantInstallmentSaleFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_6252_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
