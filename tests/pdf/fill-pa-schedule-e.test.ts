/**
 * Spec: spec/state/pa-schedule-e.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAScheduleE } from "@/engine/state/pa-schedule-e.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import {
  buildPAScheduleEReferenceSummary,
  PA_SCHEDULE_E_REFERENCE_FILENAME,
} from "@/pdf/fill-pa-schedule-e.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-pa-schedule-e-"));
}

function makePennsylvaniaResidentReturnWithRentalActivity() {
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
    rentalProperties: [
      {
        description: "123 Walnut St",
        propertyType: "single_family",
        rents: "18000",
        advertising: "250",
        cleaning: "300",
        insurance: "1200",
        legalProfessional: "450",
        managementFees: "1500",
        mortgageInterest: "3200",
        repairs: "900",
        supplies: "175",
        taxes: "2100",
        utilities: "600",
        depreciation: "2500",
        personalUseDays: 0,
        rentalDays: 365,
        isActiveParticipant: true,
        qualifiesForQBI: false,
      },
    ],
    form1099Misc: [
      {
        payer: "ABC Leasing",
        rents: "2500",
        royalties: "700",
      },
    ],
  });
}

describe("Pennsylvania Schedule E packet reference summary", () => {
  it("buildPAScheduleEReferenceSummary keeps the packet artifact reference-only for supported rental and royalty activity", () => {
    const summary = buildPAScheduleEReferenceSummary(calculatePAScheduleE({
      taxYear: 2025,
      rentalProperties: [
        {
          description: "123 Walnut St",
          propertyType: "single_family",
          rents: "18000",
          advertising: "250",
          cleaning: "300",
          insurance: "1200",
          legalProfessional: "450",
          managementFees: "1500",
          mortgageInterest: "3200",
          repairs: "900",
          supplies: "175",
          taxes: "2100",
          utilities: "600",
          depreciation: "2500",
          personalUseDays: 0,
          rentalDays: 365,
          isActiveParticipant: true,
          qualifiesForQBI: false,
        },
      ],
      form1099Misc: [
        {
          payer: "ABC Leasing",
          rents: "2500",
          royalties: "700",
        },
      ],
    }));

    expect(summary.title).toBe("Pennsylvania Schedule E Rental and Royalty Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.totals).toContainEqual({
      label: "Gross rents from directly owned rental property",
      value: "18000",
    });
    expect(summary.totals).toContainEqual({
      label: "Total allowable rental and royalty expenses",
      value: "13175",
    });
    expect(summary.totals).toContainEqual({
      label: "Gross Form 1099-MISC rents and royalties",
      value: "3200",
    });
    expect(summary.totals).toContainEqual({
      label: "PA-40 Line 6 reportable net rental and royalty income",
      value: "8025",
    });
  });

  it("fillReturn includes the Pennsylvania Schedule E reference summary when the resident return includes supported rental activity", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxInput = makePennsylvaniaResidentReturnWithRentalActivity();
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_E_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn includes the Pennsylvania Schedule E reference summary when supported rental-property activity nets to zero", async () => {
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
        rentalProperties: [
          {
            description: "456 Pine St",
            propertyType: "single_family",
            rents: "6000",
            repairs: "3500",
            taxes: "2500",
            personalUseDays: 0,
            rentalDays: 365,
            isActiveParticipant: true,
            qualifiesForQBI: false,
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_E_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn suppresses the Pennsylvania Schedule E reference summary when no supported Schedule E activity is present", async () => {
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

      const referencePath = filledForms.find((path) => path.endsWith(PA_SCHEDULE_E_REFERENCE_FILENAME));

      expect(referencePath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
