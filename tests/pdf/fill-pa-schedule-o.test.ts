/**
 * Spec: spec/state/pa-schedule-o.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleOReferenceSummary,
  PA_SCHEDULE_O_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-o.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-o-"));
}

function makePennsylvaniaResidentReturnWithScheduleO({
  qualifiedTuitionContribution = "3000",
  healthSavingsAccountDeduction = "1200",
}: {
  qualifiedTuitionContribution?: string;
  healthSavingsAccountDeduction?: string;
} = {}) {
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
    paResidentReturn: {
      scheduleO: {
        qualifiedTuitionContributions: qualifiedTuitionContribution === "0"
          ? undefined
          : [
            {
              beneficiaryName: "Taylor Northwind",
              beneficiarySSN: "111-22-3333",
              taxpayerContribution: qualifiedTuitionContribution,
            },
          ],
        healthSavingsAccountDeduction,
        taxpayerPATaxableIncome: "85000",
      },
    },
  });
}

describe("Pennsylvania Schedule O packet reference summary", () => {
  it("buildPAScheduleOReferenceSummary keeps the packet artifact reference-only for supported resident other deductions", () => {
    const input = makePennsylvaniaResidentReturnWithScheduleO();

    const paResult = calculatePAReturn(input);
    const summary = buildPAScheduleOReferenceSummary(paResult.scheduleO!);

    expect(summary.title).toBe("Pennsylvania Schedule O Other Deductions Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Line 2 total IRC Section 529 contributions",
      value: "3000",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 6 health savings account deduction",
      value: "1200",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 11 total other deductions",
      value: "4200",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule O reference summary when the official filing trigger is met", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithScheduleO();
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_O_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule O reference summary when the official filing trigger is not met", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithScheduleO({
        qualifiedTuitionContribution: "0",
        healthSavingsAccountDeduction: "0",
      });
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_O_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
