import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PAScheduleFResult } from "@/engine/state/pa-schedule-f.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_F_REFERENCE_FILENAME = "pa-schedule-f-reference.pdf";

export interface PAScheduleFReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleFReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleFReferenceSummaryLine[];
}

type PAScheduleFNumericKey = Exclude<keyof PAScheduleFResult, "lines">;

const PA_SCHEDULE_F_REFERENCE_LINES: Array<[label: string, key: PAScheduleFNumericKey]> = [
  ["Line 1 sales of livestock and other items bought for resale", "line1"],
  ["Line 2 cost or other basis of livestock and items bought for resale", "line2"],
  ["Line 3 net purchased livestock", "line3"],
  ["Line 4 sales of livestock, produce, grains, and other products raised", "line4"],
  ["Line 5a cooperative distributions", "line5a"],
  ["Line 5b cooperative non-income items", "line5b"],
  ["Line 6 net cooperative distributions", "line6"],
  ["Line 7a agricultural program payments", "line7a"],
  ["Line 7b agricultural program materials and services", "line7b"],
  ["Line 8 commodity credit loans under election or forfeited", "line8"],
  ["Line 9 crop insurance proceeds", "line9"],
  ["Excluded prior-year deferred crop insurance", "excludedPriorYearDeferredCropInsurance"],
  ["Line 10 machine work", "line10"],
  ["Line 11 other income", "line11"],
  ["Line 12 gross income", "line12"],
  ["Line 13 breeding fees", "line13"],
  ["Line 14 chemicals", "line14"],
  ["Line 15 conservation expenses", "line15"],
  ["Conservation carryforward", "conservationCarryforward"],
  ["Line 16a regular depreciation", "line16a"],
  ["Line 16b Section 179 expense", "line16b"],
  ["Line 17 employee benefit programs", "line17"],
  ["Line 18 feed", "line18"],
  ["Line 19 fertilizers and lime", "line19"],
  ["Line 20 freight and trucking", "line20"],
  ["Line 21 gasoline, fuel, and oil", "line21"],
  ["Line 22 insurance", "line22"],
  ["Line 23a labor hired", "line23a"],
  ["Line 23b jobs credit", "line23b"],
  ["Line 23c balance", "line23c"],
  ["Line 24 land clearing", "line24"],
  ["Line 25 machine hire", "line25"],
  ["Line 26 mortgage interest", "line26"],
  ["Line 27 other interest", "line27"],
  ["Line 28 pension and profit-sharing plans for employees", "line28"],
  ["Line 29 rent of farm or pasture", "line29"],
  ["Line 30 repairs and maintenance", "line30"],
  ["Line 31 seeds and plants purchased", "line31"],
  ["Line 32 storage and warehousing", "line32"],
  ["Line 33 supplies purchased", "line33"],
  ["Line 34 taxes", "line34"],
  ["Line 35 utilities", "line35"],
  ["Line 36 veterinary fees and medicine", "line36"],
  ["Line 37 total other expenses", "line37"],
  ["Line 38 total expenses", "line38"],
  ["Line 39 net farm profit or loss", "line39"],
  ["Line 40 accrual sales during year", "line40"],
  ["Line 41a accrual agricultural program payments", "line41a"],
  ["Line 41b accrual materials and services", "line41b"],
  ["Line 42 accrual commodity credit loans", "line42"],
  ["Line 43 accrual machine work", "line43"],
  ["Line 44 accrual other income", "line44"],
  ["Line 45 total accrual gross receipts", "line45"],
  ["Line 46 beginning inventory", "line46"],
  ["Line 47 purchases during year", "line47"],
  ["Line 48 inventory plus purchases", "line48"],
  ["Line 49 ending inventory", "line49"],
  ["Line 50 cost of products sold", "line50"],
  ["Line 51 accrual-method gross income", "line51"],
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

export function shouldIncludePAScheduleFReferenceSummary(result: PAScheduleFResult) {
  return PA_SCHEDULE_F_REFERENCE_LINES.some(([, key]) => !result[key].isZero());
}

export function buildPAScheduleFReferenceSummary(
  result: PAScheduleFResult,
): PAScheduleFReferenceSummary {
  return {
    title: "Pennsylvania Schedule F Farm Income Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule F farm-income computation. It is not an official PA-40 Schedule F filing copy.",
    filingTrigger: "Attach whenever supported Pennsylvania farm-income or farm-expense input is present on the resident return.",
    totals: PA_SCHEDULE_F_REFERENCE_LINES.map(([label, key]) => ({
      label,
      value: result[key].toString(),
    })),
  };
}

export async function fillPAScheduleFReference(
  result: PAScheduleFResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleFReferenceSummary(result);

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
  const outputPath = join(outputDir, PA_SCHEDULE_F_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
