/**
 * Spec: spec/state/pa-local-eit.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPALocalEITReferenceSummary,
  PA_LOCAL_EIT_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-local-eit.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-local-eit-"));
}

describe("Pennsylvania local EIT packet reference summary", () => {
  it("buildPALocalEITReferenceSummary keeps the packet artifact reference-only for supported resident local-tax reconciliation", () => {
    const localEITFixture = TaxYearInputSchema.parse({
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
        localWages: "75000",
        localTaxWithheld: "500",
      })),
      paResidentReturn: {
        localMunicipality: "Pittsburgh",
        localEITRate: "0.01",
      },
    });

    const paResult = calculatePAReturn(localEITFixture);
    const summary = buildPALocalEITReferenceSummary(paResult.localEIT!);

    expect(summary.title).toBe("Pennsylvania Local Earned Income Tax Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.municipality).toBe("Pittsburgh");
    expect(summary.totals).toContainEqual({
      label: "Line 5 computed local tax",
      value: "750",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 8 local withholding",
      value: "500",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 10 balance due",
      value: "250",
    });
  });

  it("fillReturn includes the Pennsylvania local EIT reference summary when the resident return computes local EIT", async () => {
    const outputDir = await makeOutputDir();

    try {
      const localEITFixture = TaxYearInputSchema.parse({
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
          localWages: "75000",
          localTaxWithheld: "500",
        })),
        paResidentReturn: {
          localMunicipality: "Pittsburgh",
          localEITRate: "0.01",
        },
      });

      const federalResult = calculateFederalTax(localEITFixture);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania: calculatePAReturn(localEITFixture),
        },
      };

      const { filledForms } = await fillReturn(localEITFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(PA_LOCAL_EIT_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
