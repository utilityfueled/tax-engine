/**
 * Spec: spec/state/pa-schedule-d.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAScheduleD } from "@/engine/state/pa-schedule-d.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleDReferenceSummary,
  PA_SCHEDULE_D_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-d.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-d-"));
}

function makePennsylvaniaResidentReturn() {
  return {
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
  };
}

describe("Pennsylvania Schedule D packet reference summary", () => {
  it("buildPAScheduleDReferenceSummary keeps the packet artifact reference-only for supported property-disposition activity", () => {
    const scheduleDResult = calculatePAScheduleD({
      taxYear: 2025,
      filingStatus: "single",
      form1099B: [{
        broker: "Keystone Brokerage",
        transactions: [{
          description: "PA Utility Fund",
          dateAcquired: "2020-02-01",
          dateSold: "2025-08-15",
          proceeds: "8000",
          costBasis: "5000",
          holdingPeriod: "long",
        }],
      }],
      likeKindExchanges: [{
        propertyOwned: "Warehouse lot in Erie",
        propertyReceived: "Warehouse lot in Scranton",
        recognizedGainOrLoss: "500",
      }],
    });

    const summary = buildPAScheduleDReferenceSummary(scheduleDResult);

    expect(summary.title).toBe("Pennsylvania Schedule D Net Gain or Loss Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Digital asset question",
      value: "No",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 1 general property dispositions",
      value: "$3000",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 2 like-kind exchange gain or loss",
      value: "$500",
    });
    expect(summary.totals).toContainEqual({
      label: "PA-40 Line 5 reportable net gain or loss",
      value: "$3500",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule D reference summary when the return includes supported Schedule D activity", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = TaxYearInputSchema.parse({
        ...makePennsylvaniaResidentReturn(),
        form1099B: [
          {
            broker: "Keystone Brokerage",
            transactions: [
              {
                description: "PA Utility Fund",
                dateAcquired: "2020-02-01",
                dateSold: "2025-08-15",
                proceeds: "8000",
                costBasis: "5000",
                holdingPeriod: "long",
              },
            ],
          },
        ],
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_D_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn includes the Pennsylvania Schedule D reference summary when supported 1099-B activity nets to zero", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = TaxYearInputSchema.parse({
        ...makePennsylvaniaResidentReturn(),
        form1099B: [
          {
            broker: "Keystone Brokerage",
            transactions: [
              {
                description: "PA Utility Fund",
                dateAcquired: "2020-02-01",
                dateSold: "2025-08-15",
                proceeds: "5000",
                costBasis: "5000",
                holdingPeriod: "long",
              },
            ],
          },
        ],
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_D_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule D reference summary when no supported Schedule D trigger is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = TaxYearInputSchema.parse(makePennsylvaniaResidentReturn());
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_D_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
