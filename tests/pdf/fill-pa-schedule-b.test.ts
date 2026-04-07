/**
 * Spec: spec/state/pa-schedule-b.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleBReferenceSummary,
  PA_SCHEDULE_B_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-b.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-b-"));
}

function makePennsylvaniaResidentReturnWithDividends({
  ordinaryDividends,
  totalCapitalGainDistributions,
}: {
  ordinaryDividends: string;
  totalCapitalGainDistributions?: string;
}) {
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
    form1099Div: [
      {
        payer: "Keystone Brokerage",
        ordinaryDividends,
        qualifiedDividends: "0",
        totalCapitalGainDistributions: totalCapitalGainDistributions ?? "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        section199ADividends: "0",
        foreignTaxPaid: "0",
        exemptInterestDividends: "0",
      },
    ],
  });
}

describe("Pennsylvania Schedule B packet reference summary", () => {
  it("buildPAScheduleBReferenceSummary keeps the packet artifact reference-only for supported resident dividend-income adjustments", () => {
    const input = makePennsylvaniaResidentReturnWithDividends({
      ordinaryDividends: "2000",
      totalCapitalGainDistributions: "500",
    });

    const paResult = calculatePAReturn(input);
    const summary = buildPAScheduleBReferenceSummary(paResult.scheduleB!);

    expect(summary.title).toBe("Pennsylvania Schedule B Dividend Income Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Line 1 dividend income from the federal return",
      value: "2000",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 10 capital gains distributions",
      value: "500",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 12 PA-taxable dividend income",
      value: "2500",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule B reference summary when the official filing trigger is met", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithDividends({
        ordinaryDividends: "2000",
        totalCapitalGainDistributions: "500",
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_B_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule B reference summary when the official filing trigger is not met", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithDividends({
        ordinaryDividends: "2500",
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_B_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
