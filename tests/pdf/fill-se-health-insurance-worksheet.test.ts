/**
 * Spec: spec/federal/se-health-insurance-worksheet.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { TaxYearInput } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildSEHealthInsuranceWorksheetReferenceSummary,
  SE_HEALTH_INSURANCE_WORKSHEET_REFERENCE_FILENAME,
} from "@/pdf/fill-se-health-insurance-worksheet.js";
import { fillReturn } from "@/pdf/fill-return.js";

function makeWorksheetFixture(): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Alex",
        lastName: "Freelance",
        ssn: "111-22-3333",
        dateOfBirth: "1985-03-10",
        occupation: "Consultant",
      },
      address: {
        street: "1 Main St",
        city: "Portland",
        state: "OR",
        zip: "97201",
      },
      dependents: [],
    },
    w2s: [],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [
      {
        payer: "Client A",
        nonemployeeCompensation: "20000",
        federalWithheld: "0",
      },
    ],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
    seHealthInsuranceWorksheet: {
      medicalDentalPremiums: "24000",
      longTermCareCoverages: [
        { premiumsPaid: "1000", attainedAge: 39 },
      ],
      medicarePartBPremiums: "1200",
      medicarePartDPremiums: "300",
      eligibleMonths: 12,
    },
  };
}

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-se-health-worksheet-"));
}

describe("SE health insurance worksheet packet reference summary", () => {
  it("buildSEHealthInsuranceWorksheetReferenceSummary keeps the packet artifact reference-only and limited to supported worksheet outputs", () => {
    const result = calculateFederalTax(makeWorksheetFixture());
    const summary = buildSEHealthInsuranceWorksheetReferenceSummary(result);

    expect(summary.title).toBe("Self-Employed Health Insurance Worksheet Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.sections.map((section) => section.heading)).toEqual([
      "Self-Employed Health Insurance Deduction Worksheet",
      "Downstream effects",
    ]);

    const worksheetSection = summary.sections[0];
    expect(worksheetSection?.lines.map((line) => line.line)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "excessForScheduleA",
    ]);
    expect(worksheetSection?.lines.find((line) => line.line === "11")).toMatchObject({
      description: "Self-employed health insurance deduction",
      value: result.seHealthInsuranceWorksheet?.deductibleAmount.toString(),
    });

    expect(summary.sections[1]?.lines).toEqual([
      {
        line: "Sched1-17",
        description: "Schedule 1 Line 17 self-employed health insurance deduction",
        value: result.schedule1!.seHealthInsurance.toString(),
        formula: "Worksheet Line 11 amount carried to Schedule 1 Line 17",
      },
      {
        line: "SchedA-1 support",
        description: "Excess premiums available for Schedule A medical expenses",
        value: result.seHealthInsuranceWorksheet!.excessForScheduleA.toString(),
        formula: "Worksheet excess premiums that remain eligible for Schedule A medical-expense treatment",
      },
    ]);
  });

  it("fillReturn includes the SE health insurance worksheet reference summary only when worksheet inputs are present", async () => {
    const outputDirWithWorksheet = await makeOutputDir();
    const outputDirWithoutWorksheet = await makeOutputDir();

    try {
      const worksheetFixture = makeWorksheetFixture();
      const resultWithWorksheet = calculateFederalTax(worksheetFixture);
      const withWorksheetPacket = await fillReturn(worksheetFixture, resultWithWorksheet, {
        blankFormsDir: "forms/blank",
        outputDir: outputDirWithWorksheet,
      });

      const referencePath = withWorksheetPacket.filledForms.find((path) => (
        path.endsWith(SE_HEALTH_INSURANCE_WORKSHEET_REFERENCE_FILENAME)
      ));
      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);

      const noWorksheetFixture = {
        ...worksheetFixture,
        seHealthInsuranceWorksheet: undefined,
      };
      const resultWithoutWorksheet = calculateFederalTax(noWorksheetFixture);
      const withoutWorksheetPacket = await fillReturn(noWorksheetFixture, resultWithoutWorksheet, {
        blankFormsDir: "forms/blank",
        outputDir: outputDirWithoutWorksheet,
      });

      expect(
        withoutWorksheetPacket.filledForms.some((path) => (
          path.endsWith(SE_HEALTH_INSURANCE_WORKSHEET_REFERENCE_FILENAME)
        )),
      ).toBe(false);
    } finally {
      await rm(outputDirWithWorksheet, { recursive: true, force: true });
      await rm(outputDirWithoutWorksheet, { recursive: true, force: true });
    }
  });
});
