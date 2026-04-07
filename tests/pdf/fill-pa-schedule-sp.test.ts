/**
 * Spec: spec/state/pa-schedule-sp.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleSP } from "@/engine/state/pa-schedule-sp.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleSPReferenceSummary,
  PA_SCHEDULE_SP_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-sp.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-sp-"));
}

function makePennsylvaniaResidentReturnClaimingTaxForgiveness() {
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
      wages: "6000",
      federalWithheld: "450",
      socialSecurityWages: "6000",
      socialSecurityWithheld: "372",
      medicareWages: "6000",
      medicareWithheld: "87",
      state: "PA",
      stateWages: "6000",
      stateTaxWithheld: "184",
    })),
  });
}

describe("Pennsylvania Schedule SP packet reference summary", () => {
  it("buildPAScheduleSPReferenceSummary keeps the packet artifact reference-only for a claimed Tax Forgiveness credit", () => {
    const summary = buildPAScheduleSPReferenceSummary(calculateScheduleSP({
      taxYear: 2025,
      filingCategory: "unmarried",
      dependents: 0,
      paTaxableIncome: new Decimal(6000),
      nontaxableIncome: new Decimal(0),
      taxLiability: new Decimal(184),
      taxPaidToOtherStates: new Decimal(0),
    }));

    expect(summary.title).toBe("Pennsylvania Schedule SP Tax Forgiveness Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Line A-3 total eligibility income",
      value: "6000",
    });
    expect(summary.totals).toContainEqual({
      label: "Line B-4 forgiveness percentage",
      value: "100%",
    });
    expect(summary.totals).toContainEqual({
      label: "Line C-2 tax forgiveness credit",
      value: "184",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule SP reference summary when the return claims Tax Forgiveness", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnClaimingTaxForgiveness();
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_SP_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule SP reference summary when the return does not claim Tax Forgiveness", async () => {
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_SP_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
