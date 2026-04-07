/**
 * Spec: spec/federal/form-1098-e.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm1098EReferenceSummary,
  FORM_1098_E_REFERENCE_FILENAME,
} from "@/pdf/fill-form-1098-e.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-1098e-"));
}

describe("Form 1098-E packet reference summary", () => {
  it("fillForm1098EReference keeps the packet artifact reference-only and limited to supported student loan interest outputs", () => {
    const studentLoanFixture = {
      ...simpleW2Fixture,
      form1098E: [
        {
          lender: "Navient",
          studentLoanInterestReceived: "1800",
          includesOriginationFeesOrCapitalizedInterest: true,
        },
        {
          lender: "FedLoan",
          studentLoanInterestReceived: "400",
          includesOriginationFeesOrCapitalizedInterest: false,
        },
      ],
      adjustments: {
        studentLoanInterest: "125",
      },
    };

    const result = calculateFederalTax(studentLoanFixture);
    const summary = buildForm1098EReferenceSummary(studentLoanFixture.form1098E, result);

    expect(summary.title).toBe("Form 1098-E Student Loan Interest Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.statementCount).toBe(2);
    expect(summary.forms).toEqual([
      {
        lender: "Navient",
        box1StudentLoanInterest: "1800",
        includesOriginationFeesOrCapitalizedInterest: true,
      },
      {
        lender: "FedLoan",
        box1StudentLoanInterest: "400",
        includesOriginationFeesOrCapitalizedInterest: false,
      },
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Aggregated Form 1098-E Box 1 total",
        value: "2200",
      },
      {
        label: "Manual add-on interest used in supported aggregation",
        value: "125",
      },
      {
        label: "Combined student loan interest before Schedule 1 limits",
        value: "2325",
      },
      {
        label: "Schedule 1 Line 21 deduction",
        value: "2325",
      },
    ]);
  });

  it("fillReturn includes a Form 1098-E reference summary when student loan interest statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const studentLoanFixture = {
        ...simpleW2Fixture,
        form1098E: [
          {
            lender: "Navient",
            studentLoanInterestReceived: "1800",
            includesOriginationFeesOrCapitalizedInterest: true,
          },
        ],
        adjustments: {
          studentLoanInterest: "200",
        },
      };

      const result = calculateFederalTax(studentLoanFixture);
      const { filledForms } = await fillReturn(studentLoanFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_1098_E_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 1098-E reference summary when no student loan interest statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const manualOnlyFixture = {
        ...simpleW2Fixture,
        adjustments: {
          studentLoanInterest: "500",
        },
      };

      const result = calculateFederalTax(manualOnlyFixture);
      const { filledForms } = await fillReturn(manualOnlyFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_1098_E_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
