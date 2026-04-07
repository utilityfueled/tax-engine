/**
 * Spec: spec/state/pa-schedule-f.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAScheduleF } from "@/engine/state/pa-schedule-f.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleFReferenceSummary,
  PA_SCHEDULE_F_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-f.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-f-"));
}

function makePennsylvaniaResidentReturnWithScheduleF() {
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
    scheduleF: {
      principalCropOrActivity: "Corn and soybeans",
      accountingMethod: "cash",
      salesOfProductsRaised: "40000",
      cooperativeDistributions: "3000",
      expenses: {
        feed: "12000",
        fertilizersAndLime: "4000",
        utilities: "1800",
        otherExpenses: "700",
      },
    },
  });
}

describe("Pennsylvania Schedule F packet reference summary", () => {
  it("buildPAScheduleFReferenceSummary keeps the packet artifact reference-only for supported resident farm income", () => {
    const scheduleFResult = calculatePAScheduleF({
      taxYear: 2025,
      accountingMethod: "cash",
      salesOfProductsRaised: "40000",
      cooperativeDistributions: "3000",
      expenses: {
        feed: "12000",
        fertilizersAndLime: "4000",
        utilities: "1800",
        otherExpenses: "700",
      },
    });
    const summary = buildPAScheduleFReferenceSummary(scheduleFResult);

    expect(summary.title).toBe("Pennsylvania Schedule F Farm Income Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Line 12 gross income",
      value: "43000",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 38 total expenses",
      value: "18500",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 39 net farm profit or loss",
      value: "24500",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule F reference summary when the resident return includes supported farm income", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithScheduleF();
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_F_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule F reference summary when no supported farm input is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = TaxYearInputSchema.parse({
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_F_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
