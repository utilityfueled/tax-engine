import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import Decimal from "decimal.js";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PAScheduleAResult } from "@/engine/state/pa-schedule-a.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);
const PA_SCHEDULE_A_INTEREST_TRIGGER = new Decimal(2500);

export const PA_SCHEDULE_A_REFERENCE_FILENAME = "pa-schedule-a-reference.pdf";

export interface PAScheduleAReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleAReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleAReferenceSummaryLine[];
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

export function shouldIncludePAScheduleAReferenceSummary(result: PAScheduleAResult) {
  return result.line1.gt(PA_SCHEDULE_A_INTEREST_TRIGGER)
    || [
      result.line2,
      result.line3,
      result.line5,
      result.line6,
      result.line7,
      result.line8,
      result.line11,
      result.line12,
      result.line13,
      result.line14,
      result.line15,
    ].some((line) => !line.isZero());
}

export function buildPAScheduleAReferenceSummary(
  result: PAScheduleAResult,
): PAScheduleAReferenceSummary {
  return {
    title: "Pennsylvania Schedule A Interest Income Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule A interest-income computation. It is not an official PA-40 Schedule A filing copy.",
    filingTrigger: "Attach when federal taxable interest exceeds $2,500 or when any Pennsylvania Schedule A adjustment line applies.",
    totals: [
      { label: "Line 1 federal taxable interest income", value: result.line1.toString() },
      { label: "Line 2 tax-exempt interest included federally", value: result.line2.toString() },
      { label: "Line 3 other addition adjustments", value: result.line3.toString() },
      { label: "Line 4 adjusted federal interest subtotal", value: result.line4.toString() },
      { label: "Line 5 federal Schedule K-1 interest", value: result.line5.toString() },
      { label: "Line 6 Pennsylvania direct-obligation interest", value: result.line6.toString() },
      { label: "Line 7 U.S. government direct-obligation interest", value: result.line7.toString() },
      { label: "Line 8 other reduction adjustments", value: result.line8.toString() },
      { label: "Line 9 total reductions", value: result.line9.toString() },
      { label: "Line 10 interest subtotal after reductions", value: result.line10.toString() },
      { label: "Line 11 annuity and endowment distributions", value: result.line11.toString() },
      { label: "Line 12 charitable gift annuity income", value: result.line12.toString() },
      { label: "Line 13 non-educational IRC Section 529 distributions", value: result.line13.toString() },
      { label: "Line 14 taxable health or medical savings distributions", value: result.line14.toString() },
      { label: "Line 15 Pennsylvania pass-through interest", value: result.line15.toString() },
      { label: "Line 16 PA-taxable interest income", value: result.line16.toString() },
    ],
  };
}

export async function fillPAScheduleAReference(
  result: PAScheduleAResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleAReferenceSummary(result);
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
  const outputPath = join(outputDir, PA_SCHEDULE_A_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
