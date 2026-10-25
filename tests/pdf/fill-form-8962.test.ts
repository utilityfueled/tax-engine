/**
 * Spec: spec/federal/form-8962.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import Decimal from "decimal.js";
import { PDFDocument } from "pdf-lib";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm8962ReferenceSummary,
  fillForm8962Reference,
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
    expect(summary.introduction).toContain("unverified historical");
    expect(summary.lines.map((line) => line.line)).toEqual([
      "1", "2a", "2b", "3", "4", "5", "7", "8a", "8b", "11a", "11b", "11c", "11d", "11e", "11f", "24", "25", "26", "27", "29",
    ]);
    const values = Object.fromEntries(summary.lines.map(line => [line.line, line.value]));
    expect(values).toEqual({
      "1": "1", "2a": "30000", "2b": "0", "3": "30000", "4": "15060", "5": "199",
      "7": "0.0196", "8a": "588", "8b": "49", "11a": "4800", "11b": "6000",
      "11c": "588", "11d": "5412", "11e": "4800", "11f": "3600",
      "24": "4800", "25": "3600", "26": "1200", "27": "0", "29": "0",
    });
  });

  it("rejects missing, duplicate or inconsistent reconciliation audits", () => {
    const calculated = calculateFederalTax(marketplaceFixture);
    const reconciliation = calculated.form8962;
    if (!reconciliation) throw new Error("Fixture must calculate Form 8962");
    const repayment = reconciliation.lines.find(line => line.line === "29");
    if (!repayment) throw new Error("Fixture must audit repayment");
    for (const lines of [
      reconciliation.lines.filter(line => line.line !== "29"),
      reconciliation.lines.filter(line => line.line !== "11f"),
      reconciliation.lines.filter(line => line.line !== "11c"),
      [...reconciliation.lines, repayment],
      reconciliation.lines.map(line => line.line === "29" ? { ...line, value: new Decimal(1) } : line),
    ]) {
      expect(() => buildForm8962ReferenceSummary(marketplaceFixture.form1095A, { ...calculated, form8962: { ...reconciliation, lines } })).toThrow(/audit/i);
    }
    const changedSource = marketplaceFixture.form1095A.map(form => ({ ...form, monthlyPremiums: form.monthlyPremiums.map(row => ({ ...row, advancePremiumTaxCredit: "301" })) }));
    expect(() => buildForm8962ReferenceSummary(changedSource, calculated)).toThrow(/source.*advance|advance.*source/i);
  });

  it("copies monthly audit columns and marks every reference page for review", async () => {
    const source = { ...marketplaceFixture, form1095A: marketplaceFixture.form1095A.map(form => ({ ...form, monthlyPremiums: form.monthlyPremiums.slice(0, 6) })) };
    const result = calculateFederalTax(source);
    const summary = buildForm8962ReferenceSummary(source.form1095A, result);
    expect(summary.lines.find(line => line.line === "12c")?.value).toBe("49");
    expect(summary.lines.find(line => line.line === "12e")?.value).toBe("400");
    expect(summary.lines.find(line => line.line === "11a")).toBeUndefined();
    const outputDir = await makeOutputDir();
    try {
      const path = await fillForm8962Reference(source.form1095A, result, outputDir);
      const pdf = await PDFDocument.load(await readFile(path));
      expect(pdf.getPageCount()).toBeGreaterThan(1);
      expect(pdf.getSubject()).toBe(REVIEW_PDF_NOTICE);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
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
