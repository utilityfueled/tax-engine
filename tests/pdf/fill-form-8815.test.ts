/**
 * Spec: spec/federal/form-8815.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { calculateForm8815 } from "@/engine/forms/form-8815.js";
import { SavingsBondRedemptionSchema, Form8815Schema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm8815ReferenceSummary,
  fillForm8815Reference,
  FORM_8815_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8815.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8815-"));
}

function sourceResult(count = 1, taxYear = 2025) {
  const redemptions = Array.from({length:count}, (_, index) => SavingsBondRedemptionSchema.parse({
    sourceId: `bond-${index}`, proceeds:"10000", bondType:"paper_ee", issueDate:"2005-01-01",
    redemptionDate:`${taxYear}-06-15`, ownerDateOfBirth:"1980-12-31", registeredOwner:"taxpayer",
    ownershipConfirmed:true, faceValue:"16000", priorYearInterestReported:"500",
  }));
  const facts = Form8815Schema.parse({sourceFactsConfirmed:true, currentStatementReconciliationConfirmed:true, priorYearInterestIncludedInCurrentStatements:"0", educationExpenses:[{
    sourceId:"college-A", beneficiaryName:"Synthetic Student", relationship:"dependent", dependentClaimed:true,
    institutionName:"Synthetic College", institutionAddress:"1 College Road, Example, NY10001", expenseType:"tuition_and_required_fees",
    paidTaxYear:taxYear, amountPaid:"10000", qualificationConfirmed:true, coordinationConfirmed:true,
    directInstitutionBenefits:"0", educationCreditExpenses:"0", taxFreeDistributionExpenses:"0", beneficiaryBenefits:"2000",
  }]});
  return {redemptions, result:calculateForm8815(redemptions, new Decimal("50000"), "single", {taxYear, facts})};
}

describe("Form 8815 packet reference summary", () => {
  it("buildForm8815ReferenceSummary keeps the packet artifact reference-only and limited to supported savings-bond outputs", () => {
    const savingsBondFixture = {
      ...simpleW2Fixture,
      savingsBondRedemptions: [
        {
          proceeds: "10000",
          interest: "500",
          qualifiedExpenses: "5000",
        },
        {
          proceeds: "5000",
          interest: "250",
          qualifiedExpenses: "2500",
        },
      ],
    };

    const result = calculateFederalTax(savingsBondFixture);
    if (!result.form8815) throw new Error("Expected Form 8815 result");
    const summary = buildForm8815ReferenceSummary(
      savingsBondFixture.savingsBondRedemptions,
      result.form8815,
    );

    expect(summary.title).toBe("Form 8815 Savings Bond Interest Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.redemptionCount).toBe(2);
    expect(summary.introduction).toContain("unverified historical");
    expect(summary.redemptions.map(row => ({proceeds: row.proceeds, interest: row.interest}))).toEqual([
      {proceeds: "10000", interest: "500"}, {proceeds: "5000", interest: "250"},
    ]);
    expect(summary.lines.map(line => line.line)).toEqual(Array.from({length:13}, (_, index) => String(index+2)));
    expect(Object.fromEntries(summary.lines.map(line => [line.line, line.value]))).toEqual({
      "2":"7500", "3":"0", "4":"7500", "5":"15000", "6":"750", "7":"0.5", "8":"375", "9":"85000", "10":"99500", "11":"0", "12":"0", "13":"0", "14":"375",
    });
    expect(summary.totals).toEqual([
      {
        label: "Schedule B Line 3 exclusion",
        value: "375",
      },
    ]);
  });

  it("fillReturn includes a Form 8815 reference summary when savings bond redemptions produce an exclusion claim", async () => {
    const outputDir = await makeOutputDir();

    try {
      const savingsBondFixture = {
        ...simpleW2Fixture,
        savingsBondRedemptions: [
          {
            proceeds: "10000",
            interest: "500",
            qualifiedExpenses: "6000",
          },
        ],
      };

      const result = calculateFederalTax(savingsBondFixture);
      const { filledForms } = await fillReturn(savingsBondFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_8815_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      if (!referencePath) throw new Error("Expected Form 8815 reference path");
      await access(referencePath);
      const pdfBytes = await readFile(referencePath);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 8815 reference summary when savings bond redemptions do not produce an exclusion claim", async () => {
    const outputDir = await makeOutputDir();

    try {
      const noExclusionFixture = {
        ...simpleW2Fixture,
        w2s: [{ ...simpleW2Fixture.w2s[0], wages: "130000", federalWithheld: "22000" }],
        savingsBondRedemptions: [
          {
            proceeds: "10000",
            interest: "500",
            qualifiedExpenses: "6000",
          },
        ],
      };

      const result = calculateFederalTax(noExclusionFixture);
      const { filledForms } = await fillReturn(noExclusionFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(result.form8815?.excludableSavingsBondInterest.toString()).toBe("0");
      expect(filledForms.some((path) => path.endsWith(FORM_8815_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("Form8815 reference rejects mismatched years incomplete audits and inconsistent totals", () => {
    const {redemptions, result} = sourceResult();
    const summary = () => buildForm8815ReferenceSummary(redemptions, result);
    expect(summary().lines.find(line => line.line === "14")?.value).toBe("1200");
    const year2026 = sourceResult(1, 2026);
    expect(() => buildForm8815ReferenceSummary(year2026.redemptions, year2026.result)).toThrow(/year|2026|mapping/i);
    const finalLine = result.lines.find(line => line.line === "14");
    if (!finalLine) throw new Error("Expected final exclusion audit");
    const invalid = [
      result.lines.filter(line => line.line !== "14"),
      result.lines.map(line => line.line === "14" ? {...line, form:"Other Form"} : line),
      [...result.lines, finalLine],
      result.lines.map(line => line.line === "4" ? {...line, value:new Decimal(NaN)} : line),
      result.lines.filter(line => line.line !== "6-worksheet-7"),
    ];
    for (const lines of invalid) expect(() => buildForm8815ReferenceSummary(redemptions, {...result, lines})).toThrow(/audit|line|finite|missing|duplicate/i);
    expect(() => buildForm8815ReferenceSummary(redemptions, {...result, totalProceeds:new Decimal("1")})).toThrow(/reconcile|inconsistent/i);
    expect(() => buildForm8815ReferenceSummary([], result)).toThrow(/source|redemption/i);
  });

  it("Form8815 source summary preserves worksheet amounts and every-page review warnings", async () => {
    const outputDir = await makeOutputDir();
    try {
      const {redemptions, result} = sourceResult(12);
      const summary = buildForm8815ReferenceSummary(redemptions, result);
      expect(summary.introduction).toContain("actual source");
      expect(summary.redemptions[0]).toMatchObject({proceeds:"10000", interest:"1500", principal:"8000"});
      expect(summary.lines.find(line => line.line === "6-worksheet-7")?.value).toBe("6000");
      expect(summary.lines.find(line => line.line === "2")?.value).toBe("10000");
      expect(summary.lines.find(line => line.line === "4")?.value).toBe("8000");
      const path = await fillForm8815Reference(redemptions, result, outputDir);
      const pdf = await PDFDocument.load(await readFile(path));
      expect(pdf.getPageCount()).toBeGreaterThan(1);
      const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
      for (const page of pdf.getPages()) {
        const contents = page.node.Contents();
        const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
        const content = streams.map(value => pdf.context.lookup(value)).filter((value):value is PDFRawStream => value instanceof PDFRawStream).map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString()).join(" ");
        expect(content).toContain(noticeHex);
      }
    } finally { await rm(outputDir, {recursive:true, force:true}); }
  });

});
