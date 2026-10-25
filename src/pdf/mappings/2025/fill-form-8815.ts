import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { SavingsBondRedemption } from "@/models/inputs.js";
import type { Form8815Result } from "@/engine/forms/form-8815.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_8815_LINES = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
] as const;

const INCLUDED_FORM_8815_LINE_SET = new Set<string>(INCLUDED_FORM_8815_LINES);

export const FORM_8815_REFERENCE_FILENAME = "f8815-reference-filled.pdf";

export interface Form8815ReferenceSummaryRedemption {
  redemptionNumber: number;
  proceeds: string;
  interest: string;
  qualifiedExpenses: string;
}

export interface Form8815ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form8815ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form8815ReferenceSummary {
  title: string;
  warningLabel: string;
  redemptionCount: number;
  introduction: string;
  redemptions: Form8815ReferenceSummaryRedemption[];
  lines: Form8815ReferenceSummaryLine[];
  totals: Form8815ReferenceSummaryTotal[];
}

function sanitizePdfText(text: string) {
  return text
    .replace(/×/g, " x ")
    .replace(/→/g, "->")
    .replace(/[−–—]/g, "-")
    .replace(/[^\x20-\x7E\n\t]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = sanitizePdfText(text).trim().split(/\s+/).filter(Boolean);

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

function getReferenceLines(result: Form8815Result) {
  return result.lines
    .filter((line) => INCLUDED_FORM_8815_LINE_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_8815_LINES.indexOf(left.line as typeof INCLUDED_FORM_8815_LINES[number])
        - INCLUDED_FORM_8815_LINES.indexOf(right.line as typeof INCLUDED_FORM_8815_LINES[number]),
    );
}

export function buildForm8815ReferenceSummary(
  redemptions: SavingsBondRedemption[],
  result: Form8815Result,
): Form8815ReferenceSummary {
  return {
    title: "Form 8815 Savings Bond Interest Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    redemptionCount: redemptions.length,
    introduction: `Computed from ${redemptions.length} supported savings bond redemption entr${redemptions.length === 1 ? "y" : "ies"} that produce a positive Form 8815 exclusion.`,
    redemptions: redemptions.map((redemption, index) => ({
      redemptionNumber: index + 1,
      proceeds: redemption.proceeds.toString(),
      interest: redemption.interest.toString(),
      qualifiedExpenses: redemption.qualifiedExpenses.toString(),
    })),
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: line.description,
      value: line.value.toString(),
      formula: sanitizePdfText(line.formula),
    })),
    totals: [
      {
        label: "Schedule B Line 3 exclusion",
        value: result.excludableSavingsBondInterest.toString(),
      },
    ],
  };
}

export async function fillForm8815Reference(
  redemptions: SavingsBondRedemption[],
  result: Form8815Result,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm8815ReferenceSummary(redemptions, result);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const newPage = () => {
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

  y = drawWrappedText(
    page,
    "This page summarizes supported savings-bond redemption inputs and the resulting Form 8815 outputs that feed Schedule B Line 3. It is not an official filed Form 8815 copy.",
    {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 10,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  y -= 16;

  for (const redemption of summary.redemptions) {
    if (y < 105) {
      newPage();
    }

    y = drawWrappedText(page, `Redemption ${redemption.redemptionNumber}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Proceeds: ${redemption.proceeds}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Interest: ${redemption.interest}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Qualified expenses: ${redemption.qualifiedExpenses}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 8;
  }

  for (const line of summary.lines) {
    if (y < 90) {
      newPage();
    }

    y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Value: ${line.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Formula: ${line.formula}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 8;
  }

  if (y < 90) {
    newPage();
  }

  y = drawWrappedText(page, "Computed totals", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const total of summary.totals) {
    y = drawWrappedText(page, `${total.label}: ${total.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_8815_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
