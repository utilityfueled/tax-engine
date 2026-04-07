/**
 * Spec: spec/state/pa-schedule-j.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleJReferenceSummary,
  PA_SCHEDULE_J_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-j.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-j-"));
}

function makeResidentFixtureWithScheduleJ() {
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
      stateWages: "75000",
      stateTaxWithheld: "2303",
    })),
    paScheduleJStatements: [
      {
        estateOrTrustName: "Alpha Family Trust",
        federalEIN: "11-1111111",
        sourceDocument: "pa_rk_1",
        incomeAmount: "1500",
      },
      {
        estateOrTrustName: "Beta Nonresident Estate",
        federalEIN: "22-2222222",
        sourceDocument: "pa_nrk_1",
        incomeAmount: "500",
        nonresidentTaxWithheld: "125",
      },
      {
        estateOrTrustName: "Gamma Federal Trust",
        federalEIN: "33-3333333",
        sourceDocument: "federal_1041_k1",
        incomeAmount: "-250",
      },
    ],
  });
}

describe("Pennsylvania Schedule J packet reference summary", () => {
  it("buildPAScheduleJReferenceSummary keeps the packet artifact reference-only for supported estate or trust statement detail", () => {
    const fixture = makeResidentFixtureWithScheduleJ();
    const paResult = calculatePAReturn(fixture);
    const summary = buildPAScheduleJReferenceSummary(paResult.scheduleJ!);

    expect(summary.title).toBe("Pennsylvania Schedule J Estate or Trust Income Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Schedule J total estate or trust income",
      value: "2000",
    });
    expect(summary.totals).toContainEqual({
      label: "Schedule J total nonresident withholding",
      value: "125",
    });
    expect(summary.statements).toContainEqual({
      estateOrTrustName: "Beta Nonresident Estate",
      federalEIN: "22-2222222",
      sourceDocument: "PA Schedule NRK-1",
      taxableIncome: "500",
      nonresidentTaxWithheld: "125",
    });
    expect(summary.statements).toContainEqual({
      estateOrTrustName: "Gamma Federal Trust",
      federalEIN: "33-3333333",
      sourceDocument: "Federal Schedule K-1 (Form 1041)",
      taxableIncome: "0",
      nonresidentTaxWithheld: "0",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule J reference summary when the Pennsylvania return includes estate or trust statement detail", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = makeResidentFixtureWithScheduleJ();
      const federalResult = calculateFederalTax(fixture);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania: calculatePAReturn(fixture),
        },
      };

      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_J_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule J reference summary when no estate or trust statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = TaxYearInputSchema.parse({
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
          stateWages: "75000",
          stateTaxWithheld: "2303",
        })),
      });
      const federalResult = calculateFederalTax(fixture);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania: calculatePAReturn(fixture),
        },
      };

      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(PA_SCHEDULE_J_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
