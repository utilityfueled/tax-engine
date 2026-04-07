/**
 * Spec: spec/state/pa-schedule-ue.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleUEReferenceSummary,
  PA_SCHEDULE_UE_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-ue.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-ue-"));
}

function makePennsylvaniaResidentReturnWithScheduleUE({
  businessMiles = 4000,
  parkingAndTolls = "200",
  unionDues = "300",
  employerReimbursements,
}: {
  businessMiles?: number;
  parkingAndTolls?: string;
  unionDues?: string;
  employerReimbursements?: string;
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
    paResidentReturn: {
      scheduleUE: {
        vehicle: {
          method: "standard",
          totalMiles: 12000,
          businessMiles,
          parkingAndTolls,
        },
        otherExpenses: {
          unionDues,
        },
        employerReimbursements,
      },
    },
  });
}

describe("Pennsylvania Schedule UE packet reference summary", () => {
  it("buildPAScheduleUEReferenceSummary keeps the packet artifact reference-only for supported employee business expenses", () => {
    const input = makePennsylvaniaResidentReturnWithScheduleUE();

    const paResult = calculatePAReturn(input);
    const summary = buildPAScheduleUEReferenceSummary(paResult.scheduleUE!);

    expect(summary.title).toBe("Pennsylvania Schedule UE Employee Business Expense Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Section II vehicle expenses",
      value: "3000",
    });
    expect(summary.totals).toContainEqual({
      label: "Section I and miscellaneous expenses",
      value: "300",
    });
    expect(summary.totals).toContainEqual({
      label: "Line H total expenses",
      value: "3300",
    });
    expect(summary.totals).toContainEqual({
      label: "Line J net unreimbursed expenses",
      value: "3300",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule UE reference summary when the resident return reports supported employee business expenses", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithScheduleUE();
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_UE_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn includes the Pennsylvania Schedule UE reference summary when employer reimbursements fully offset supported expenses", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithScheduleUE({
        businessMiles: 5000,
        parkingAndTolls: "0",
        unionDues: "0",
        employerReimbursements: "3500",
      });
      const federalResult = calculateFederalTax(taxInput);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania: calculatePAReturn(taxInput),
        },
      };

      expect(result.stateReturns.pennsylvania!.scheduleUE!.netUnreimbursedExpenses.toNumber()).toBe(0);

      const { filledForms } = await fillReturn(taxInput, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_UE_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule UE reference summary when no supported employee business expense input is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithScheduleUE({
        businessMiles: 0,
        parkingAndTolls: "0",
        unionDues: "0",
        employerReimbursements: "0",
      });
      const federalResult = calculateFederalTax(taxInput);
      const result = {
        ...federalResult,
        stateReturns: {
          ...(federalResult.stateReturns ?? {}),
          pennsylvania: calculatePAReturn(taxInput),
        },
      };

      expect(result.stateReturns.pennsylvania!.scheduleUE!.totalExpenses.toNumber()).toBe(0);

      const { filledForms } = await fillReturn(taxInput, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_UE_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
