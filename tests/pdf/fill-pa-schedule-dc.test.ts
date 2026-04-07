/**
 * Spec: spec/state/pa-schedule-dc.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleDCReferenceSummary,
  PA_SCHEDULE_DC_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-dc.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-dc-"));
}

function makePennsylvaniaResidentReturn(dependentCareExpenses: string) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      address: {
        ...simpleW2Fixture.taxpayer.address,
        state: "PA",
      },
      dependents: [
        {
          firstName: "Sofia",
          lastName: "Northwind",
          ssn: "333-44-5555",
          dateOfBirth: "2020-07-01",
          relationship: "daughter",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: simpleW2Fixture.w2s.map((w2) => ({
      ...w2,
      wages: "75000",
      federalWithheld: "9000",
      socialSecurityWages: "75000",
      socialSecurityWithheld: "4650",
      medicareWages: "75000",
      medicareWithheld: "1087.50",
      state: "PA",
      stateWages: "75000",
      stateTaxWithheld: "2303",
    })),
    dependentCare: {
      expenses: dependentCareExpenses,
      qualifyingIndividuals: 1,
    },
  });
}

describe("Pennsylvania Schedule DC packet reference summary", () => {
  it("buildPAScheduleDCReferenceSummary keeps the packet artifact reference-only for supported resident dependent-care credits", () => {
    const taxInput = makePennsylvaniaResidentReturn("5000");
    const paResult = calculatePAReturn(taxInput);
    const summary = buildPAScheduleDCReferenceSummary(paResult.scheduleDC!);

    expect(summary.title).toBe("Pennsylvania Schedule DC Child and Dependent Care Credit Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Line 1 qualifying persons",
      value: "1",
    });
    expect(summary.totals).toContainEqual({
      label: "Federal Form 2441 Line 9a credit",
      value: paResult.scheduleDC!.federalCredit.toString(),
    });
    expect(summary.totals).toContainEqual({
      label: "PA-40 Line 23 Schedule DC credit",
      value: paResult.scheduleDC!.credit.toString(),
    });
  });

  it("fillReturn includes the Pennsylvania Schedule DC reference summary when the resident return claims the credit", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturn("5000");
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_DC_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule DC reference summary when the resident return has no allowed credit", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturn("0");
      const federalResult = calculateFederalTax(taxInput);
      const pennsylvania = calculatePAReturn(taxInput);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania,
        },
      };

      expect(pennsylvania.scheduleDC).toBeDefined();
      expect(pennsylvania.scheduleDC!.credit.isZero()).toBe(true);

      const { filledForms } = await fillReturn(taxInput, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(PA_SCHEDULE_DC_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
