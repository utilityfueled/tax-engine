/**
 * Spec: spec/federal/form-1098-e.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "node:child_process";
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
  it("distinguishes checked unchecked and unknown Box2 in the reference summary", () => {
    const forms = [
      { lender: "Actual checked", studentLoanInterestReceived: "87.89", box2ExcludesOriginationFeesOrCapitalizedInterest: true },
      { lender: "Actual unchecked", studentLoanInterestReceived: "600", box2ExcludesOriginationFeesOrCapitalizedInterest: false },
      { lender: "Legacy flag", studentLoanInterestReceived: "100", includesOriginationFeesOrCapitalizedInterest: true },
    ];
    const result = calculateFederalTax({ ...simpleW2Fixture, form1098E: forms });
    const summary = buildForm1098EReferenceSummary(forms, result);
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.forms.map(form => form.box2ExcludesOriginationFeesOrCapitalizedInterest)).toEqual([true, false, undefined]);
    expect(summary.forms.map(form => form.box2Description)).toEqual([
      "Box 2 checked: Box 1 does not include origination fees and/or capitalized interest for a loan made before September 1, 2004.",
      "Box 2 unchecked on the actual statement.",
      "Box 2 status unknown; any legacy inclusion flag remains unverified.",
    ]);
    expect(summary.totals[0]?.value).toBe("787.89");
  });

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
        box2ExcludesOriginationFeesOrCapitalizedInterest: undefined,
        box2Description: "Box 2 status unknown; any legacy inclusion flag remains unverified.",
      },
      {
        lender: "FedLoan",
        box1StudentLoanInterest: "400",
        box2ExcludesOriginationFeesOrCapitalizedInterest: undefined,
        box2Description: "Box 2 status unknown; any legacy inclusion flag remains unverified.",
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
            box2ExcludesOriginationFeesOrCapitalizedInterest: true,
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
      const text = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", "import sys,io; from pypdf import PdfReader; print(' '.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages))"], { input: pdfBytes, encoding: "utf8" }).replace(/\s+/g, " ");
      expect(text).toContain("REFERENCE SUMMARY ONLY");
      expect(text).toContain("Box 2 checked: Box 1 does not include origination fees and/or capitalized interest");
      expect(text).not.toContain("Box 2 indicator: includes");
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
