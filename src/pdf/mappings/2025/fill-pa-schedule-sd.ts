import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ScheduleSDResult } from "@/engine/state/pa-schedule-sd.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_SD_REFERENCE_FILENAME = "pa-schedule-sd-reference.pdf";

export interface PAScheduleSDReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleSDReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleSDReferenceSummaryLine[];
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

export function shouldIncludePAScheduleSDReferenceSummary(_result: ScheduleSDResult) {
  return true;
}

export function buildPAScheduleSDReferenceSummary(
  result: ScheduleSDResult,
): PAScheduleSDReferenceSummary {
  return {
    title: "Pennsylvania PA-40 SD School District Tax Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania PA-40 SD school district tax computation. It is not an official PA-40 SD filing copy.",
    filingTrigger: "Attach when a resident return includes a supported PA-40 SD school district personal income tax computation, including fully forgiven or zero-balance outcomes that still require school district disclosure support in the packet.",
    totals: [
      { label: "Line 1 PA-40 taxable income (PSD method)", value: result.psdTaxBase.toString() },
      { label: "Line 2 earned income (EI method)", value: result.eiTaxBase.toString() },
      { label: "Line 3 selected tax base", value: result.taxBase.toString() },
      { label: "Line 4 other deductions", value: result.otherDeductions.toString() },
      { label: "Line 5 adjusted tax base", value: result.adjustedTaxBase.toString() },
      { label: "Line 6 school district income tax", value: result.grossTax.toString() },
      { label: "Line 7 Tax Forgiveness credit", value: result.forgivenessCredit.toString() },
      { label: "Line 8 net school district tax", value: result.netTax.toString() },
      { label: "Line 9 school district withholding", value: result.withholding.toString() },
      { label: "Line 10 estimated payments", value: result.estimatedPayments.toString() },
      { label: "Line 11 total payments and credits", value: result.totalPaymentsAndCredits.toString() },
      { label: "Line 12 overpayment", value: result.overpayment.toString() },
      { label: "Line 13 amount owed", value: result.amountOwed.toString() },
    ],
  };
}

export async function fillPAScheduleSDReference(
  result: ScheduleSDResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleSDReferenceSummary(result);
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
    y = drawWrappedText(page, `${total.label}: ${total.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 13,
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, PA_SCHEDULE_SD_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
