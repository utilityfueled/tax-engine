/**
 * Spec: spec/state/pa-schedule-nrh.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePANonresidentReturn } from "@/engine/state/pa-nonresident-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleNRHReferenceSummary,
  PA_SCHEDULE_NRH_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-nrh.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-nrh-"));
}

function makeNonresidentFixtureWithScheduleNRH() {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      address: {
        ...simpleW2Fixture.taxpayer.address,
        state: "NJ",
      },
    },
    w2s: simpleW2Fixture.w2s.map((w2) => ({
      ...w2,
      state: "NJ",
      stateWages: "85000",
      stateTaxWithheld: "3200",
    })),
    paNonresidentReturn: {
      residencyStatus: "nonresident",
      scheduleNRH: {
        compensation: {
          method: "working_days",
          employerReportedPAGrossCompensation: "3500",
          grossCompensation: "85000",
          totalDaysForEmployer: 260,
          nonworkingDays: 10,
          daysWorkedInPennsylvania: 100,
          unreimbursedEmployeeBusinessExpenses: "2000",
          employerReimbursementsNotInW2: "500",
        },
      },
    },
  });
}

describe("Pennsylvania Schedule NRH packet reference summary", () => {
  it("buildPAScheduleNRHReferenceSummary keeps the packet artifact reference-only for supported nonresident apportionment input", () => {
    const fixture = makeNonresidentFixtureWithScheduleNRH();
    const paResult = calculatePANonresidentReturn(fixture);
    const summary = buildPAScheduleNRHReferenceSummary(fixture, paResult.scheduleNRH!);

    expect(summary.title).toBe("Pennsylvania Schedule NRH Nonresident Apportionment Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.sections).toContainEqual({
      heading: "Compensation apportionment",
      lines: expect.arrayContaining([
        { label: "Selected method", value: "Working days" },
        { label: "Working days", value: "250" },
        { label: "Selected apportionment fraction", value: "0.400000" },
        { label: "Total PA gross compensation", value: "$37700" },
        { label: "Net PA taxable compensation", value: "$36900" },
      ]),
    });
  });

  it("fillReturn includes the Pennsylvania Schedule NRH reference summary when the nonresident return includes supported apportionment input", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = makeNonresidentFixtureWithScheduleNRH();
      const federalResult = calculateFederalTax(fixture);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania: calculatePANonresidentReturn(fixture),
        },
      };

      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_NRH_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn includes the Pennsylvania Schedule NRH reference summary when supported apportionment input allocates zero Pennsylvania compensation", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = TaxYearInputSchema.parse({
        ...makeNonresidentFixtureWithScheduleNRH(),
        paNonresidentReturn: {
          residencyStatus: "nonresident",
          scheduleNRH: {
            compensation: {
              method: "working_days",
              grossCompensation: "250",
              totalDaysForEmployer: 260,
              nonworkingDays: 10,
              daysWorkedInPennsylvania: 0,
            },
          },
        },
      });
      const federalResult = calculateFederalTax(fixture);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania: calculatePANonresidentReturn(fixture),
        },
      };

      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(PA_SCHEDULE_NRH_REFERENCE_FILENAME))).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule NRH reference summary when no supported apportionment input is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = TaxYearInputSchema.parse({
        ...makeNonresidentFixtureWithScheduleNRH(),
        paNonresidentReturn: {
          residencyStatus: "nonresident",
          paTaxableCompensation: "12000",
        },
      });
      const federalResult = calculateFederalTax(fixture);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania: calculatePANonresidentReturn(fixture),
        },
      };

      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(PA_SCHEDULE_NRH_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
