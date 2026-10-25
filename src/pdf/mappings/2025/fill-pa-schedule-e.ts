import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PAScheduleEResult } from "@/engine/state/pa-schedule-e.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_E_REFERENCE_FILENAME = "pa-schedule-e-reference.pdf";

export interface PAScheduleEReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleEReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleEReferenceSummaryLine[];
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

export function shouldIncludePAScheduleEReferenceSummary(result: PAScheduleEResult) {
  return result.properties.length > 0
    || !result.miscRents.isZero()
    || !result.miscRoyalties.isZero()
    || !result.passThroughNetIncome.isZero()
    || !result.reportableNetRentalRoyaltyIncome.isZero();
}

export function buildPAScheduleEReferenceSummary(
  result: PAScheduleEResult,
): PAScheduleEReferenceSummary {
  const totals: PAScheduleEReferenceSummaryLine[] = [
    { label: "Supported rental properties summarized", value: String(result.properties.length) },
    { label: "Line 1 gross rents from directly owned property", value: result.propertyGrossRents.toString() },
    { label: "Line 2 allowable expenses for directly owned property", value: result.totalAllowableExpenses.toString() },
    { label: "Line 3 net income or loss from directly owned property", value: result.propertyNetIncome.toString() },
    { label: "Line 4 Form 1099-MISC rents and royalties", value: result.miscRents.plus(result.miscRoyalties).toString() },
    { label: "Line 5 pass-through rental and royalty income", value: result.passThroughNetIncome.toString() },
    { label: "Line 6 combined Schedule E income or loss", value: result.netRentalRoyaltyIncome.toString() },
    { label: "PA-40 Line 6 reportable net rental and royalty income", value: result.reportableNetRentalRoyaltyIncome.toString() },
  ];

  if (
    !result.taxpayerNetRentalRoyaltyIncome.eq(result.netRentalRoyaltyIncome)
    || !result.spouseNetRentalRoyaltyIncome.isZero()
  ) {
    totals.splice(7, 0,
      {
        label: "Separate taxpayer Schedule E income or loss",
        value: result.taxpayerNetRentalRoyaltyIncome.toString(),
      },
      {
        label: "Separate spouse Schedule E income or loss",
        value: result.spouseNetRentalRoyaltyIncome.toString(),
      },
    );
  }

  return {
    title: "Pennsylvania Schedule E Rental and Royalty Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule E computation. It is not an official PA Schedule E filing copy.",
    filingTrigger: "Attach when a resident return includes supported rental-property, royalty, copyright, patent, or pass-through Schedule E activity, including zero-net property detail that still requires disclosure support in the packet.",
    totals,
  };
}

export async function fillPAScheduleEReference(
  result: PAScheduleEResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleEReferenceSummary(result);
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
  const outputPath = join(outputDir, PA_SCHEDULE_E_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
