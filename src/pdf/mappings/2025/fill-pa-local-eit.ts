import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PALocalEITResult } from "@/engine/state/pa-local-eit.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_LOCAL_EIT_REFERENCE_FILENAME = "pa-local-eit-reference.pdf";

export interface PALocalEITReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface PALocalEITReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  municipality: string;
  totals: PALocalEITReferenceSummaryTotal[];
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

function formatAmountString(value: string) {
  return `$${value}`;
}

export function buildPALocalEITReferenceSummary(
  result: PALocalEITResult,
): PALocalEITReferenceSummary {
  return {
    title: "Pennsylvania Local Earned Income Tax Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported resident local EIT reconciliation. It is not an official local earned income tax return or filing copy.",
    municipality: result.municipality,
    totals: [
      { label: "Line 1 compensation", value: result.compensation.toString() },
      { label: "Line 2 net self-employment income", value: result.netSelfEmploymentIncome.toString() },
      { label: "Line 3 total earned income", value: result.totalEarnedIncome.toString() },
      { label: "Line 4 resident local EIT rate", value: `${result.localEITRate.times(100).toString()}%` },
      { label: "Line 5 computed local tax", value: result.computedLocalTax.toString() },
      { label: "Line 6 nonresident credit", value: result.nonresidentCredit.toString() },
      { label: "Line 7 net local tax", value: result.netLocalTax.toString() },
      { label: "Line 8 local withholding", value: result.localWithholding.toString() },
      { label: "Line 9 overpayment", value: result.overpayment.toString() },
      { label: "Line 10 balance due", value: result.balanceDue.toString() },
    ],
  };
}

export async function fillPALocalEITReference(
  result: PALocalEITResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPALocalEITReferenceSummary(result);
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

  y = drawWrappedText(
    page,
    `Resident municipality: ${summary.municipality}`,
    {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 8,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  y = drawWrappedText(
    page,
    summary.introduction,
    {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 8,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  y -= 16;

  for (const total of summary.totals) {
    const formattedValue = total.value.endsWith("%")
      ? total.value
      : formatAmountString(total.value);
    y = drawWrappedText(page, `${total.label}: ${formattedValue}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 13,
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, PA_LOCAL_EIT_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
