/**
 * Spec: spec/federal/form-2555.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { calculateForm2555 } from "@/engine/forms/form-2555.js";
import { Form2555Schema } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm2555ReferenceSummary,
  fillForm2555Reference,
  FORM_2555_REFERENCE_FILENAME,
} from "@/pdf/fill-form-2555.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-2555-"));
}

function actualSourceResult() {
  return calculateForm2555(Form2555Schema.parse({
    taxYear: 2025, foreignEarnedIncome: "150000", qualifyingDays: 365, totalDaysInYear: 365,
    qualifiedHousingExpenses: "30000", isSelfEmployed: true, sourceFactsConfirmed: true,
    eligibilityConfirmed: true, electionsValidConfirmed: true, claimForeignEarnedIncomeExclusion: true,
    claimHousingExclusionOrDeduction: true, housingExpensesQualificationConfirmed: true,
    employerProvidedForeignEarnedIncome: "100000", deductionsAllocableToExcludedIncome: "5000",
    priorYearHousingDeductionCarryover: "0", priorYearIncomeExclusion: "0",
    housingLocationPeriods: [{ locationId: "default", days: 365 }], incomeSourceMappingConfirmed: true,
    partIV: { wages: "100000", businessPersonalServices: "50000", partnershipPersonalServices: "0",
      noncashLodging: "0", noncashMeals: "0", noncashCar: "0", noncashOther: "0", allowanceCostOfLiving: "0",
      allowanceFamily: "0", allowanceEducation: "0", allowanceHomeLeave: "0", allowanceQuarters: "0",
      allowanceOther: "0", otherEarnedIncome: "0", section119MealsAndLodging: "0" },
    incomeSources: { foreignEmploymentIncomeIncludedOnW2: "100000", foreignEmploymentIncomeNotOnW2: "0",
      foreignBusinessIncomeAlreadyReported: "50000", foreignPartnershipIncomeAlreadyReported: "0", otherForeignIncomeAlreadyReported: "0" },
  }), getConstants(2025));
}

describe("Form 2555 packet reference summary", () => {
  it("fillForm2555Reference keeps the packet artifact reference-only and limited to supported exclusion outputs", () => {
    const foreignEarnedIncomeFixture = {
      ...simpleW2Fixture,
      form2555: {
        foreignEarnedIncome: "90000",
        qualifyingDays: 365,
        totalDaysInYear: 365,
        qualifiedHousingExpenses: "30000",
        employerProvidedHousingAmount: "5000",
        employerProvidedForeignEarnedIncome: "90000",
        isSelfEmployed: false,
      },
    };

    const result = calculateFederalTax(foreignEarnedIncomeFixture);
    if (!result.form2555) throw new Error("Expected calculated Form2555");
    const summary = buildForm2555ReferenceSummary(result.form2555);

    expect(summary.title).toBe("Form 2555 Foreign Earned Income Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.introduction).toContain("unverified historical");
    expect(summary.lines.map(line => line.line)).toEqual(["26", "27", "28", "29b", ...Array.from({ length: 21 }, (_, i) => String(i + 30)), "carryover"]);
    expect(summary.lines.find(line => line.line === "36")?.value).toBe("9200");
    expect(summary.lines.find(line => line.line === "42")?.value).toBe("80800");
    expect(summary.lines.find(line => line.line === "45")?.value).toBe("90000");
    expect(summary.lines.find(line => line.line === "50")?.value).toBe("0");
  });

  it("fillReturn includes a Form 2555 reference summary when exclusion inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const foreignEarnedIncomeFixture = {
        ...simpleW2Fixture,
        form2555: {
          foreignEarnedIncome: "90000",
          qualifyingDays: 365,
          totalDaysInYear: 365,
          qualifiedHousingExpenses: "30000",
          employerProvidedHousingAmount: "5000",
          employerProvidedForeignEarnedIncome: "90000",
          isSelfEmployed: false,
        },
      };

      const result = calculateFederalTax(foreignEarnedIncomeFixture);
      const { filledForms } = await fillReturn(foreignEarnedIncomeFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_2555_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      if (!referencePath) throw new Error("Expected Form2555 review summary");
      await access(referencePath);
      const pdfBytes = await readFile(referencePath);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 2555 reference summary when no exclusion inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_2555_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("rejects missing duplicate nonfinite inconsistent wrong-form and wrong-year audits", () => {
    const result = actualSourceResult();
    const source = result.lines.find(line => line.line === "19");
    if (!source) throw new Error("Expected actual PartIV source");
    for (const lines of [
      result.lines.filter(line => line.line !== "45"), result.lines.filter(line => line.line !== "20a"),
      [...result.lines, source],
      result.lines.map(line => line.line === "45" ? { ...line, value: new Decimal("NaN") } : line),
      result.lines.map(line => line.line === "50" ? { ...line, value: new Decimal("999") } : line),
      result.lines.map(line => line.line === "42" ? { ...line, form: "Other Form" } : line),
    ]) expect(() => buildForm2555ReferenceSummary({ ...result, lines })).toThrow(/audit/i);
    expect(() => buildForm2555ReferenceSummary({ ...result, taxYear: 2026 })).toThrow(/year|mapping/i);
    expect(() => buildForm2555ReferenceSummary({ ...result, lines: result.lines.filter(line => Number.parseInt(line.line, 10) >= 26) })).toThrow(/audit/i);
  });

  it("copies complete actual PartIV audits and visibly marks every PDF page", async () => {
    const result = actualSourceResult();
    const summary = buildForm2555ReferenceSummary(result);
    expect(summary.introduction).toContain("confirmed actual");
    expect(summary.lines.find(line => line.line === "19")?.value).toBe("100000");
    expect(summary.lines.find(line => line.line === "20a")?.value).toBe("50000");
    expect(summary.lines.find(line => line.line === "45")?.value).toBe("131133");
    expect(summary.lines.find(line => line.line === "50")?.value).toBe("3067");
    const outputDir = await makeOutputDir();
    try {
      const path = await fillForm2555Reference(result, outputDir);
      const doc = await PDFDocument.load(await readFile(path));
      expect(doc.getPageCount()).toBeGreaterThan(1);
      expect(doc.getSubject()).toBe(REVIEW_PDF_NOTICE);
      const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
      for (const page of doc.getPages()) {
        const contents = page.node.Contents();
        const streams = contents instanceof PDFArray ? contents.asArray().map(ref => doc.context.lookup(ref)) : [contents];
        const text = streams.filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream).map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
        expect(text).toContain(noticeHex);
      }
    } finally { await rm(outputDir, { recursive: true, force: true }); }
  });

});
