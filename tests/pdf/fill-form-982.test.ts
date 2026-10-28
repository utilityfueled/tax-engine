/**
 * Spec: spec/federal/form-982.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm982ReferenceSummary,
  FORM_982_REFERENCE_FILENAME,
} from "@/pdf/fill-form-982.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { prepareCodNolReview } from "@/pdf/cod-nol-review-context.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { actualCodBasisCapInput } from "../fixtures/cod-ordinary-attributes.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-982-"));
}

const insolvencyFixture = {
  ...simpleW2Fixture,
  form1099C: [
    {
      creditor: "Chase Bank",
      amountDischarged: "30000",
      personallyLiable: true,
    },
  ],
  codExclusion: {
    insolvency: {
      totalLiabilities: "200000",
      totalAssets: "180000",
    },
  },
};

describe("Form 982 packet reference summary", () => {
  it("retains the original aggregate-only insolvency specimen as an explicit source rejection", () => {
    expect(() => calculateFederalTax(insolvencyFixture)).toThrow(/COD.*actual.*attribute|COD.*complete.*source/i);
  });

  it("buildForm982ReferenceSummary keeps the packet artifact reference-only and limited to supported exclusion and attribute-reduction outputs", () => {
    const result = calculateFederalTax(actualCodBasisCapInput());
    const summary = buildForm982ReferenceSummary(result);

    expect(summary.title).toBe("Form 982 Insolvency and Attribute Reduction Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.exclusions).toEqual([
      {
        line: "1b",
        description: "Insolvency exclusion",
        value: "1500",
      },
    ]);
    expect(summary.reductions.map((line) => line.line)).toEqual([
      "6", "7", "8", "9", "10a", "12", "13",
    ]);
    expect(summary.reductions.find((line) => line.line === "6")).toEqual({
      line: "6",
      description: "Regular net operating loss attribute reduction",
      value: "0",
      formula: "Current-year original NOL first; then oldest carryover to this year before residual expiry. Actual current deductions are unchanged.",
    });
    expect(summary.reductions.find((line) => line.line === "10a")).toEqual(expect.objectContaining({ value: "100" }));
    expect(summary.totals).toEqual(expect.arrayContaining([
      { label: "Line2 reported excluded debt", value: "1500" },
      { label: "Regular property basis attribute reduction", value: "100" },
      { label: "Regular unreduced excluded debt", value: "1400" },
      { label: "Regular remaining property basis", value: "5400" },
    ]));
  });

  it("fillReturn includes a Form 982 reference summary when cancellation-of-debt exclusions produce a Form 982 computation", async () => {
    const outputDir = await makeOutputDir();

    try {
      const input = actualCodBasisCapInput(), result = calculateFederalTax(input);
      const { filledForms } = await fillReturn(redactReviewIdentifiers(input), result, {
        blankFormsDir: "forms/blank",
        outputDir,
        codNolReview: prepareCodNolReview(input),
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_982_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 982 reference summary when cancellation-of-debt income is fully taxable", async () => {
    const outputDir = await makeOutputDir();

    try {
      const taxableFixture = {
        ...simpleW2Fixture,
        form1099C: [
          {
            creditor: "Medical Center",
            amountDischarged: "12000",
            personallyLiable: true,
          },
        ],
      };
      const result = calculateFederalTax(taxableFixture);
      const { filledForms } = await fillReturn(taxableFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_982_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
