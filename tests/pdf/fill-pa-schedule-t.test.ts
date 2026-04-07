/**
 * Spec: spec/state/pa-schedule-t.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleTReferenceSummary,
  PA_SCHEDULE_T_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-t.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-t-"));
}

function makePennsylvaniaResidentReturnWithScheduleT({
  formW2G,
  additionalEntries,
}: {
  formW2G?: Array<Record<string, unknown>>;
  additionalEntries?: Array<Record<string, unknown>>;
} = {}) {
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
    formW2G: formW2G ?? [
      {
        payer: "PA Lottery",
        reportableWinnings: "1000",
        typeOfWager: "lottery",
        state: "PA",
        prizeType: "cash",
        stateWithheld: "31",
      },
    ],
    paResidentReturn: additionalEntries
      ? {
        scheduleT: {
          additionalEntries,
        },
      }
      : undefined,
  });
}

describe("Pennsylvania Schedule T packet reference summary", () => {
  it("buildPAScheduleTReferenceSummary keeps the packet artifact reference-only for taxable gambling winnings and withholding", () => {
    const input = makePennsylvaniaResidentReturnWithScheduleT({
      additionalEntries: [
        {
          description: "Poker tournament",
          winnings: "300",
          wageringCosts: "50",
        },
      ],
    });

    const paResult = calculatePAReturn(input);
    const summary = buildPAScheduleTReferenceSummary(paResult.scheduleT!);

    expect(summary.title).toBe("Pennsylvania Schedule T Gambling and Lottery Winnings Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Line 3 total winnings",
      value: "1300",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 6 total gambling and lottery winnings",
      value: "1250",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 7 Pennsylvania tax withheld",
      value: "31",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule T reference summary when the resident return has taxable gambling winnings or Pennsylvania withholding", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithScheduleT({
        additionalEntries: [
          {
            description: "Poker tournament",
            winnings: "300",
            wageringCosts: "50",
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_T_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule T reference summary when only exempt noncash Pennsylvania Lottery prizes are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithScheduleT({
        formW2G: [
          {
            payer: "PA Lottery truck giveaway",
            reportableWinnings: "18000",
            typeOfWager: "lottery",
            state: "PA",
            prizeType: "noncash",
            stateWithheld: "0",
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_T_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
