/**
 * Spec: spec/federal/form-6198.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm6198ReferenceSummary,
  FORM_6198_REFERENCE_FILENAME,
} from "@/pdf/fill-form-6198.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-6198-"));
}

const atRiskFixture = {
  ...simpleW2Fixture,
  scheduleK1: [
    {
      partnershipName: "Loss Fund LP",
      partnershipEIN: "12-3456789",
      ordinaryIncome: "-40000",
      guaranteedPayments: "0",
      netShortTermCapitalGain: "0",
      netLongTermCapitalGain: "0",
      interestIncome: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      selfEmploymentEarnings: "0",
      isPassiveActivity: true,
      netRentalIncome: "0",
      otherNetRentalIncome: "0",
      royalties: "0",
      section1231Gain: "0",
      otherIncome: "0",
      section179Deduction: "0",
      otherDeductions: "0",
      form6198: {
        activityName: "Loss Fund LP",
        ordinaryIncome: "-40000",
        gainLossFromDispositions: "0",
        otherIncomeGains: "0",
        otherDeductionsLosses: "0",
        adjustedBasisAtEffectiveDate: "0",
        currentYearIncreases: "10000",
        currentYearDecreases: "5000",
        priorYearAmountAtRisk: "15000",
      },
    },
  ],
};

describe("Form 6198 packet reference summary", () => {
  it("buildForm6198ReferenceSummary keeps the packet artifact reference-only and limited to supported at-risk outputs", () => {
    const summary = buildForm6198ReferenceSummary(atRiskFixture);

    expect(summary.title).toBe("Form 6198 At-Risk Limitation Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.sections).toHaveLength(1);
    expect(summary.sections[0]).toMatchObject({
      activityName: "Loss Fund LP",
      partnershipName: "Loss Fund LP",
      partnershipEIN: "12-3456789",
    });
    expect(summary.sections[0]?.lines.map((line) => line.line)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "9",
      "10a",
      "10b",
      "20",
      "21",
      "suspended",
    ]);
    expect(summary.sections[0]?.lines.map((line) => line.value)).toEqual([
      "-40000",
      "0",
      "0",
      "0",
      "-40000",
      "0",
      "10000",
      "5000",
      "15000",
      "20000",
      "20000",
      "20000",
      "20000",
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Activities with supported Form 6198 inputs",
        value: "1",
      },
      {
        label: "Total deductible loss allowed this year",
        value: "20000",
      },
      {
        label: "Total suspended at-risk loss carryforward",
        value: "20000",
      },
      {
        label: "Total recapture income",
        value: "0",
      },
    ]);
  });

  it.each([["included", true], ["omitted", false]] as const)("fillReturn includes the Form 6198 reference summary only when supported Schedule K-1 at-risk inputs are present: %s", async (_scenario, included) => {
    const input = included ? atRiskFixture : simpleW2Fixture;
    const outputDir = await makeOutputDir();
    try {
      const result = calculateFederalTax(input);
      const packet = await fillReturn(input, result, { blankFormsDir: "forms/blank", outputDir });

      if (included) {
        const referencePath = packet.filledForms.find((path) => path.endsWith(FORM_6198_REFERENCE_FILENAME));
        expect(referencePath).toBeDefined();
        await access(referencePath!);
        const pdfBytes = await readFile(referencePath!);
        expect(pdfBytes.length).toBeGreaterThan(0);
      } else {
        expect(packet.filledForms.some((path) => path.endsWith(FORM_6198_REFERENCE_FILENAME))).toBe(false);
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
