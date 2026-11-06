import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PAScheduleTResult } from "@/engine/state/pa-schedule-t.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_T_REFERENCE_FILENAME = "pa-schedule-t-reference.pdf";

export interface PAScheduleTReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleTReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleTReferenceSummaryLine[];
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

export function shouldIncludePAScheduleTReferenceSummary(result: PAScheduleTResult) {
  return result.totalTaxableWinnings.gt(0) || result.paTaxWithheld.gt(0);
}

export function buildPAScheduleTReferenceSummary(
  result: PAScheduleTResult,
): PAScheduleTReferenceSummary {
  return {
    title: "Pennsylvania Schedule T Gambling and Lottery Winnings Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule T gambling and lottery winnings computation. It is not an official PA Schedule T filing copy.",
    filingTrigger: "Attach when the Pennsylvania resident return reports taxable gambling or lottery winnings on PA-40 Line 8 or carries Pennsylvania W-2G withholding to PA-40 Line 13.",
    totals: [
      { label: "Line 1 Forms W-2G winnings", value: result.primary.formW2GWinnings.plus(result.spouse.formW2GWinnings).toString() },
      { label: "Line 2 other gambling and lottery winnings", value: result.primary.supplementalWinnings.plus(result.spouse.supplementalWinnings).toString() },
      { label: "Line 3 total winnings", value: result.totalWinnings.toString() },
      { label: "Line 4 wagering costs used", value: result.totalWageringCostsUsed.toString() },
      { label: "Line 5 net gambling winnings by spouse", value: result.totalTaxableWinnings.toString() },
      { label: "Line 6 total gambling and lottery winnings", value: result.totalTaxableGamblingIncome.toString() },
      { label: "Line 7 Pennsylvania tax withheld", value: result.paTaxWithheld.toString() },
      { label: "Excluded noncash Pennsylvania Lottery prizes", value: result.exemptPALotteryNoncashWinnings.toString() },
    ],
  };
}

export async function fillPAScheduleTReference(
  result: PAScheduleTResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleTReferenceSummary(result);
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
  const outputPath = join(outputDir, PA_SCHEDULE_T_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
