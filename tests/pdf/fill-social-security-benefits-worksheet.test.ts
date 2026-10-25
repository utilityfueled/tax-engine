/**
 * Spec: spec/federal/social-security-benefits-worksheet.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildSocialSecurityBenefitsWorksheetReferenceSummary,
  fillSocialSecurityBenefitsWorksheetReference,
  SOCIAL_SECURITY_BENEFITS_WORKSHEET_REFERENCE_FILENAME,
} from "@/pdf/fill-social-security-benefits-worksheet.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-ss-worksheet-"));
}

function actualExclusionFixture(lumpSum = false, marriedSeparate = false) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer:{...simpleW2Fixture.taxpayer, filingStatus:marriedSeparate ? "married_filing_separately" : "single", livedWithSpouseAtAnyTimeDuringYear:marriedSeparate},
    w2s:[{...simpleW2Fixture.w2s[0], wages:"30000"}],
    formSSA1099:[{netBenefits:"20000"}],
    form2555:{foreignEarnedIncome:"25000", qualifyingDays:365},
    ...(lumpSum ? {socialSecurityLumpSumElection:{currentYearExclusionsAdjustments:"25000", earlierYears:[{
      taxYear:2024, filingStatus:"single", benefitsReceivedInEarlierYear:"0", delayedBenefitsReceivedInCurrentYear:"5000",
      adjustedGrossIncome:"0", taxExemptInterest:"0", exclusionsAdjustments:"0", taxableBenefitsPreviouslyReported:"0",
    }]}} : {}),
  });
}

describe("Social Security Benefits Worksheet packet reference summary", () => {
  it("buildSocialSecurityBenefitsWorksheetReferenceSummary keeps the packet artifact reference-only and limited to supported worksheet outputs", () => {
    const socialSecurityFixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099Int: [
        {
          payer: "Bank",
          interestIncome: "25500",
          federalWithheld: "0",
          earlyWithdrawalPenalty: "0",
          usSavingsBondInterest: "0",
          taxExemptInterest: "0",
        },
      ],
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "11000",
          federalWithheld: "0",
        },
      ],
      socialSecurityLumpSumElection: {
        currentYearExclusionsAdjustments: "0",
        earlierYears: [
          {
            taxYear: 2024,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: "0",
            delayedBenefitsReceivedInCurrentYear: "2000",
            adjustedGrossIncome: "23000",
            taxExemptInterest: "0",
            exclusionsAdjustments: "0",
            taxableBenefitsPreviouslyReported: "0",
          },
        ],
      },
    };

    const result = calculateFederalTax(socialSecurityFixture);
    const summary = buildSocialSecurityBenefitsWorksheetReferenceSummary(socialSecurityFixture, result);

    expect(summary.title).toBe("Social Security Benefits Worksheet Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    const inputs = summary.sections.find(section => section.heading === "Benefit inputs");
    expect(inputs?.lines.map(line => [line.line, line.value])).toEqual([["SSA-1099","11000"],["RRB-1099","0"],["1040-6a","11000"]]);
    const current = summary.sections.find(section => section.heading === "Social Security Benefits Worksheet");
    expect(current?.lines.map(line => line.line)).toEqual(Array.from({length:18},(_,index)=>String(index+1)));
    expect(current?.lines.map(line => line.value)).toEqual(["11000","5500","25500","0","31000","0","31000","25000","6000","9000","0","6000","3000","3000","0","3000","9350","3000"]);
    const election = summary.sections.find(section => section.heading === "Pub. 915 lump-sum election");
    expect(election?.lines.map(line => [line.line,line.value])).toEqual([["standard","3000"],["W4-21","2500"],["used","Yes"],["W2-21 (2024) refigured","0"],["W2-21 (2024) additional","0"],["1040-6b","2500"]]);
  });

  it("fillReturn includes a Social Security Benefits Worksheet reference summary when benefits are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const socialSecurityFixture = {
        ...simpleW2Fixture,
        formSSA1099: [
          {
            recipient: "Jane Doe",
            netBenefits: "18000",
            federalWithheld: "1200",
          },
        ],
        formRRB1099: [
          {
            recipient: "Jane Doe",
            netSocialSecurityEquivalentBenefitPortion: "2000",
            federalWithheld: "150",
          },
        ],
      };

      const result = calculateFederalTax(socialSecurityFixture);
      const { filledForms } = await fillReturn(socialSecurityFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(SOCIAL_SECURITY_BENEFITS_WORKSHEET_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      if (!referencePath) throw new Error("Expected worksheet reference path");
      await access(referencePath);
      const pdfBytes = await readFile(referencePath);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Social Security Benefits Worksheet reference summary when no benefits are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(
        filledForms.some((path) => path.endsWith(SOCIAL_SECURITY_BENEFITS_WORKSHEET_REFERENCE_FILENAME))
      ).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("Social Security reference uses actual Pub915 exclusions and official line numbers", () => {
    const input = actualExclusionFixture();
    const result = calculateFederalTax(input);
    const summary = buildSocialSecurityBenefitsWorksheetReferenceSummary(input, result);
    const publication = summary.sections.find(section => section.heading === "Publication 915 Worksheet 1");
    expect(publication?.lines.map(line => line.line)).toEqual(Array.from({length:19},(_,index)=>String(index+1)));
    expect(publication?.lines.map(line => line.value)).toEqual(["20000","10000","5000","0","25000","40000","0","40000","25000","15000","9000","6000","9000","4500","4500","5100","9600","17000","9600"]);
    const marriedInput = actualExclusionFixture(false, true);
    const marriedResult = calculateFederalTax(marriedInput);
    const married = buildSocialSecurityBenefitsWorksheetReferenceSummary(marriedInput, marriedResult).sections.find(section => section.heading === "Publication 915 Worksheet 1");
    expect(married?.lines.map(line => line.line)).toEqual(["1","2","3","4","5","6","7","8","17","18","19"]);
    expect(married?.lines.find(line => line.line === "19")?.value).toBe("17000");
  });

  it("Social Security reference rejects incomplete inconsistent or wrong-year evidence", () => {
    const input = actualExclusionFixture(true);
    const result = calculateFederalTax(input);
    const worksheet = result.socialSecurityBenefitsWorksheet;
    if (!worksheet) throw new Error("Expected source worksheet");
    const finalLine = worksheet.lines.find(line => line.form === "Pub915 WS1" && line.line === "19");
    if (!finalLine) throw new Error("Expected final audited line");
    const invalid = [
      worksheet.lines.filter(line => line.line !== "19"),
      worksheet.lines.map(line => line.line === "19" ? {...line,form:"Other worksheet"} : line),
      [...worksheet.lines, finalLine],
      worksheet.lines.map(line => line.line === "5" ? {...line,value:new Decimal(NaN)} : line),
      worksheet.lines.filter(line => line.line !== "W4-21"),
      worksheet.lines.filter(line => line.line !== "W2-21 (2024)"),
      worksheet.lines.map(line => line.line === "W2-21 (2024)" ? {...line,inputs:{}} : line),
    ];
    for (const lines of invalid) expect(() => buildSocialSecurityBenefitsWorksheetReferenceSummary(input, {...result,socialSecurityBenefitsWorksheet:{...worksheet,lines}})).toThrow(/audit|line|finite|duplicate|missing/i);
    expect(() => buildSocialSecurityBenefitsWorksheetReferenceSummary(input, {...result,socialSecurityBenefitsWorksheet:{...worksheet,usedLumpSumElection:false}})).toThrow(/inconsistent/i);
    expect(() => buildSocialSecurityBenefitsWorksheetReferenceSummary(input, {...result,socialSecurityBenefitsWorksheet:{...worksheet,lumpSumElectionAdditionalBenefitsByYear:[...worksheet.lumpSumElectionAdditionalBenefitsByYear,...worksheet.lumpSumElectionAdditionalBenefitsByYear]}})).toThrow(/duplicate/i);
    expect(() => buildSocialSecurityBenefitsWorksheetReferenceSummary(input, {...result,taxYear:2026})).toThrow(/year/i);
    expect(() => buildSocialSecurityBenefitsWorksheetReferenceSummary({...input,taxpayer:{...input.taxpayer,taxYear:2026}}, {...result,taxYear:2026})).toThrow(/year|2026|mapping/i);
    expect(() => buildSocialSecurityBenefitsWorksheetReferenceSummary(input, {...result,socialSecurityBenefitsWorksheet:{...worksheet,exclusionsAdjustments:new Decimal("1")}})).toThrow(/reconcile|inconsistent/i);
    expect(() => buildSocialSecurityBenefitsWorksheetReferenceSummary(input, {...result,socialSecurityBenefitsGross:new Decimal("1")})).toThrow(/reconcile|inconsistent/i);
    expect(() => buildSocialSecurityBenefitsWorksheetReferenceSummary(input, {...result,socialSecurityBenefitsTaxable:new Decimal("1")})).toThrow(/reconcile|inconsistent/i);
    expect(() => buildSocialSecurityBenefitsWorksheetReferenceSummary(input, {...result,socialSecurityBenefitsWorksheet:undefined})).toThrow(/requires/i);
  });

  it("Social Security reference preserves the standard method when the lump-sum comparison is higher", () => {
    const input = actualExclusionFixture(true);
    const source = input.socialSecurityLumpSumElection?.earlierYears[0];
    if (!source || !input.socialSecurityLumpSumElection) throw new Error("Expected earlier-year source");
    const changed = {...input,socialSecurityLumpSumElection:{...input.socialSecurityLumpSumElection,earlierYears:[{...source,adjustedGrossIncome:"50000"}]}};
    const result = calculateFederalTax(changed);
    const election = buildSocialSecurityBenefitsWorksheetReferenceSummary(changed,result).sections.find(section=>section.heading === "Pub. 915 lump-sum election");
    expect(election?.lines.find(line=>line.line === "used")?.value).toBe("No");
    expect(election?.lines.find(line=>line.line === "W4-21")?.value).toBe("11725");
    expect(election?.lines.find(line=>line.line === "1040-6b")?.value).toBe("9600");
  });

  it("Social Security reference retains audited lump-sum comparison and every-page warning", async () => {
    const outputDir = await makeOutputDir();
    try {
      const input = actualExclusionFixture(true);
      const result = calculateFederalTax(input);
      const summary = buildSocialSecurityBenefitsWorksheetReferenceSummary(input, result);
      const election = summary.sections.find(section=>section.heading === "Pub. 915 lump-sum election");
      expect(election?.lines.find(line=>line.line === "standard")).toMatchObject({value:"9600",formula:"Publication 915 Worksheet 1 line 19 before the election comparison"});
      expect(election?.lines.find(line=>line.line === "W4-21")?.value).toBe("7475");
      expect(election?.lines.find(line=>line.line === "1040-6b")?.value).toBe("7475");
      const path = await fillSocialSecurityBenefitsWorksheetReference(input,result,outputDir);
      const pdf = await PDFDocument.load(await readFile(path));
      expect(pdf.getPageCount()).toBeGreaterThan(1);
      const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
      for (const page of pdf.getPages()) {
        const contents = page.node.Contents();
        const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
        const content = streams.map(value => pdf.context.lookup(value)).filter((value):value is PDFRawStream=>value instanceof PDFRawStream).map(stream=>Buffer.from(decodePDFRawStream(stream).decode()).toString()).join(" ");
        expect(content).toContain(noticeHex);
      }
    } finally { await rm(outputDir,{recursive:true,force:true}); }
  });

});
