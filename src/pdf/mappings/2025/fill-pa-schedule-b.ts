import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PAScheduleBResult } from "@/engine/state/pa-schedule-b.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_B_REFERENCE_FILENAME = "pa-schedule-b-reference.pdf";

export interface PAScheduleBReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleBReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleBReferenceSummaryLine[];
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

export function shouldIncludePAScheduleBReferenceSummary(result: PAScheduleBResult) {
  return [
    result.line2,
    result.line3,
    result.line4,
    result.line5,
    result.line7,
    result.line8,
    result.line9a,
    result.line9b,
    result.line9c,
    result.line10,
    result.line11,
  ].some((line) => !line.isZero());
}

export function buildPAScheduleBReferenceSummary(
  result: PAScheduleBResult,
): PAScheduleBReferenceSummary {
  return {
    title: "Pennsylvania Schedule B Dividend Income Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule B dividend-income computation. It is not an official PA-40 Schedule B filing copy.",
    filingTrigger: "Attach when any amount appears on Schedule B Lines 2 through 11, excluding the derived Line 6 subtotal.",
    totals: [
      { label: "Line 1 dividend income from the federal return", value: result.line1.toString() },
      { label: "Line 2 dividend income from federal Schedule(s) K-1", value: result.line2.toString() },
      { label: "Line 3 Pennsylvania-exempt interest dividend income", value: result.line3.toString() },
      { label: "Line 4 other reduction adjustments", value: result.line4.toString() },
      { label: "Line 5 total reductions from federal dividend income", value: result.line5.toString() },
      { label: "Line 6 dividend subtotal after reductions", value: result.line6.toString() },
      { label: "Line 7 exempt-interest dividends from federal Form 1099-DIV Box 12", value: result.line7.toString() },
      { label: "Line 8 other increase adjustments", value: result.line8.toString() },
      { label: "Line 9a IRC Section 965 deemed foreign earnings and profits", value: result.line9a.toString() },
      { label: "Line 9b prior-year repatriation cash payments", value: result.line9b.toString() },
      { label: "Line 9c current-year repatriation cash payments", value: result.line9c.toString() },
      { label: "Line 10 capital gains distributions", value: result.line10.toString() },
      { label: "Line 11 dividend income from PA S corporations and partnerships", value: result.line11.toString() },
      { label: "Line 12 PA-taxable dividend income", value: result.line12.toString() },
    ],
  };
}

export async function fillPAScheduleBReference(
  result: PAScheduleBResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleBReferenceSummary(result);
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
  const outputPath = join(outputDir, PA_SCHEDULE_B_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
