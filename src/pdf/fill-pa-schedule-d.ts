import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PAScheduleDResult } from "@/engine/state/pa-schedule-d.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_D_REFERENCE_FILENAME = "pa-schedule-d-reference.pdf";

export interface PAScheduleDReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleDReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleDReferenceSummaryLine[];
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

export function buildPAScheduleDReferenceSummary(
  result: PAScheduleDResult,
): PAScheduleDReferenceSummary {
  const totals: PAScheduleDReferenceSummaryLine[] = [
    {
      label: "Digital asset question",
      value: result.digitalAssetQuestionYes ? "Yes" : "No",
    },
    { label: "Line 1 general property dispositions", value: formatWholeDollar(result.line1.toString()) },
    { label: "Line 2 like-kind exchange gain or loss", value: formatWholeDollar(result.line2.toString()) },
    { label: "Line 3 net gain or loss from Lines 1 and 2", value: formatWholeDollar(result.line3.toString()) },
    { label: "Line 4 installment-sale gain", value: formatWholeDollar(result.line4.toString()) },
    { label: "Line 5 C corporation distribution gain", value: formatWholeDollar(result.line5.toString()) },
    { label: "Line 6 PA Schedule D-71 and related gain or loss", value: formatWholeDollar(result.line6.toString()) },
    { label: "Line 7 pass-through entity gain or loss", value: formatWholeDollar(result.line7.toString()) },
    { label: "Line 8 taxable principal-residence gain", value: formatWholeDollar(result.line8.toString()) },
    { label: "Line 9 partnership distribution gain", value: formatWholeDollar(result.line9.toString()) },
    { label: "Line 10 S corporation distribution gain", value: formatWholeDollar(result.line10.toString()) },
    { label: "Line 11 insurance-contract gain", value: formatWholeDollar(result.line11.toString()) },
    { label: "Line 12 total PA taxable gain or loss", value: formatWholeDollar(result.line12.toString()) },
    { label: "PA-40 Line 5 reportable net gain or loss", value: formatWholeDollar(result.reportableNetGainOrLoss.toString()) },
  ];

  if (!result.spouseLine12.isZero() || !result.taxpayerLine12.eq(result.line12)) {
    totals.splice(13, 0,
      {
        label: "Separate taxpayer Schedule D total",
        value: formatWholeDollar(result.taxpayerLine12.toString()),
      },
      {
        label: "Separate spouse Schedule D total",
        value: formatWholeDollar(result.spouseLine12.toString()),
      },
    );
  }

  if (result.likeKindExchanges.length > 0) {
    totals.push({
      label: "Supported like-kind exchanges summarized",
      value: String(result.likeKindExchanges.length),
    });
  }

  return {
    title: "Pennsylvania Schedule D Net Gain or Loss Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule D computation. It is not an official PA Schedule D filing copy.",
    filingTrigger: "Attach when supported Schedule D activity, disclosure-only zero-net transaction detail, like-kind exchange detail, or the digital-asset question requires Pennsylvania Schedule D support in the packet.",
    totals,
  };
}

export async function fillPAScheduleDReference(
  result: PAScheduleDResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleDReferenceSummary(result);
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
  const outputPath = join(outputDir, PA_SCHEDULE_D_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
