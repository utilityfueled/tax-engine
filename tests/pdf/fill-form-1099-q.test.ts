/**
 * Spec: spec/federal/form-1099-q.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm1099QReferenceSummary,
  FORM_1099_Q_REFERENCE_FILENAME,
} from "@/pdf/fill-form-1099-q.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-1099q-"));
}

describe("Form 1099-Q packet reference summary", () => {
  it("buildForm1099QReferenceSummary keeps the packet artifact reference-only and limited to supported education-distribution outputs", () => {
    const educationDistributionFixture = {
      ...simpleW2Fixture,
      form1099Q: [
        {
          payerName: "State 529 Plan",
          accountType: "529" as const,
          grossDistribution: "12000",
          earnings: "2400",
          basis: "9600",
          isTrusteeToTrustee: false,
        },
        {
          payerName: "Trust Transfer",
          accountType: "coverdell_esa" as const,
          grossDistribution: "3000",
          earnings: "300",
          basis: "2700",
          isTrusteeToTrustee: true,
        },
      ],
      qualifiedEducationExpenses: {
        totalQualifiedExpenses: "8000",
        taxFreeEducationalAssistance: "1000",
        amountsUsedForEducationCredits: "500",
        penaltyExceptionScholarshipAmount: "250",
      },
    };

    const result = calculateFederalTax(educationDistributionFixture);
    if (!result.form1099Q) throw new Error("Expected calculated education distribution result");
    const summary = buildForm1099QReferenceSummary(
      educationDistributionFixture.form1099Q,
      result.form1099Q,
      educationDistributionFixture.qualifiedEducationExpenses,
    );

    expect(summary.title).toBe("Form 1099-Q Education Distribution Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.statementCount).toBe(2);
    expect(summary.forms).toEqual([
      {
        payerName: "State 529 Plan",
        accountType: "529 plan",
        box1GrossDistribution: "12000",
        box2Earnings: "2400",
        box3Basis: "9600",
        box4TrusteeToTrusteeTransfer: false,
      },
      {
        payerName: "Trust Transfer",
        accountType: "Coverdell ESA",
        box1GrossDistribution: "3000",
        box2Earnings: "300",
        box3Basis: "2700",
        box4TrusteeToTrusteeTransfer: true,
      },
    ]);
    expect(summary.qualifiedEducationExpenseInputs).toEqual([
      {
        label: "Total qualified education expenses",
        value: "8000",
      },
      {
        label: "Tax-free educational assistance",
        value: "1000",
      },
      {
        label: "Amounts used for education credits",
        value: "500",
      },
      {
        label: "Scholarship penalty exception amount",
        value: "250",
      },
      {
        label: "Military academy penalty exception amount",
        value: "Not provided",
      },
      {
        label: "Death exception",
        value: "Not provided",
      },
      {
        label: "Disability exception",
        value: "Not provided",
      },
    ]);
    expect(summary.lines).toEqual([
      {
        line: "gross-distribution",
        description: "Total gross distributions from all Form 1099-Q documents",
        value: "15000",
      },
      {
        line: "total-earnings",
        description: "Total earnings portion of distributions",
        value: "2700",
      },
      {
        line: "total-basis",
        description: "Total basis (contributions) portion of distributions",
        value: "12300",
      },
      {
        line: "adjusted-qee",
        description: "Adjusted Qualified Education Expenses",
        value: "6500",
      },
      {
        line: "taxable-earnings",
        description: "Taxable earnings from distributions exceeding adjusted QEE",
        value: "1100",
      },
      {
        line: "tax-free-earnings",
        description: "Tax-free earnings allocable to qualified education expenses",
        value: "1300",
      },
      {
        line: "penalty-amount",
        description: "10% additional tax on taxable earnings (before exceptions)",
        value: "110",
      },
      {
        line: "penalty-exception-amount",
        description: "Earnings exempt from the 10% additional tax due to exceptions",
        value: "250",
      },
      {
        line: "net-penalty",
        description: "Net 10% additional tax after exceptions",
        value: "85",
      },
    ]);
  });

  it("fillReturn includes a Form 1099-Q reference summary when education distribution statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const educationDistributionFixture = {
        ...simpleW2Fixture,
        form1099Q: [
          {
            payerName: "State 529 Plan",
            accountType: "529" as const,
            grossDistribution: "12000",
            earnings: "2400",
            basis: "9600",
            isTrusteeToTrustee: false,
          },
        ],
        qualifiedEducationExpenses: {
          totalQualifiedExpenses: "8000",
          taxFreeEducationalAssistance: "1000",
          amountsUsedForEducationCredits: "500",
          penaltyExceptionScholarshipAmount: "250",
        },
      };

      const result = calculateFederalTax(educationDistributionFixture);
      const { filledForms } = await fillReturn(educationDistributionFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_1099_Q_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      if (!referencePath) throw new Error("Expected education reference artifact");
      await access(referencePath);
      const pdfBytes = await readFile(referencePath);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 1099-Q reference summary when no education distribution statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_1099_Q_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
