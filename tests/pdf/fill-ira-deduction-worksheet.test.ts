/**
 * Spec: spec/federal/ira-deduction-worksheet.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateIraDeduction } from "@/engine/forms/ira-deduction-worksheet.js";
import Decimal from "decimal.js";
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
  it("preserves compensation and excess separately and rejects contradictory review values", () => {
    const primary = calculateIraDeduction({ filingStatus: "single", taxYear: 2025,
      magi: "84000", contributions: "7000", compensation: "2000", section501c18Contributions: "0",
      isActiveParticipant: true, isSpouseActiveParticipant: false, age50OrOlder: false });
    const result = { magi: new Decimal(84000), primary, totalDeduction: new Decimal(2000) };
    const summary = buildIraDeductionWorksheetReferenceSummary(result);
    const lines = summary.sections[0].lines;
    expect(lines.find(line => line.line === "5")?.value).toBe("2000");
    expect(lines.find(line => line.line === "8")?.value).toBe("0");
    expect(lines.find(line => line.line === "excessContributions")?.value).toBe("5000");
    expect(lines.find(line => line.line === "sourceFacts")?.value).toBe("Confirmed source facts");
    expect(() => buildIraDeductionWorksheetReferenceSummary({ ...result,
      primary: { ...primary, excessContributions: new Decimal(0) } })).toThrow(/reconcile/);
  });
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
            description: "Annual IRA contribution limit",
            value: "7000",
            formula: "2025 indexed annual limit 7000; legacy section501c18 source is unknown",
          },
          {
            line: "5", description: "Actual eligible compensation", value: "Unknown",
            formula: "Historical preview cannot verify the missing compensation source",
          },
          {
            line: "deductibleAmount",
            description: "Deductible traditional IRA contribution",
            value: "2800",
            formula: "Worksheet1-2 line7",
          },
          {
            line: "8", description: "Valid nondeductible contribution", value: "4200",
            formula: "Allowable contribution minus deduction; excess contributions excluded",
          },
          {
            line: "excessContributions", description: "Excess contributions requiring separate treatment", value: "0",
            formula: "Actual contribution minus allowable annual/compensation amount; not Form8606 basis",
          },
          {
            line: "sourceFacts", description: "Source completeness", value: "Unverified historical sources",
            formula: "Source completeness does not establish independent review or filing qualification",
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

  it.each([["included", true], ["omitted", false]] as const)("fillReturn includes the IRA deduction worksheet reference summary only when worksheet inputs are present: %s", async (_scenario, included) => {
    const input = included ? {
      ...simpleW2Fixture,
      iraDeductionWorksheet: { primaryContributions: "7000", primaryIsActiveParticipant: true },
    } : simpleW2Fixture;
    const outputDir = await makeOutputDir();
    try {
      const result = calculateFederalTax(input);
      const packet = await fillReturn(input, result, { blankFormsDir: "forms/blank", outputDir });

      if (included) {
        const referencePath = packet.filledForms.find((path) => path.endsWith(IRA_DEDUCTION_WORKSHEET_REFERENCE_FILENAME));
        expect(referencePath).toBeDefined();
        await access(referencePath!);
        const pdfBytes = await readFile(referencePath!);
        expect(pdfBytes.length).toBeGreaterThan(0);
      } else {
        expect(packet.filledForms.some((path) => path.endsWith(IRA_DEDUCTION_WORKSHEET_REFERENCE_FILENAME))).toBe(false);
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
