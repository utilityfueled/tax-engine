/**
 * Spec: spec/state/pa-rev-1630.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAREV1630ReferenceSummary,
  PA_REV_1630_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-rev-1630.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-rev-1630-"));
}

function makePenaltyBearingFixture() {
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
      wages: "80000",
      federalWithheld: "10000",
      socialSecurityWages: "80000",
      socialSecurityWithheld: "4960",
      medicareWages: "80000",
      medicareWithheld: "1160",
      state: "PA",
      stateWages: "80000",
      stateTaxWithheld: "1500",
    })),
    paResidentReturn: {
      quarterlyEstimatedPayments: ["0", "0", "0", "0"],
      priorYearPATaxableIncome: "200000",
    },
  });
}

function makeForgivenessExemptionFixture() {
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
      wages: "80000",
      federalWithheld: "10000",
      socialSecurityWages: "80000",
      socialSecurityWithheld: "4960",
      medicareWages: "80000",
      medicareWithheld: "1160",
      state: "PA",
      stateWages: "80000",
      stateTaxWithheld: "500",
    })),
    paResidentReturn: {
      quarterlyEstimatedPayments: ["0", "0", "0", "0"],
      priorYear100PercentForgiveness: true,
    },
  });
}

describe("Pennsylvania REV-1630 packet reference summary", () => {
  it("buildPAREV1630ReferenceSummary keeps the packet artifact reference-only and limited to penalty-bearing REV-1630 outputs", () => {
    const fixture = makePenaltyBearingFixture();
    const paResult = calculatePAReturn(fixture);
    const summary = buildPAREV1630ReferenceSummary(paResult.rev1630!);

    expect(summary.title).toBe("Pennsylvania REV-1630 Underpayment Interest Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Line 1a tax liability",
      value: "2456",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 16 total interest penalty",
      value: paResult.rev1630!.totalInterest.toString(),
    });
    expect(summary.quarters).toContainEqual({
      quarterLabel: "Quarter 1",
      requiredInstallment: "178",
      estimatedPayment: "0",
      underpayment: "178",
      interest: "13",
      exception1Met: false,
    });
  });

  it("fillReturn includes the Pennsylvania REV-1630 reference summary when quarterly estimated payments still leave an underpayment penalty", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = makePenaltyBearingFixture();
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_REV_1630_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Pennsylvania REV-1630 reference summary when REV-1630 is only present because prior-year 100 percent Tax Forgiveness was checked", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = makeForgivenessExemptionFixture();
      const federalResult = calculateFederalTax(fixture);
      const pennsylvania = calculatePAReturn(fixture);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania,
        },
      };

      expect(pennsylvania.rev1630).toBeDefined();
      expect(pennsylvania.rev1630!.penaltyRequired).toBe(false);
      expect(pennsylvania.rev1630!.exemptReason).toContain("100% Tax Forgiveness");

      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(PA_REV_1630_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
