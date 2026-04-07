/**
 * Spec: spec/federal/form-3800.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm3800 } from "@/engine/forms/form-3800.js";
import {
  buildForm3800ReferenceSummary,
  FORM_3800_REFERENCE_FILENAME,
} from "@/pdf/fill-form-3800.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const d = (value: number | string) => new Decimal(value);

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-3800-"));
}

describe("Form 3800 packet reference summary", () => {
  it("buildForm3800ReferenceSummary keeps the packet artifact reference-only and limited to supported Form 3800 outputs", () => {
    const summary = buildForm3800ReferenceSummary(calculateForm3800({
      filingStatus: "single",
      scheduleK1s: [
        {
          partnershipName: "Research Ventures LP",
          partnershipEIN: "12-3456789",
          ordinaryIncome: "0",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          guaranteedPayments: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          royalties: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          unrecapturedSection1250Gain: "0",
          collectiblesGain: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
          charitableCash: "0",
          charitableCapitalGain30: "0",
          charitableCapitalGain20: "0",
          excessBusinessInterest: "0",
          selfEmploymentEarnings: "0",
          foreignTaxPaid: "0",
          amtDepreciationAdjustment: "0",
          amtAdjustedGainOrLoss: "0",
          amtDepletion: "0",
          amtOtherItems: "0",
          taxExemptInterest: "0",
          otherTaxExemptIncome: "0",
          nondeductibleExpenses: "0",
          distributions: "0",
          section199AQBI: "0",
          section199AW2Wages: "0",
          section199AUBIA: "0",
          section199AIsSST: false,
          section199AQualifiedReitDividends: "0",
          section199AQualifiedPTPIncome: "0",
          section199APTPW2Wages: "0",
          section199APTPUBIA: "0",
          section199APTPIsSST: false,
          lowIncomeHousingCredit42j5: "0",
          lowIncomeHousingCreditOther: "0",
          qualifiedRehabilitationExpenditures: "0",
          otherRentalRealEstateCredits: "0",
          otherRentalCredits: "0",
          otherCredits: "20000",
          isPassiveActivity: false,
          isForeignPartnership: false,
        },
      ],
      currentYearCredits: d(10000),
      passiveActivityCredits: d(5000),
      carryforward: d(5000),
      regularTax: d(30000),
      amt: d(0),
      tentativeMinimumTax: d(0),
      childTaxCredit: d(0),
      otherNonrefundableCredits: d(0),
    }));

    expect(summary.title).toBe("Form 3800 General Business Credit Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.lines.map((line) => line.line)).toEqual([
      "K-1 Box 15",
      "Part I Line 1",
      "Part I Line 2",
      "Part I Line 3",
      "Part I Line 5",
      "Part II Line 14",
      "Part II Line 15",
      "Part II Line 16",
      "Part II Line 17",
      "Part II Line 18",
      "Part II Line 19",
      "Part II Line 20",
      "Part II Line 21",
      "Carryforward",
    ]);
    expect(summary.lines.map((line) => line.value)).toEqual([
      "20000",
      "30000",
      "5000",
      "5000",
      "40000",
      "0",
      "30000",
      "1250",
      "0",
      "1250",
      "30000",
      "28750",
      "28750",
      "11250",
    ]);
    expect(summary.totals).toEqual([
      {
        label: "K-1 Box 15 credits",
        value: "20000",
      },
      {
        label: "Direct current-year credits",
        value: "10000",
      },
      {
        label: "Passive activity credits allowed",
        value: "5000",
      },
      {
        label: "Prior-year carryforward applied",
        value: "5000",
      },
      {
        label: "Allowable Schedule 3 Line 6a credit",
        value: "28750",
      },
      {
        label: "Unused credit carried forward",
        value: "11250",
      },
    ]);
  });

  it("fillReturn includes a Form 3800 reference summary when general business credit inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const generalBusinessCreditFixture = {
        ...simpleW2Fixture,
        form3800: {
          currentYearCredits: "2500",
          passiveActivityCredits: "0",
          carryforward: "0",
        },
      };

      const result = calculateFederalTax(generalBusinessCreditFixture);
      const { filledForms } = await fillReturn(generalBusinessCreditFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_3800_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 3800 reference summary when no general business credit inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_3800_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
