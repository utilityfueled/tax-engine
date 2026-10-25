import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ScheduleSPResult } from "@/engine/state/pa-schedule-sp.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_SP_REFERENCE_FILENAME = "pa-schedule-sp-reference.pdf";

export interface PAScheduleSPReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleSPReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleSPReferenceSummaryLine[];
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

export function shouldIncludePAScheduleSPReferenceSummary(result: ScheduleSPResult) {
  return result.taxForgivenessCredit.gt(0);
}

export function buildPAScheduleSPReferenceSummary(
  result: ScheduleSPResult,
): PAScheduleSPReferenceSummary {
  return {
    title: "Pennsylvania Schedule SP Tax Forgiveness Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule SP tax-forgiveness computation. It is not an official PA Schedule SP filing copy.",
    filingTrigger: "Attach when the Pennsylvania return claims Tax Forgiveness on PA-40 Line 21. Pennsylvania directs eligible taxpayers to complete PA Schedule SP to receive Tax Forgiveness.",
    totals: [
      { label: "Line A-1 PA taxable income", value: result.paTaxableIncome.toString() },
      { label: "Line A-2 nontaxable income additions", value: result.nontaxableIncome.toString() },
      { label: "Line A-3 total eligibility income", value: result.eligibilityIncome.toString() },
      { label: "Line B-3 100% forgiveness threshold", value: result.baseThreshold.toString() },
      { label: "Line B-4 forgiveness percentage", value: `${result.forgivenessPercentage.toString()}%` },
      { label: "Line C-1 PA tax liability", value: result.taxLiability.toString() },
      { label: "Line C-1a tax paid to other states or countries", value: result.taxPaidToOtherStates.toString() },
      { label: "Line C-1b tax eligible for forgiveness", value: result.taxLiabilityAfterOtherStateTaxes.toString() },
      { label: "Line C-2 tax forgiveness credit", value: result.taxForgivenessCredit.toString() },
    ],
  };
}

export async function fillPAScheduleSPReference(
  result: ScheduleSPResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleSPReferenceSummary(result);
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
    const renderedValue = total.value.endsWith("%")
      ? total.value
      : formatWholeDollar(total.value);
    y = drawWrappedText(page, `${total.label}: ${renderedValue}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 13,
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, PA_SCHEDULE_SP_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
