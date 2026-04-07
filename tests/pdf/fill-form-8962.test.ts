/**
 * Spec: spec/federal/form-8962.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm8962ReferenceSummary,
  FORM_8962_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8962.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8962-"));
}

const marketplaceFixture = {
  ...simpleW2Fixture,
  w2s: [
    {
      ...simpleW2Fixture.w2s[0],
      wages: "30000",
      federalWithheld: "3200",
      socialSecurityWages: "30000",
      socialSecurityWithheld: "1860",
      medicareWages: "30000",
      medicareWithheld: "435",
    },
  ],
  form1095A: [
    {
      marketplace: "Healthcare.gov",
      policyNumber: "POL-ACA-1001",
      monthlyPremiums: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        enrolleePremium: "400",
        slcsp: "500",
        advancePremiumTaxCredit: "300",
      })),
    },
  ],
};

describe("Form 8962 packet reference summary", () => {
  it("fillForm8962Reference keeps the packet artifact reference-only and limited to supported Form 1095-A and Form 8962 reconciliation outputs", () => {
    const result = calculateFederalTax(marketplaceFixture);
    const summary = buildForm8962ReferenceSummary(marketplaceFixture.form1095A, result);

    expect(summary.title).toBe("Form 8962 Premium Tax Credit Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.policyCount).toBe(1);
    expect(summary.policies).toEqual([
      {
        marketplace: "Healthcare.gov",
        policyNumber: "POL-ACA-1001",
        coveredMonths: "1-12",
        annualEnrollmentPremium: "4800",
        annualSLCSP: "6000",
        annualAdvancePTC: "3600",
      },
    ]);
    expect(summary.lines.map((line) => line.line)).toEqual([
      "1",
      "2",
      "3",
      "5",
      "7",
      "11a",
      "11b",
      "11c",
      "24",
      "25",
      "26",
      "27",
    ]);
    expect(summary.lines.find((line) => line.line === "1")?.value).toBe("1");
    expect(summary.lines.find((line) => line.line === "2")?.value).toBe("30000");
    expect(summary.lines.find((line) => line.line === "3")?.value).toBe("199.20318725099601594");
    expect(Number(summary.lines.find((line) => line.line === "5")?.value ?? "0")).toBeCloseTo(
      Number.parseFloat("0.019681274900398408"),
      15,
    );
    expect(summary.lines.find((line) => line.line === "7")?.value).toBe("590");
    expect(summary.lines.find((line) => line.line === "11a")?.value).toBe("4800");
    expect(summary.lines.find((line) => line.line === "11b")?.value).toBe("6000");
    expect(summary.lines.find((line) => line.line === "11c")?.value).toBe("3600");
    expect(summary.lines.find((line) => line.line === "24")?.value).toBe("4800");
    expect(summary.lines.find((line) => line.line === "25")?.value).toBe("3600");
    expect(summary.lines.find((line) => line.line === "26")?.value).toBe("1200");
    expect(summary.lines.find((line) => line.line === "27")?.value).toBe("0");
  });

  it("fillReturn includes a Form 8962 reference summary when marketplace statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(marketplaceFixture);
      const { filledForms } = await fillReturn(marketplaceFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_8962_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 8962 reference summary when no marketplace statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_8962_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
