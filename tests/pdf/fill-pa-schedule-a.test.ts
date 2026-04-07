/**
 * Spec: spec/state/pa-schedule-a.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleAReferenceSummary,
  PA_SCHEDULE_A_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-a.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-a-"));
}

function makePennsylvaniaResidentReturn(interestIncome: string) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      address: {
        ...simpleW2Fixture.taxpayer.address,
        state: "PA",
      },
    },
    w2s: simpleW2Fixture.w2s.map((w2) => ({
      ...w2,
      state: "PA",
      stateWages: "85000",
      stateTaxWithheld: "2610",
    })),
    form1099Int: [
      {
        payer: "Keystone Bank",
        interestIncome,
        federalWithheld: "0",
        earlyWithdrawalPenalty: "0",
        usSavingsBondInterest: "0",
        taxExemptInterest: "0",
      },
    ],
  });
}

describe("Pennsylvania Schedule A packet reference summary", () => {
  it("buildPAScheduleAReferenceSummary keeps the packet artifact reference-only for supported resident interest-income adjustments", () => {
    const input = TaxYearInputSchema.parse({
      ...makePennsylvaniaResidentReturn("3000"),
      paResidentReturn: {
        scheduleA: {
          reductionAdjustments: [
            {
              description: "Nominee interest already reported elsewhere",
              amount: "125",
            },
          ],
        },
      },
    });

    const paResult = calculatePAReturn(input);
    const summary = buildPAScheduleAReferenceSummary(paResult.scheduleA!);

    expect(summary.title).toBe("Pennsylvania Schedule A Interest Income Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Line 1 federal taxable interest income",
      value: "3000",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 8 other reduction adjustments",
      value: "125",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 16 PA-taxable interest income",
      value: "2875",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule A reference summary when the resident return meets the official filing trigger", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturn("3000");
      const federalResult = calculateFederalTax(taxInput);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania: calculatePAReturn(taxInput),
        },
      };

      const { filledForms } = await fillReturn(taxInput, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_A_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule A reference summary when the official filing trigger is not met", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturn("2500");
      const federalResult = calculateFederalTax(taxInput);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania: calculatePAReturn(taxInput),
        },
      };

      const { filledForms } = await fillReturn(taxInput, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_A_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
