/**
 * Spec: spec/state/pa-schedule-c.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAScheduleC } from "@/engine/state/pa-schedule-c.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleCReferenceSummary,
  PA_SCHEDULE_C_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-c.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-c-"));
}

function makePennsylvaniaResidentReturnWithScheduleC() {
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
    form1099Nec: [
      {
        payer: "Northwind Design Studio",
        nonemployeeCompensation: "18000",
        federalWithheld: "0",
      },
    ],
    scheduleC: {
      businessName: "Northwind Design Studio",
      grossReceipts: "18000",
      expenses: {
        advertising: "250",
        officeExpense: "600",
        supplies: "500",
        travel: "300",
        meals: "200",
        utilities: "150",
        otherExpenses: "800",
      },
    },
  });
}

describe("Pennsylvania Schedule C packet reference summary", () => {
  it("buildPAScheduleCReferenceSummary keeps the packet artifact reference-only for supported resident business income", () => {
    const scheduleCResult = calculatePAScheduleC({
      taxYear: 2025,
      grossReceipts: new Decimal("18000"),
      expenses: {
        advertising: new Decimal("250"),
        officeExpense: new Decimal("600"),
        supplies: new Decimal("500"),
        travel: new Decimal("300"),
        meals: new Decimal("200"),
        utilities: new Decimal("150"),
        otherExpenses: new Decimal("800"),
      },
    });
    const summary = buildPAScheduleCReferenceSummary(scheduleCResult);

    expect(summary.title).toBe("Pennsylvania Schedule C Business Income Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Line 1a gross receipts or sales",
      value: "18000",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 38 total expenses",
      value: "2800",
    });
    expect(summary.totals).toContainEqual({
      label: "Line 39 net profit or loss",
      value: "15200",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule C reference summary when the resident return includes supported business income", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithScheduleC();
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_C_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule C reference summary when no supported business input is present", async () => {
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_C_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
