import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ScheduleGLResult } from "@/engine/state/pa-schedule-g-l.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_GL_REFERENCE_FILENAME = "pa-schedule-g-l-reference.pdf";

export interface PAScheduleGLReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleGLReferenceStateRow {
  stateCode: string;
  incomeTaxableByBothStates: string;
  taxPaidToOtherState: string;
  paTaxOnSharedIncome: string;
  credit: string;
}

export interface PAScheduleGLReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleGLReferenceSummaryLine[];
  perStateRows: PAScheduleGLReferenceStateRow[];
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

export function shouldIncludePAScheduleGLReferenceSummary(result: ScheduleGLResult) {
  return result.totalCredit.gt(0);
}

export function buildPAScheduleGLReferenceSummary(
  result: ScheduleGLResult,
): PAScheduleGLReferenceSummary {
  return {
    title: "Pennsylvania Schedule G-L Resident Credit Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania resident credit for taxes paid to other states. It is not an official PA Schedule G-L filing copy and does not include the required copy of the other state's return.",
    filingTrigger: "Attach when a resident Pennsylvania return computes a positive credit for taxes paid to another state on the same income.",
    totals: [
      { label: "Pennsylvania tax liability cap", value: result.paTaxLiability.toString() },
      { label: "Total resident credit before PA tax cap", value: result.totalCreditBeforeCap.toString() },
      { label: "PA-40 resident credit after PA tax cap", value: result.totalCredit.toString() },
    ],
    perStateRows: result.perStateResults.map((entry) => ({
      stateCode: entry.stateCode,
      incomeTaxableByBothStates: entry.incomeTaxableByBothStates.toString(),
      taxPaidToOtherState: entry.taxPaidToOtherState.toString(),
      paTaxOnSharedIncome: entry.paTaxOnSharedIncome.toString(),
      credit: entry.credit.toString(),
    })),
  };
}

export async function fillPAScheduleGLReference(
  result: ScheduleGLResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleGLReferenceSummary(result);
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

  y -= 12;

  for (const row of summary.perStateRows) {
    y = drawWrappedText(page, `State ${row.stateCode}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });
    y = drawWrappedText(page, `Line 1 shared income: ${formatWholeDollar(row.incomeTaxableByBothStates)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(page, `Line 2 tax paid to ${row.stateCode}: ${formatWholeDollar(row.taxPaidToOtherState)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(page, `Line 3 PA tax on shared income: ${formatWholeDollar(row.paTaxOnSharedIncome)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(page, `Line 4 allowed credit: ${formatWholeDollar(row.credit)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y -= 6;
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, PA_SCHEDULE_GL_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
