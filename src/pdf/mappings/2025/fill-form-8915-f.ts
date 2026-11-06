import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form8915FInput } from "@/models/inputs.js";
import type { Form8915FResult } from "@/engine/forms/form-8915-f.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_8915_F_LINES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;

const INCLUDED_FORM_8915_F_LINE_SET = new Set<string>(INCLUDED_FORM_8915_F_LINES);

export const FORM_8915_F_REFERENCE_FILENAME = "f8915f-reference-filled.pdf";

export interface Form8915FReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form8915FReferenceSummaryCurrentYearDistribution {
  disasterName: string;
  qualifiedAmount: string;
  repayments: string;
  netAfterRepayments: string;
  currentYearIncludable: string;
  deferredToFutureYears: string;
  iraPortionOfIncludable: string;
  pensionPortionOfIncludable: string;
  electFullInclusion: boolean;
}

export interface Form8915FReferenceSummaryPriorYearDeferral {
  disasterName: string;
  distributionYear: number;
  spreadYear: number;
  annualSpreadAmount: string;
  remainingBefore: string;
  repayments: string;
  includableThisYear: string;
  iraPortionOfIncludable: string;
  pensionPortionOfIncludable: string;
}

export interface Form8915FReferenceSummaryCarryforward {
  disasterName: string;
  distributionYear: number;
  spreadYear: number;
  annualSpreadAmount: string;
  remainingDeferredBalance: string;
  iraFraction: string;
}

export interface Form8915FReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form8915FReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  lines: Form8915FReferenceSummaryLine[];
  currentYearDistributions: Form8915FReferenceSummaryCurrentYearDistribution[];
  priorYearDeferrals: Form8915FReferenceSummaryPriorYearDeferral[];
  carryforwardDeferrals: Form8915FReferenceSummaryCarryforward[];
  totals: Form8915FReferenceSummaryTotal[];
}

function sanitizePdfText(text: string) {
  return text
    .replace(/×/g, " x ")
    .replace(/→/g, "->")
    .replace(/[−–—]/g, "-")
    .replace(/[^\x20-\x7E\n\t]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = sanitizePdfText(text).trim().split(/\s+/).filter(Boolean);

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

function normalizeDistributionYear(distributionYear: number, taxYear: number) {
  return distributionYear > 0 ? distributionYear : taxYear;
}

function getReferenceLines(result: Form8915FResult) {
  return result.lines
    .filter((line) => INCLUDED_FORM_8915_F_LINE_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_8915_F_LINES.indexOf(left.line as typeof INCLUDED_FORM_8915_F_LINES[number])
        - INCLUDED_FORM_8915_F_LINES.indexOf(right.line as typeof INCLUDED_FORM_8915_F_LINES[number]),
    );
}

export function shouldIncludeForm8915FReferenceSummary(form8915F: Form8915FInput | undefined) {
  if (!form8915F) {
    return false;
  }

  return form8915F.currentYearDistributions.length > 0 || form8915F.priorYearDeferrals.length > 0;
}

export function buildForm8915FReferenceSummary(
  form8915F: Form8915FInput,
  taxYear: number,
  result: Form8915FResult,
): Form8915FReferenceSummary {
  return {
    title: "Form 8915-F Qualified Disaster Distribution Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: `Computed from ${form8915F.currentYearDistributions.length} current-year disaster distribution entr${form8915F.currentYearDistributions.length === 1 ? "y" : "ies"} and ${form8915F.priorYearDeferrals.length} prior-year deferral entr${form8915F.priorYearDeferrals.length === 1 ? "y" : "ies"} in the supported Form 8915-F slice.`,
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: line.description,
      value: line.value.toString(),
      formula: sanitizePdfText(line.formula),
    })),
    currentYearDistributions: result.currentYearDetail.map((detail) => ({
      disasterName: detail.disasterName,
      qualifiedAmount: detail.qualifiedAmount.toString(),
      repayments: detail.repayments.toString(),
      netAfterRepayments: detail.netAfterRepayments.toString(),
      currentYearIncludable: detail.currentYearIncludable.toString(),
      deferredToFutureYears: detail.deferredToFutureYears.toString(),
      iraPortionOfIncludable: detail.iraPortionOfIncludable.toString(),
      pensionPortionOfIncludable: detail.pensionPortionOfIncludable.toString(),
      electFullInclusion: detail.electFullInclusion,
    })),
    priorYearDeferrals: result.priorYearDetail.map((detail) => ({
      disasterName: detail.disasterName,
      distributionYear: detail.distributionYear,
      spreadYear: detail.spreadYear,
      annualSpreadAmount: detail.annualSpreadAmount.toString(),
      remainingBefore: detail.remainingBefore.toString(),
      repayments: detail.repayments.toString(),
      includableThisYear: detail.includableThisYear.toString(),
      iraPortionOfIncludable: detail.iraPortionOfIncludable.toString(),
      pensionPortionOfIncludable: detail.pensionPortionOfIncludable.toString(),
    })),
    carryforwardDeferrals: result.carryforwardDeferrals.map((detail) => ({
      disasterName: detail.disasterName,
      distributionYear: normalizeDistributionYear(detail.distributionYear, taxYear),
      spreadYear: detail.spreadYear,
      annualSpreadAmount: detail.annualSpreadAmount,
      remainingDeferredBalance: detail.remainingDeferredBalance,
      iraFraction: detail.iraFraction,
    })),
    totals: [
      {
        label: "Form 1040 Line 4b IRA disaster amount",
        value: result.line7.toString(),
      },
      {
        label: "Form 1040 Line 5b pension disaster amount",
        value: result.line8.toString(),
      },
      {
        label: "Form 5329 penalty exception amount",
        value: result.line9.toString(),
      },
      {
        label: "Deferred amount tracked forward",
        value: result.line10.toString(),
      },
    ],
  };
}

export async function fillForm8915FReference(
  form8915F: Form8915FInput,
  taxYear: number,
  result: Form8915FResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm8915FReferenceSummary(form8915F, taxYear, result);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - PAGE_MARGIN;
  };

  const ensureSpace = (minimumY: number) => {
    if (y < minimumY) {
      newPage();
    }
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

  y = drawWrappedText(page, summary.introduction, {
    font: regular,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y: y - 8,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  y = drawWrappedText(
    page,
    "This page summarizes supported Form 8915-F computations that can affect Form 1040 Lines 4b and 5b, Form 5329 penalty relief, and future-year carryforward tracking. It is not an official filed Form 8915-F.",
    {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 10,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  y -= 16;

  ensureSpace(130);
  y = drawWrappedText(page, "Computed lines", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const line of summary.lines) {
    ensureSpace(110);
    y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 4,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });
    y = drawWrappedText(page, `Value: ${line.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(page, `Formula: ${line.formula}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y -= 5;
  }

  const drawSectionHeader = (title: string) => {
    ensureSpace(120);
    y -= 8;
    y = drawWrappedText(page, title, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });
  };

  const drawDetailRow = (label: string, value: string) => {
    y = drawWrappedText(page, `${label}: ${value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  };

  drawSectionHeader("Current-year distributions");
  if (summary.currentYearDistributions.length === 0) {
    drawDetailRow("Status", "No supported current-year qualified disaster distributions included");
  } else {
    for (const [index, detail] of summary.currentYearDistributions.entries()) {
      ensureSpace(145);
      y = drawWrappedText(page, `${index + 1}. ${detail.disasterName}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y: y - 4,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 14,
      });
      drawDetailRow("Qualified amount", detail.qualifiedAmount);
      drawDetailRow("Repayments", detail.repayments);
      drawDetailRow("Net after repayments", detail.netAfterRepayments);
      drawDetailRow("Current-year includable", detail.currentYearIncludable);
      drawDetailRow("Deferred to future years", detail.deferredToFutureYears);
      drawDetailRow("IRA portion", detail.iraPortionOfIncludable);
      drawDetailRow("Pension portion", detail.pensionPortionOfIncludable);
      drawDetailRow("Election", detail.electFullInclusion ? "Full inclusion" : "3-year spread");
      y -= 4;
    }
  }

  drawSectionHeader("Prior-year deferrals");
  if (summary.priorYearDeferrals.length === 0) {
    drawDetailRow("Status", "No supported prior-year Form 8915-F deferrals included");
  } else {
    for (const [index, detail] of summary.priorYearDeferrals.entries()) {
      ensureSpace(145);
      y = drawWrappedText(page, `${index + 1}. ${detail.disasterName}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y: y - 4,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 14,
      });
      drawDetailRow("Distribution year", detail.distributionYear.toString());
      drawDetailRow("Spread year", detail.spreadYear.toString());
      drawDetailRow("Annual spread amount", detail.annualSpreadAmount);
      drawDetailRow("Remaining before", detail.remainingBefore);
      drawDetailRow("Repayments", detail.repayments);
      drawDetailRow("Includable this year", detail.includableThisYear);
      drawDetailRow("IRA portion", detail.iraPortionOfIncludable);
      drawDetailRow("Pension portion", detail.pensionPortionOfIncludable);
      y -= 4;
    }
  }

  drawSectionHeader("Carryforward tracking");
  if (summary.carryforwardDeferrals.length === 0) {
    drawDetailRow("Status", "No supported carryforward deferrals remain after the current year");
  } else {
    for (const [index, detail] of summary.carryforwardDeferrals.entries()) {
      ensureSpace(125);
      y = drawWrappedText(page, `${index + 1}. ${detail.disasterName}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y: y - 4,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 14,
      });
      drawDetailRow("Distribution year", detail.distributionYear.toString());
      drawDetailRow("Next spread year", detail.spreadYear.toString());
      drawDetailRow("Annual spread amount", detail.annualSpreadAmount);
      drawDetailRow("Remaining deferred balance", detail.remainingDeferredBalance);
      drawDetailRow("IRA fraction", detail.iraFraction);
      y -= 4;
    }
  }

  drawSectionHeader("Routing totals");
  for (const total of summary.totals) {
    ensureSpace(90);
    drawDetailRow(total.label, total.value);
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_8915_F_REFERENCE_FILENAME);
  const pdfBytes = await doc.save();
  await writeFile(outputPath, pdfBytes);
  return outputPath;
}
