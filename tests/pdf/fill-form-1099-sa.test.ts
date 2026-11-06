/**
 * Spec: spec/federal/form-1099-sa.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm1099SAReferenceSummary,
  FORM_1099_SA_REFERENCE_FILENAME,
} from "@/pdf/fill-form-1099-sa.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-1099sa-"));
}

describe("Form 1099-SA packet reference summary", () => {
  it("buildForm1099SAReferenceSummary keeps the packet artifact reference-only and limited to supported HSA outputs", () => {
    const hsaFixture = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: { firstName: "Pat", lastName: "Example", ssn: "987-65-4321", dateOfBirth: "1980-01-01" },
      },
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "1200",
          earningsOnExcessContributions: "25",
          distributionCode: "2",
          accountType: "hsa",
        },
        {
          payer: "Legacy HSA",
          grossDistribution: "800",
          distributionCode: "5",
          accountType: "hsa",
          accountHolder: "spouse",
        },
        {
          payer: "MA MSA Custodian",
          grossDistribution: "900",
          distributionCode: "1",
          accountType: "ma_msa",
        },
      ],
    };

    const result = calculateFederalTax(hsaFixture);
    const summary = buildForm1099SAReferenceSummary(hsaFixture.form1099SA, result.form1099SA!);

    expect(summary.title).toBe("Form 1099-SA HSA Distribution Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.statementCount).toBe(2);
    expect(summary.omittedUnsupportedStatementCount).toBe(1);
    expect(summary.forms).toEqual([
      {
        payer: "HSA Bank",
        grossDistribution: "1200",
        earningsOnExcessContributions: "25",
        distributionCode: "2",
        fairMarketValueOnDateOfDeath: "0",
        accountType: "HSA",
        beneficiaryRole: "Not supplied",
        deathDistributionTiming: "Not supplied",
        accountHolder: "Not supplied",
      },
      {
        payer: "Legacy HSA",
        grossDistribution: "800",
        earningsOnExcessContributions: "0",
        distributionCode: "5",
        fairMarketValueOnDateOfDeath: "0",
        accountType: "HSA",
        beneficiaryRole: "Not supplied",
        deathDistributionTiming: "Not supplied",
        accountHolder: "spouse",
      },
    ]);
    expect(summary.lines.map((line) => line.line)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("fillReturn includes a Form 1099-SA reference summary when supported HSA statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const hsaFixture = {
        ...simpleW2Fixture,
        form1099SA: [
          {
            payer: "HSA Bank",
            grossDistribution: "1200",
            earningsOnExcessContributions: "25",
            distributionCode: "2",
            accountType: "hsa",
          },
        ],
      };

      const result = calculateFederalTax(hsaFixture);
      const { filledForms } = await fillReturn(hsaFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_1099_SA_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 1099-SA reference summary when only unsupported non-HSA statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const unsupportedOnlyFixture = {
        ...simpleW2Fixture,
        form1099SA: [
          {
            payer: "MA MSA Custodian",
            grossDistribution: "900",
            distributionCode: "1",
            accountType: "ma_msa",
          },
        ],
      };

      const result = calculateFederalTax(unsupportedOnlyFixture);
      const { filledForms } = await fillReturn(unsupportedOnlyFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_1099_SA_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
