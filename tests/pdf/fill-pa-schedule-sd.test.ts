/**
 * Spec: spec/state/pa-schedule-sd.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleSD } from "@/engine/state/pa-schedule-sd.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleSDReferenceSummary,
  PA_SCHEDULE_SD_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-sd.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-sd-"));
}

function makePennsylvaniaResidentReturnWithSchoolDistrictTax() {
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
      wages: "50000",
      federalWithheld: "6500",
      state: "PA",
      stateWages: "50000",
      stateTaxWithheld: "1535",
    })),
    scheduleC: {
      businessName: "Northwind Studio",
      grossReceipts: "10000",
    },
    paResidentReturn: {
      unreimbursedExpenses: "2000",
      otherDeductions: "3000",
      scheduleSD: {
        method: "EI",
        schoolDistrictRate: "0.01",
        schoolDistrictWithholding: "500",
        estimatedPayments: "25",
      },
    },
  });
}

describe("Pennsylvania Schedule SD packet reference summary", () => {
  it("buildPAScheduleSDReferenceSummary keeps the packet artifact reference-only for a computed school district tax result", () => {
    const summary = buildPAScheduleSDReferenceSummary(calculateScheduleSD({
      taxYear: 2025,
      method: "EI",
      schoolDistrictRate: new Decimal("0.01"),
      paTotalTaxableIncome: new Decimal(60000),
      netCompensation: new Decimal(50000),
      netBusinessIncome: new Decimal(10000),
      otherDeductions: new Decimal(3000),
      forgivenessPercentage: new Decimal(0),
      schoolDistrictWithholding: new Decimal(500),
      estimatedPayments: new Decimal(25),
    }));

    expect(summary.title).toBe("Pennsylvania PA-40 SD School District Tax Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Line 5 adjusted tax base",
      value: "57000",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 6 school district income tax",
      value: "570",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 13 amount owed",
      value: "45",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule SD reference summary when the resident return computes school district tax", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithSchoolDistrictTax();
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_SD_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule SD reference summary when no school district computation is present", async () => {
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_SD_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
