/**
 * Spec: spec/federal/form-8814.yaml
 */

import { access, mkdtemp, readFile, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm8814ReferenceSummary,
  FORM_8814_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8814.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { syntheticChildElection } from "../fixtures/form-8814-election.js";
import type { Form8814ChildInput } from "@/models/inputs.js";

// These synthetic PDF fixtures explicitly report no private activity interest.
function syntheticExemptSources(amount: string, sourceId: string): Form8814ChildInput["amtSources"] {
  return {
    taxYear: 2025, allStatementsConfirmed: true, otherwiseAllowableDeduction: "0",
    statements: [{ sourceId, form: "1099-INT", taxExemptInterest: amount, specifiedPrivateActivityBondInterest: "0" }],
  };
}

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8814-"));
}

describe("Form 8814 packet reference summary", () => {
  it("buildForm8814ReferenceSummary keeps the packet artifact reference-only and limited to supported child-election outputs", () => {
    const parentElectionFixture = {
      ...simpleW2Fixture,
      form8814: [
        {
          taxableInterest: "1800",
          electionFacts: syntheticChildElection(),
          taxExemptInterest: "25",
          amtSources: syntheticExemptSources("25", "child-1-bank"),
          ordinaryDividends: "900",
          qualifiedDividends: "300",
          capitalGainDistributions: "300",
        },
        {
          taxableInterest: "2000",
          electionFacts: syntheticChildElection(2025, "02"),
          taxExemptInterest: "5",
          amtSources: syntheticExemptSources("5", "child-2-bank"),
          ordinaryDividends: "800",
          qualifiedDividends: "0",
          capitalGainDistributions: "0",
        },
      ],
    };

    const result = calculateFederalTax(parentElectionFixture);
    const summary = buildForm8814ReferenceSummary(result.form8814!);

    expect(summary.title).toBe("Form 8814 Child Interest Election Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.childCount).toBe(2);
    expect(summary.applicableChildCount).toBe(2);
    expect(summary.children).toEqual([
      {
        childNumber: 1,
        status: "applicable",
        note: "Child income is within the Form 8814 computation range. Eligibility is validated separately from this reference summary.",
        lines: [
          {
            line: "1b",
            description: "Child's tax-exempt interest",
            value: "25",
            formula: "Informational, not included in Line 4",
          },
          {
            line: "4",
            description: "Total child income",
            value: "3000",
            formula: "Line 1a + Line 2a + Line 3",
          },
          {
            line: "6",
            description: "Income above base amount",
            value: "300",
            formula: "Line 4 - Line 5",
          },
          {
            line: "9",
            description: "Qualified dividends to report on parent's return",
            value: "30",
            formula: "Line 6 × Line 7 → parent's Form 1040 Lines 3a and 3b",
          },
          {
            line: "10",
            description: "Capital gain distributions to report on parent's return",
            value: "30",
            formula: "Line 6 × Line 8 → parent's Schedule D Line 13",
          },
          {
            line: "12",
            description: "Other interest/dividend income at ordinary rates",
            value: "240",
            formula: "Line 6 - Line 11 → Schedule 1 Line 8z",
          },
          {
            line: "15",
            description: "Tax on first tier of child's income",
            value: "135",
            formula: "$1350 × 10% = $135 (maximum)",
          },
        ],
      },
      {
        childNumber: 2,
        status: "applicable",
        note: "Child income is within the Form 8814 computation range. Eligibility is validated separately from this reference summary.",
        lines: [
          {
            line: "1b",
            description: "Child's tax-exempt interest",
            value: "5",
            formula: "Informational, not included in Line 4",
          },
          {
            line: "4",
            description: "Total child income",
            value: "2800",
            formula: "Line 1a + Line 2a + Line 3",
          },
          {
            line: "6",
            description: "Income above base amount",
            value: "100",
            formula: "Line 4 - Line 5",
          },
          {
            line: "12",
            description: "Other interest/dividend income at ordinary rates",
            value: "100",
            formula: "Entire Line 6 is ordinary-rate income → Schedule 1 Line 8z",
          },
          {
            line: "15",
            description: "Tax on first tier of child's income",
            value: "135",
            formula: "$1350 × 10% = $135 (maximum)",
          },
        ],
      },
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Child tax-exempt interest for dependent worksheets (not parent Line 2a)",
        value: "30",
      },
      {
        label: "Parent Form 1040 Lines 3a and 3b addition",
        value: "30",
      },
      {
        label: "Parent Schedule D / Form 1040 Line 7 addition",
        value: "30",
      },
      {
        label: "Parent Schedule 1 Line 8z addition",
        value: "340",
      },
      {
        label: "Parent Form 1040 Line 16 tax addition",
        value: "270",
      },
    ]);
  });

  it("fillReturn includes a Form 8814 reference summary when at least one child qualifies for the parent election", async () => {
    const outputDir = await makeOutputDir();

    try {
      const parentElectionFixture = {
        ...simpleW2Fixture,
        form8814: [
          {
            taxableInterest: "1800",
            electionFacts: syntheticChildElection(),
            taxExemptInterest: "25",
            amtSources: syntheticExemptSources("25", "child-1-bank"),
            ordinaryDividends: "900",
            qualifiedDividends: "300",
            capitalGainDistributions: "300",
          },
        ],
      };

      const result = calculateFederalTax(parentElectionFixture);
      const { filledForms } = await fillReturn(parentElectionFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_8814_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("an ineligible child election rejects before any return packet is emitted", async () => {
    const outputDir = await makeOutputDir();

    try {
      const belowThresholdFixture = {
        ...simpleW2Fixture,
        form8814: [
          {
            taxableInterest: "1200",
            electionFacts: syntheticChildElection(),
            taxExemptInterest: "50",
            amtSources: syntheticExemptSources("50", "child-1-bank"),
            ordinaryDividends: "100",
            qualifiedDividends: "0",
            capitalGainDistributions: "0",
          },
        ],
      };

      expect(() => calculateFederalTax(belowThresholdFixture)).toThrow(/child gross income.*election limits/i);
      expect(await readdir(outputDir)).toEqual([]);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
