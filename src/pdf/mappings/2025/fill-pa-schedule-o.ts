import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PAScheduleOResult } from "@/engine/state/pa-schedule-o.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_O_REFERENCE_FILENAME = "pa-schedule-o-reference.pdf";

export interface PAScheduleOReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleOReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleOReferenceSummaryLine[];
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);

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

function formatWholeDollar(value: string) {
  return `$${value}`;
}

export function shouldIncludePAScheduleOReferenceSummary(result: PAScheduleOResult) {
  return [
    result.section529TaxpayerTotal,
    result.section529SpouseTotal,
    result.ableTaxpayerTotal,
    result.ableSpouseTotal,
    result.medicalSavingsAccountDeduction,
    result.spouseMedicalSavingsAccountDeduction,
    result.healthSavingsAccountDeduction,
    result.spouseHealthSavingsAccountDeduction,
    result.studentLoanInterestDeduction,
    result.spouseStudentLoanInterestDeduction,
    result.totalOtherDeductions,
  ].some((line) => !line.isZero());
}

export function buildPAScheduleOReferenceSummary(
  result: PAScheduleOResult,
): PAScheduleOReferenceSummary {
  return {
    title: "Pennsylvania Schedule O Other Deductions Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule O other-deductions computation. It is not an official PA-40 Schedule O filing copy.",
    filingTrigger: "Attach when the resident return claims supported Pennsylvania Schedule O deductions for qualified tuition, PA ABLE, MSA, HSA, or student loan interest.",
    totals: [
      { label: "Line 2 total IRC Section 529 contributions", value: result.section529TaxpayerTotal.plus(result.section529SpouseTotal).toString() },
      { label: "Line 4 total IRC Section 529A contributions", value: result.ableTaxpayerTotal.plus(result.ableSpouseTotal).toString() },
      { label: "Line 5 medical savings account deduction", value: result.medicalSavingsAccountDeduction.plus(result.spouseMedicalSavingsAccountDeduction).toString() },
      { label: "Line 6 health savings account deduction", value: result.healthSavingsAccountDeduction.plus(result.spouseHealthSavingsAccountDeduction).toString() },
      { label: "Line 7 student loan interest deduction", value: result.studentLoanInterestDeduction.plus(result.spouseStudentLoanInterestDeduction).toString() },
      { label: "Line 8 deductions before income limitation", value: result.taxpayerDeductionsBeforeIncomeLimit.plus(result.spouseDeductionsBeforeIncomeLimit).toString() },
      { label: "Line 9 separately computed PA taxable income limit", value: result.taxpayerPATaxableIncome.plus(result.spousePATaxableIncome).toString() },
      { label: "Line 10 allowed deduction after limitation", value: result.taxpayerAllowedDeduction.plus(result.spouseAllowedDeduction).toString() },
      { label: "Line 11 total other deductions", value: result.totalOtherDeductions.toString() },
    ],
  };
}

export async function fillPAScheduleOReference(
  result: PAScheduleOResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleOReferenceSummary(result);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

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

  y = drawWrappedText(page, summary.filingTrigger, {
    font: regular,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y: y - 8,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  y -= 16;

  for (const total of summary.totals) {
    y = drawWrappedText(page, `${total.label}: ${formatWholeDollar(total.value)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 13,
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, PA_SCHEDULE_O_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
