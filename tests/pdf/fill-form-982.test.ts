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
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

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
  it("buildForm982ReferenceSummary keeps the packet artifact reference-only and limited to supported exclusion and attribute-reduction outputs", () => {
    const result = calculateFederalTax(insolvencyFixture);
    const summary = buildForm982ReferenceSummary(result);

    expect(summary.title).toBe("Form 982 COD Attribute Reduction Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.exclusions).toEqual([
      {
        line: "1b",
        description: "Insolvency exclusion",
        value: "20000",
      },
    ]);
    expect(summary.reductions.map((line) => line.line)).toEqual([
      "part2-line4",
      "part2-line5",
      "part2-line6",
      "part2-line7",
      "part2-line8",
      "part2-line9",
      "part2-line10",
    ]);
    expect(summary.reductions.find((line) => line.line === "part2-line4")).toEqual({
      line: "part2-line4",
      description: "NOL carryforward reduction",
      value: "0",
      formula: "Reduce NOL by $0 (remaining: $0)",
    });
    expect(summary.totals).toEqual([
      {
        label: "Total excluded cancellation of debt",
        value: "20000",
      },
      {
        label: "Total Form 982 attribute reduction applied",
        value: "0",
      },
      {
        label: "Excluded amount not absorbed by supported attributes",
        value: "20000",
      },
    ]);
  });

  it("fillReturn includes a Form 982 reference summary when cancellation-of-debt exclusions produce a Form 982 computation", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(insolvencyFixture);
      const { filledForms } = await fillReturn(insolvencyFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
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
