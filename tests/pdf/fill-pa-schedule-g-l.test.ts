/**
 * Spec: spec/state/pa-schedule-g-l.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleGLReferenceSummary,
  PA_SCHEDULE_GL_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-g-l.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-g-l-"));
}

function makePennsylvaniaResidentReturn(otherStateCredits: Array<{
  stateCode: string;
  incomeTaxableByBothStates: string;
  taxPaidToOtherState: string;
}>) {
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
      wages: "100000",
      federalWithheld: "12000",
      socialSecurityWages: "100000",
      socialSecurityWithheld: "6200",
      medicareWages: "100000",
      medicareWithheld: "1450",
      state: "PA",
      stateWages: "100000",
      stateTaxWithheld: "3070",
    })),
    paResidentReturn: {
      otherStateCredits,
    },
  });
}

describe("Pennsylvania Schedule G-L packet reference summary", () => {
  it("buildPAScheduleGLReferenceSummary keeps the packet artifact reference-only for supported resident credits paid to other states", () => {
    const taxInput = makePennsylvaniaResidentReturn([
      {
        stateCode: "NJ",
        incomeTaxableByBothStates: "50000",
        taxPaidToOtherState: "2000",
      },
      {
        stateCode: "NY",
        incomeTaxableByBothStates: "30000",
        taxPaidToOtherState: "500",
      },
    ]);
    const paResult = calculatePAReturn(taxInput);
    const summary = buildPAScheduleGLReferenceSummary(paResult.scheduleGL);

    expect(summary.title).toBe("Pennsylvania Schedule G-L Resident Credit Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.perStateRows).toContainEqual({
      stateCode: "NJ",
      incomeTaxableByBothStates: "50000",
      taxPaidToOtherState: "2000",
      paTaxOnSharedIncome: "1535",
      credit: "1535",
    });
    expect(summary.totals).toContainEqual({
      label: "Total resident credit before PA tax cap",
      value: paResult.scheduleGL.totalCreditBeforeCap.toString(),
    });
    expect(summary.totals).toContainEqual({
      label: "PA-40 resident credit after PA tax cap",
      value: paResult.scheduleGL.totalCredit.toString(),
    });
  });

  it("fillReturn includes the Pennsylvania Schedule G-L reference summary when the resident return claims credit for taxes paid to another state", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturn([
        {
          stateCode: "NJ",
          incomeTaxableByBothStates: "50000",
          taxPaidToOtherState: "2000",
        },
      ]);
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_GL_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule G-L reference summary when the resident return has no allowable resident credit", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturn([
        {
          stateCode: "NJ",
          incomeTaxableByBothStates: "0",
          taxPaidToOtherState: "2000",
        },
      ]);
      const federalResult = calculateFederalTax(taxInput);
      const pennsylvania = calculatePAReturn(taxInput);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania,
        },
      };

      expect(pennsylvania.scheduleGL.totalCredit.isZero()).toBe(true);

      const { filledForms } = await fillReturn(taxInput, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(PA_SCHEDULE_GL_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
