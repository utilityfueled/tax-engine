/**
 * Spec: spec/federal/form-1099-c.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm1099CReferenceSummary,
  FORM_1099_C_REFERENCE_FILENAME,
} from "@/pdf/fill-form-1099-c.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-1099c-"));
}

describe("Form 1099-C packet reference summary", () => {
  it("buildForm1099CReferenceSummary keeps the packet artifact reference-only and limited to supported cancellation-of-debt outputs", () => {
    const codFixture = {
      ...simpleW2Fixture,
      form1099C: [
        {
          creditor: "Community Bank",
          amountDischarged: "18000",
          interestIncluded: "1200",
          debtDescription: "Credit card balance",
          personallyLiable: true,
          identifiableEventCode: "G",
        },
        {
          creditor: "Metro Mortgage",
          amountDischarged: "4000",
          interestIncluded: "0",
          debtDescription: "Home equity note",
          personallyLiable: false,
          identifiableEventCode: "F",
          fmvOfProperty: "3500",
        },
      ],
      codExclusion: {
        insolvency: {
          totalLiabilities: "95000",
          totalAssets: "83000",
        },
        qualifiedFarmExclusion: "1500",
      },
    };

    const summary = buildForm1099CReferenceSummary(
      codFixture.form1099C,
      codFixture.codExclusion,
      codFixture.taxpayer.filingStatus,
      codFixture.taxpayer.taxYear,
    );

    expect(summary.title).toBe("Form 1099-C Cancellation of Debt Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.statementCount).toBe(2);
    expect(summary.forms).toEqual([
      {
        creditor: "Community Bank",
        box2AmountDischarged: "18000",
        box3InterestIncluded: "1200",
        box4DebtDescription: "Credit card balance",
        box5PersonallyLiable: true,
        box6IdentifiableEventCode: "G",
        box7FairMarketValueOfProperty: "0",
      },
      {
        creditor: "Metro Mortgage",
        box2AmountDischarged: "4000",
        box3InterestIncluded: "0",
        box4DebtDescription: "Home equity note",
        box5PersonallyLiable: false,
        box6IdentifiableEventCode: "F",
        box7FairMarketValueOfProperty: "3500",
      },
    ]);
    expect(summary.exclusionInputs).toEqual([
      {
        label: "Bankruptcy exclusion elected",
        value: "No",
      },
      {
        label: "Insolvency total liabilities",
        value: "95000",
      },
      {
        label: "Insolvency total assets",
        value: "83000",
      },
      {
        label: "Qualified principal residence discharged amount",
        value: "0",
      },
      {
        label: "Qualified farm exclusion input",
        value: "1500",
      },
      {
        label: "Qualified real property business exclusion input",
        value: "0",
      },
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Aggregated Form 1099-C Box 2 total",
        value: "22000",
      },
      {
        label: "Aggregated Form 1099-C Box 3 total",
        value: "1200",
      },
      {
        label: "Bankruptcy exclusion used",
        value: "0",
      },
      {
        label: "Insolvency exclusion used",
        value: "12000",
      },
      {
        label: "Qualified principal residence exclusion used",
        value: "0",
      },
      {
        label: "Qualified farm exclusion used",
        value: "1500",
      },
      {
        label: "Qualified real property business exclusion used",
        value: "0",
      },
      {
        label: "Total exclusions",
        value: "13500",
      },
      {
        label: "Schedule 1 Line 8c taxable COD income",
        value: "8500",
      },
    ]);
  });

  it("fillReturn includes a Form 1099-C reference summary when cancellation-of-debt statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const codFixture = {
        ...simpleW2Fixture,
        form1099C: [
          {
            creditor: "Community Bank",
            amountDischarged: "18000",
            interestIncluded: "1200",
            debtDescription: "Credit card balance",
            personallyLiable: true,
            identifiableEventCode: "G",
          },
        ],
        codExclusion: {
          insolvency: {
            totalLiabilities: "90000",
            totalAssets: "80000",
          },
        },
      };

      const result = calculateFederalTax(codFixture);
      const { filledForms } = await fillReturn(codFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_1099_C_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 1099-C reference summary when no cancellation-of-debt statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_1099_C_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
