/**
 * Spec: spec/federal/form-1099-r.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillReturn } from "@/pdf/fill-return.js";
import {
  buildForm1099RReferenceSummary,
  FORM_1099_R_REFERENCE_FILENAME,
} from "@/pdf/fill-form-1099-r.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-1099r-"));
}

describe("Form 1099-R packet reference summary", () => {
  it("fillForm1099RReference keeps the packet artifact reference-only and limited to supported federal line outputs", () => {
    const retirementFixture = {
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Fidelity",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "300",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
    };

    const result = calculateFederalTax(retirementFixture);
    const summary = buildForm1099RReferenceSummary(retirementFixture.form1099R, result.form1099R!);

    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.statementCount).toBe(1);
    expect(summary.lines.map((line) => line.line)).toEqual(["1", "2", "3", "4", "5"]);
    expect(summary.lines.map((line) => line.value)).toEqual(["0", "12000", "0", "0", "300"]);
  });

  it("fillReturn includes a Form 1099-R reference summary when retirement statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const retirementFixture = {
        ...simpleW2Fixture,
        form1099R: [
          {
            payer: "Fidelity",
            grossDistribution: "12000",
            taxableAmount: "12000",
            federalWithheld: "300",
            distributionCode: "7",
            iraSepSimple: true,
          },
        ],
      };

      const result = calculateFederalTax(retirementFixture);
      const { filledForms } = await fillReturn(retirementFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_1099_R_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 1099-R reference summary when no retirement statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_1099_R_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
