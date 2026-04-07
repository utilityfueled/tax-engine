/**
 * Spec: spec/federal/partner-basis-schedule.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildPartnerBasisScheduleReferenceSummary,
  PARTNER_BASIS_SCHEDULE_REFERENCE_FILENAME,
} from "@/pdf/fill-partner-basis-schedule.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-partner-basis-"));
}

const basisFixture = {
  ...simpleW2Fixture,
  scheduleK1: [
    {
      partnershipName: "Alpha LP",
      partnershipEIN: "11-1111111",
      ordinaryIncome: "-18000",
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
      otherIncome: "5000",
      section179Deduction: "0",
      otherDeductions: "0",
      taxExemptInterest: "1000",
      otherTaxExemptIncome: "0",
      nondeductibleExpenses: "500",
      distributions: "3000",
      beginningBasis: "10000",
    },
  ],
};

describe("Partner basis schedule packet reference summary", () => {
  it("buildPartnerBasisScheduleReferenceSummary keeps the packet artifact reference-only and limited to supported basis outputs", () => {
    const summary = buildPartnerBasisScheduleReferenceSummary(calculateFederalTax(basisFixture));

    expect(summary.title).toBe("Partner/Shareholder Basis Schedule Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.sections).toHaveLength(1);
    expect(summary.sections[0]).toMatchObject({
      entityName: "Alpha LP",
      entityEin: "11-1111111",
      entityType: "partnership",
    });
    expect(summary.sections[0]?.lines.map((line) => line.line)).toEqual([
      "1",
      "income",
      "basis-before-decreases",
      "distributions",
      "basis-after-distributions",
      "nondeductible",
      "basis-after-nondeductible",
      "total-losses",
      "total-allowed",
      "total-suspended",
      "ending-basis",
    ]);
    expect(summary.sections[0]?.lines.map((line) => line.value)).toEqual([
      "10000",
      "6000",
      "16000",
      "3000",
      "13000",
      "500",
      "12500",
      "18000",
      "12500",
      "5500",
      "0",
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Supported basis schedules",
        value: "1",
      },
      {
        label: "Total ending basis",
        value: "0",
      },
      {
        label: "Total suspended basis losses",
        value: "5500",
      },
      {
        label: "Total excess distribution gain",
        value: "0",
      },
    ]);
  });

  it("fillReturn includes the partner basis reference summary only when supported Schedule K-1 basis inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const basisResult = calculateFederalTax(basisFixture);
      const included = await fillReturn(basisFixture, basisResult, {
        blankFormsDir: "forms/blank",
        outputDir,
      });
      const referencePath = included.filledForms.find((path) =>
        path.endsWith(PARTNER_BASIS_SCHEDULE_REFERENCE_FILENAME),
      );

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);

      const simpleResult = calculateFederalTax(simpleW2Fixture);
      const omitted = await fillReturn(simpleW2Fixture, simpleResult, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(
        omitted.filledForms.some((path) => path.endsWith(PARTNER_BASIS_SCHEDULE_REFERENCE_FILENAME)),
      ).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
