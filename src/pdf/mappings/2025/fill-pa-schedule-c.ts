import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PAScheduleCResult } from "@/engine/state/pa-schedule-c.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_C_REFERENCE_FILENAME = "pa-schedule-c-reference.pdf";

export interface PAScheduleCReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleCReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleCReferenceSummaryLine[];
}

const PA_SCHEDULE_C_REFERENCE_LINES: Array<[label: string, key: keyof PAScheduleCResult]> = [
  ["Line 1a gross receipts or sales", "line1a"],
  ["Line 1b returns and allowances", "line1b"],
  ["Line 1c balance", "line1c"],
  ["Line 2 cost of goods sold and/or operations", "line2"],
  ["Line 3 gross profit", "line3"],
  ["Line 4 other income", "line4"],
  ["Line 5 total income", "line5"],
  ["Line 6 advertising", "line6"],
  ["Line 7 amortization", "line7"],
  ["Line 8 bad debts from sales or services", "line8"],
  ["Line 9 bank charges", "line9"],
  ["Line 10 car and truck expenses", "line10"],
  ["Line 11 commissions and fees", "line11"],
  ["Line 12 depletion", "line12"],
  ["Line 13a regular depreciation", "line13a"],
  ["Line 13b Section 179 expense", "line13b"],
  ["Line 14 dues and publications", "line14"],
  ["Line 15 employee benefit programs", "line15"],
  ["Line 16 freight", "line16"],
  ["Line 17 insurance", "line17"],
  ["Line 18 interest on business indebtedness", "line18"],
  ["Line 19 laundry and cleaning", "line19"],
  ["Line 20 legal and professional services", "line20"],
  ["Line 21 management fees", "line21"],
  ["Line 22 office supplies", "line22"],
  ["Line 23 pension and profit-sharing plans for employees", "line23"],
  ["Line 24 postage", "line24"],
  ["Line 25 rent on business property", "line25"],
  ["Line 26 repairs and maintenance", "line26"],
  ["Line 27 contract labor", "line27"],
  ["Line 28 supplies", "line28"],
  ["Line 29 taxes", "line29"],
  ["Line 30 telephone", "line30"],
  ["Line 31 travel and entertainment", "line31"],
  ["Line 32 utilities", "line32"],
  ["Line 33 wages", "line33"],
  ["Line 34 IDCs current expensing", "line34"],
  ["Line 35 IDCs amortization", "line35"],
  ["Line 36 start-up costs", "line36"],
  ["Line 37 other expenses", "line37"],
  ["Line 38 total expenses", "line38"],
  ["Line 39 net profit or loss", "line39"],
];

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

export function buildPAScheduleCReferenceSummary(
  result: PAScheduleCResult,
): PAScheduleCReferenceSummary {
  return {
    title: "Pennsylvania Schedule C Business Income Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule C business-income computation. It is not an official PA-40 Schedule C filing copy.",
    filingTrigger: "Attach whenever supported Pennsylvania Schedule C business income or deductions are present on the resident return.",
    totals: PA_SCHEDULE_C_REFERENCE_LINES.map(([label, key]) => ({
      label,
      value: result[key].toString(),
    })),
  };
}

export async function fillPAScheduleCReference(
  result: PAScheduleCResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleCReferenceSummary(result);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const startNewPage = () => {
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
    if (y <= PAGE_MARGIN + 20) {
      startNewPage();
    }

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
  const outputPath = join(outputDir, PA_SCHEDULE_C_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
