import Decimal from "decimal.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine, TaxReturnResult } from "@/models/outputs.js";
import { d, sum } from "@/utils/decimal.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const SOCIAL_SECURITY_BENEFITS_WORKSHEET_REFERENCE_FILENAME =
  "social-security-benefits-worksheet-reference-filled.pdf";

export interface SocialSecurityBenefitsWorksheetReferenceLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface SocialSecurityBenefitsWorksheetReferenceSection {
  heading: string;
  lines: SocialSecurityBenefitsWorksheetReferenceLine[];
}

export interface SocialSecurityBenefitsWorksheetReferenceSummary {
  title: string;
  warningLabel: string;
  sections: SocialSecurityBenefitsWorksheetReferenceSection[];
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.replace(/×/g, " x ").replace(/→/g, "->").replace(/[−–—]/g, "-").replace(/[^\x20-\x7E\n\t]/g, "").trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = words[0] ?? "";

  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  lines.push(current);
  return lines;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  {
    font,
    size,
    x,
    y,
    maxWidth,
    lineHeight = size * 1.25,
    color = HEADER_COLOR,
  }: {
    font: PDFFont;
    size: number;
    x: number;
    y: number;
    maxWidth: number;
    lineHeight?: number;
    color?: ReturnType<typeof rgb>;
  },
) {
  const lines = wrapText(text, font, size, maxWidth);
  let cursorY = y;

  for (const line of lines) {
    page.drawText(line, { x, y: cursorY, font, size, color });
    cursorY -= lineHeight;
  }

  return cursorY;
}

function requireEqual(actual: Decimal, expected: Decimal, label: string) {
  if (!actual.isFinite() || !expected.isFinite() || !actual.eq(expected)) {
    throw new Error(`Social Security reference ${label} does not reconcile to its audited amount.`);
  }
}

function auditIndex(lines: CalculatedLine[]) {
  const index = new Map<string, CalculatedLine>();
  for (const line of lines) {
    const key = `${line.form}:${line.line}`;
    if (index.has(key)) throw new Error(`Social Security reference has duplicate audit line ${key}.`);
    index.set(key, line);
  }
  return (form: string, id: string): CalculatedLine => {
    const line = index.get(`${form}:${id}`);
    if (!line) throw new Error(`Social Security reference is missing audit line ${form}:${id}.`);
    if (!line.value.isFinite()) throw new Error(`Social Security reference audit line ${form}:${id} is not finite.`);
    return line;
  };
}

function referenceLine(line: CalculatedLine): SocialSecurityBenefitsWorksheetReferenceLine {
  return {line:line.line, description:line.description, value:line.value.toString(), formula:line.formula};
}

export function buildSocialSecurityBenefitsWorksheetReferenceSummary(
  input: TaxYearInput,
  result: TaxReturnResult,
): SocialSecurityBenefitsWorksheetReferenceSummary {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const worksheet = result.socialSecurityBenefitsWorksheet;
  if (!worksheet) throw new Error("Social Security Benefits Worksheet reference summary requires result.socialSecurityBenefitsWorksheet");
  const getAudit = auditIndex(worksheet.lines);
  const getReturnAudit = auditIndex(result.allLines.filter(line => line.form === "1040" && (line.line === "6a" || line.line === "6b")));
  const publication = worksheet.worksheetKind === "publication915";
  if (!publication && worksheet.worksheetKind !== "form1040") throw new Error("Social Security reference requires a known official worksheet kind.");
  if (publication ? !worksheet.exclusionsAdjustments.isPositive() : !worksheet.exclusionsAdjustments.isZero()) throw new Error("Social Security worksheet kind is inconsistent with actual exclusions.");
  const form = publication ? "Pub915 WS1" : "SS Worksheet";
  const finalId = publication ? "19" : "18";
  const mfsSkip = publication && input.taxpayer.filingStatus === "married_filing_separately" && input.taxpayer.livedWithSpouseAtAnyTimeDuringYear === true;
  const ids = Array.from({length:publication ? 19 : 18}, (_, index) => index + 1)
    .filter(number => !mfsSkip || number < 9 || number > 16).map(String);
  const selected = ids.map(id => getAudit(form, id));
  for (const line of worksheet.lines) {
    if (line.form === form && /^\d+$/.test(line.line) && !ids.includes(line.line)) throw new Error(`Social Security reference has unexpected audited line ${line.line}.`);
  }
  if (publication) requireEqual(getAudit(form,"5").value, worksheet.exclusionsAdjustments, "income exclusions");
  const standard = getAudit(form,finalId).value;
  requireEqual(standard, worksheet.standardTaxableBenefits, "standard taxable benefits");
  const ssaBenefits = sum(...(input.formSSA1099 ?? []).map(source => {
    if (source.netBenefits === undefined) throw new Error("Social Security reference requires actual SSA benefits.");
    return d(source.netBenefits);
  }));
  const rrbBenefits = sum(...(input.formRRB1099 ?? []).map(source => {
    if (source.netSocialSecurityEquivalentBenefitPortion === undefined) throw new Error("Social Security reference requires actual RRB benefits.");
    return d(source.netSocialSecurityEquivalentBenefitPortion);
  }));
  requireEqual(ssaBenefits.plus(rrbBenefits), result.socialSecurityBenefitsGross, "source benefit total");
  requireEqual(getAudit(form,"1").value, result.socialSecurityBenefitsGross, "worksheet gross benefits");
  requireEqual(getReturnAudit("1040","6a").value, result.socialSecurityBenefitsGross, "Form1040 gross benefits");
  requireEqual(getReturnAudit("1040","6b").value, result.socialSecurityBenefitsTaxable, "Form1040 taxable benefits");
  const sections: SocialSecurityBenefitsWorksheetReferenceSection[] = [{
    heading:"Benefit inputs",
    lines:[
      {line:"SSA-1099",description:"SSA-1099 Box 5 net benefits",value:ssaBenefits.toString(),formula:"Sum of supported SSA-1099 Box 5 net benefits"},
      {line:"RRB-1099",description:"RRB-1099 Box 5 tier 1 equivalent benefits",value:rrbBenefits.toString(),formula:"Sum of supported RRB-1099 Box 5 tier 1 equivalent benefits"},
      {line:"1040-6a",description:"Form 1040 Line 6a gross benefits",value:result.socialSecurityBenefitsGross.toString(),formula:"SSA-1099 total + RRB-1099 total"},
    ],
  }, {
    heading:publication ? "Publication 915 Worksheet 1" : "Social Security Benefits Worksheet",
    lines:selected.map(referenceLine),
  }];

  const electionAmount = worksheet.lumpSumElectionTaxableBenefits;
  if (electionAmount !== undefined) {
    const election = getAudit("SS Worksheet","W4-21");
    requireEqual(election.value, electionAmount, "lump-sum election amount");
    if (worksheet.usedLumpSumElection !== election.value.lt(standard)) throw new Error("Social Security lump-sum election choice is inconsistent with audited amounts.");
    const usedYears = new Set<number>();
    const earlierYearLines = worksheet.lumpSumElectionAdditionalBenefitsByYear.flatMap(entry => {
      if (usedYears.has(entry.taxYear)) throw new Error("Social Security reference has duplicate earlier-year sources.");
      usedYears.add(entry.taxYear);
      const earlier = getAudit("SS Worksheet",`W2-21 (${entry.taxYear})`);
      requireEqual(earlier.value, entry.additionalTaxableBenefits, "earlier-year additional benefits");
      const refigured = earlier.inputs["Refigured taxable benefits"];
      if (!Decimal.isDecimal(refigured) || !refigured.isFinite()) throw new Error("Social Security reference is missing finite refigured-benefit audit input.");
      requireEqual(refigured, entry.refiguredTaxableBenefits, "earlier-year refigured benefits");
      return [
        {line:`W2-21 (${entry.taxYear}) refigured`,description:"Earlier-year refigured taxable benefits",value:refigured.toString(),formula:"Actual refigured-benefit amount from the earlier-year Worksheet 2 audit"},
        {line:`W2-21 (${entry.taxYear}) additional`,description:earlier.description,value:earlier.value.toString(),formula:earlier.formula},
      ];
    });
    requireEqual(worksheet.usedLumpSumElection ? election.value : standard, worksheet.taxableBenefits, "selected taxable benefits");
    sections.push({heading:"Pub. 915 lump-sum election", lines:[
      {line:"standard",description:"Standard worksheet taxable benefits",value:standard.toString(),formula:`${publication ? "Publication 915 Worksheet 1 line 19" : "Social Security Benefits Worksheet Line 18"} before the election comparison`},
      {line:"W4-21",description:election.description,value:election.value.toString(),formula:election.formula},
      {line:"used",description:"Election used on Form 1040 Line 6b",value:worksheet.usedLumpSumElection ? "Yes" : "No",formula:"Election used only when it is lower than the standard worksheet amount"},
      ...earlierYearLines,
      {line:"1040-6b",description:"Form 1040 Line 6b taxable benefits",value:result.socialSecurityBenefitsTaxable.toString(),formula:"Final taxable Social Security benefits used on Form 1040 Line 6b"},
    ]});
  } else {
    if (worksheet.usedLumpSumElection || worksheet.lumpSumElectionAdditionalBenefitsByYear.length > 0) throw new Error("Social Security reference is missing its lump-sum election audit.");
    requireEqual(standard, worksheet.taxableBenefits, "selected taxable benefits");
  }
  requireEqual(worksheet.taxableBenefits, result.socialSecurityBenefitsTaxable, "final taxable benefits");
  return {title:"Social Security Benefits Worksheet Reference Summary",warningLabel:"REFERENCE SUMMARY ONLY",sections};
}

export async function fillSocialSecurityBenefitsWorksheetReference(
  input: TaxYearInput,
  result: TaxReturnResult,
  outputDir: string,
) {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildSocialSecurityBenefitsWorksheetReferenceSummary(input, result);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - PAGE_MARGIN;
  };

  y = drawWrappedText(page, summary.title, {
    font: bold,
    size: 20,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 24,
  });

  y = drawWrappedText(page, summary.warningLabel, {
    font: bold,
    size: 12,
    x: PAGE_MARGIN,
    y: y - 6,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 16,
    color: WARNING_COLOR,
  });

  y = drawWrappedText(
    page,
    "This page summarizes the supported Social Security Benefits Worksheet outputs that drive Form 1040 Lines 6a and 6b. It is not an official IRS worksheet page.",
    {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 8,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  y -= 12;

  for (const section of summary.sections) {
    if (y < 120) {
      newPage();
    }

    y = drawWrappedText(page, section.heading, {
      font: bold,
      size: 13,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 16,
    });

    y -= 6;

    for (const line of section.lines) {
      if (y < 130) {
        newPage();
      }

      y = drawWrappedText(page, `${line.line}  ${line.description}: ${line.value}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 13,
      });

      y = drawWrappedText(page, `Formula: ${line.formula}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 13,
      });

      y -= 6;
    }
  }

  await markReviewPdf(doc);
  const pdfBytes = await doc.save();
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, SOCIAL_SECURITY_BENEFITS_WORKSHEET_REFERENCE_FILENAME);
  await writeFile(outputPath, pdfBytes);
  return outputPath;
}
