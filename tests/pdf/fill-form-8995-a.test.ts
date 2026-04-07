/**
 * Spec: spec/federal/form-8995-a.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm8995A } from "@/engine/forms/form-8995-a.js";
import {
  buildForm8995AReferenceSummary,
  FORM_8995_A_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8995-a.js";
import { fillReturn } from "@/pdf/fill-return.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const d = (value: number | string) => new Decimal(value);

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8995a-"));
}

const form8995AFixture: TaxYearInput = {
  ...simpleW2Fixture,
  w2s: [
    {
      employer: { name: "Enterprise Software Inc", ein: "12-3456789" },
      wages: "250000",
      federalWithheld: "45000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
      medicareWages: "250000",
      medicareWithheld: "3625",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "WA",
    },
  ],
  scheduleC: {
    businessName: "Doe Advisory",
    grossReceipts: "80000",
    otherIncome: "0",
    advertising: "0",
    insurance: "0",
    officeExpense: "0",
    supplies: "0",
    otherExpenses: "0",
    w2WagesPaid: "60000",
    ubiaQualifiedProperty: "0",
  },
};

describe("Form 8995-A packet reference summary", () => {
  it("buildForm8995AReferenceSummary keeps the packet artifact reference-only and limited to supported Form 8995-A outputs", () => {
    const result = calculateForm8995A({
      qbiSources: [
        {
          name: "Rental A",
          qbi: d(100000),
          w2Wages: d(40000),
          ubia: d(200000),
          isSST: false,
        },
        {
          name: "Rental B",
          qbi: d(50000),
          w2Wages: d(10000),
          ubia: d(100000),
          isSST: false,
        },
      ],
      ptpSources: [
        {
          name: "Pipeline PTP",
          qbi: d(20000),
          w2Wages: d(5000),
          ubia: d(0),
          isSST: false,
        },
      ],
      qualifiedReitDividends: d(10000),
      aggregationElections: [
        {
          name: "Combined Rentals",
          componentBusinessNames: ["Rental A", "Rental B"],
        },
      ],
      patronageSources: [
        {
          cooperativeName: "Farm Coop",
          qbiAllocableToQualifiedPayments: d(10000),
          w2WagesAllocableToQualifiedPayments: d(1000),
          cooperativeDPAD: d(800),
        },
      ],
      taxableIncomeBeforeQBI: d(300000),
      netCapitalGain: d(20000),
      qualifiedDividends: d(5000),
      simplifiedThreshold: d(197300),
      phaseInRange: d(50000),
    });

    const summary = buildForm8995AReferenceSummary(result);

    expect(summary.title).toBe("Form 8995-A QBI Deduction Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.businesses).toEqual([
      {
        category: "Trade or business",
        name: "Combined Rentals",
        isSST: false,
        line1QBI: "150000",
        line3W2Wages: "50000",
        line5UBIA: "300000",
        line9W2UBIALimit: "25000",
        line15QBIComponent: "25000",
      },
    ]);
    expect(summary.ptpBusinesses).toEqual([
      {
        category: "Qualified PTP",
        name: "Pipeline PTP",
        isSST: false,
        line1QBI: "20000",
        line3W2Wages: "5000",
        line5UBIA: "0",
        line9W2UBIALimit: "2500",
        line15QBIComponent: "2500",
      },
    ]);
    expect(summary.aggregationGroups).toEqual([
      {
        name: "Combined Rentals",
        componentBusinessNames: ["Rental A", "Rental B"],
        combinedQBI: "150000",
        combinedW2Wages: "50000",
        combinedUBIA: "300000",
      },
    ]);
    expect(summary.patronageResults).toEqual([
      {
        cooperativeName: "Farm Coop",
        qbiAllocable: "10000",
        ninePercentQBI: "900",
        w2WagesAllocable: "1000",
        fiftyPercentW2: "500",
        patronReduction: "500",
        cooperativeDPAD: "800",
      },
    ]);
    expect(summary.overallLines).toEqual([
      { line: "phase-in", description: "Phase-in percentage", value: "1" },
      { line: "16", description: "Total QBI component", value: "25000" },
      { line: "17", description: "Qualified REIT dividends", value: "10000" },
      { line: "32", description: "Total REIT and PTP component", value: "4500" },
      { line: "33", description: "Taxable income before QBI", value: "300000" },
      { line: "34", description: "Net capital gain", value: "25000" },
      { line: "35", description: "Income limitation", value: "55000" },
      { line: "36", description: "Combined QBI, REIT, and PTP", value: "29500" },
      { line: "37", description: "QBI deduction before DPAD", value: "29000" },
      { line: "38", description: "Section 199A(g) DPAD from cooperatives", value: "800" },
      { line: "39", description: "Section 199A deduction", value: "29800" },
      { line: "40", description: "QBI loss carryforward", value: "0" },
    ]);
    expect(summary.totals).toEqual([
      { label: "Allowed section 199A deduction", value: "29800" },
      { label: "Tracked QBI loss carryforward", value: "0" },
    ]);
  });

  it("fillReturn includes a Form 8995-A reference summary when detailed QBI computation is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(form8995AFixture);
      expect(result.form8995A).toBeDefined();

      const { filledForms } = await fillReturn(form8995AFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_8995_A_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 8995-A reference summary when only the simplified Form 8995 path applies", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_8995_A_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
