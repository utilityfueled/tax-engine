/**
 * Spec: spec/federal/ira-deduction-worksheet.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildIraDeductionWorksheetReferenceSummary,
  IRA_DEDUCTION_WORKSHEET_REFERENCE_FILENAME,
} from "@/pdf/fill-ira-deduction-worksheet.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-ira-deduction-"));
}

describe("IRA deduction worksheet packet reference summary", () => {
  it("buildIraDeductionWorksheetReferenceSummary keeps the packet artifact reference-only and limited to supported IRA worksheet outputs", () => {
    const iraDeductionFixture = {
      ...simpleW2Fixture,
      iraDeductionWorksheet: {
        primaryContributions: "7000",
        primaryIsActiveParticipant: true,
      },
    };

    const result = calculateFederalTax(iraDeductionFixture);
    const summary = buildIraDeductionWorksheetReferenceSummary(result.iraDeductionWorksheet!);

    expect(summary.title).toBe("IRA Deduction Worksheet Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.sections).toEqual([
      {
        heading: "Primary taxpayer",
        lines: [
          {
            line: "contributionLimit",
            description: "Maximum allowable IRA contribution",
            value: "7000",
            formula: "$7,000 base limit (under age 50)",
          },
          {
            line: "deductibleAmount",
            description: "Deductible traditional IRA contribution",
            value: "2800",
            formula: "Partial phase-out: (MAGI - start) / range × limit, rounded up to $10, with $200 floor (active participant in employer plan)",
          },
        ],
      },
      {
        heading: "Schedule 1 Line 20",
        lines: [
          {
            line: "totalDeduction",
            description: "Combined IRA deduction",
            value: "2800",
            formula: "Primary deductible amount + spouse deductible amount (if any)",
          },
        ],
      },
    ]);
  });

  it("fillReturn includes the IRA deduction worksheet reference summary only when worksheet inputs are present", async () => {
    const outputDirWithWorksheet = await makeOutputDir();
    const outputDirWithoutWorksheet = await makeOutputDir();

    try {
      const iraDeductionFixture = {
        ...simpleW2Fixture,
        iraDeductionWorksheet: {
          primaryContributions: "7000",
          primaryIsActiveParticipant: true,
        },
      };

      const resultWithWorksheet = calculateFederalTax(iraDeductionFixture);
      const withWorksheetPacket = await fillReturn(iraDeductionFixture, resultWithWorksheet, {
        blankFormsDir: "forms/blank",
        outputDir: outputDirWithWorksheet,
      });

      const referencePath = withWorksheetPacket.filledForms.find((path) => path.endsWith(IRA_DEDUCTION_WORKSHEET_REFERENCE_FILENAME));
      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);

      const resultWithoutWorksheet = calculateFederalTax(simpleW2Fixture);
      const withoutWorksheetPacket = await fillReturn(simpleW2Fixture, resultWithoutWorksheet, {
        blankFormsDir: "forms/blank",
        outputDir: outputDirWithoutWorksheet,
      });

      expect(
        withoutWorksheetPacket.filledForms.some((path) => path.endsWith(IRA_DEDUCTION_WORKSHEET_REFERENCE_FILENAME)),
      ).toBe(false);
    } finally {
      await rm(outputDirWithWorksheet, { recursive: true, force: true });
      await rm(outputDirWithoutWorksheet, { recursive: true, force: true });
    }
  });
});
