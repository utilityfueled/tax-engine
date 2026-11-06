import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { calculateForm3903 } from "@/engine/forms/form-3903.js";
import type { Form3903Input } from "@/models/inputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const FORM_3903_REFERENCE_FILENAME = "f3903-reference-filled.pdf";

export interface Form3903ReferenceSummaryMove {
  moveNumber: number;
  line1TransportationAndStorage: string;
  line2TravelAndLodging: string;
  line3TotalExpenses: string;
  line4ExcludedReimbursements: string;
  line5DeductibleAmount: string;
}

export interface Form3903ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form3903ReferenceSummary {
  title: string;
  warningLabel: string;
  moveCount: number;
  introduction: string;
  moves: Form3903ReferenceSummaryMove[];
  totals: Form3903ReferenceSummaryTotal[];
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

export function buildForm3903ReferenceSummary(input: Form3903Input): Form3903ReferenceSummary {
  const result = calculateForm3903(input);

  return {
    title: "Form 3903 Moving Expenses Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    moveCount: input.moves.length,
    introduction: `Computed from ${input.moves.length} supported military move${input.moves.length === 1 ? "" : "s"} for Schedule 1 Line 14.`,
    moves: result.moveResults.map((moveResult, index) => ({
      moveNumber: index + 1,
      line1TransportationAndStorage: moveResult.line1.toString(),
      line2TravelAndLodging: moveResult.line2.toString(),
      line3TotalExpenses: moveResult.line3.toString(),
      line4ExcludedReimbursements: moveResult.line4.toString(),
      line5DeductibleAmount: moveResult.line5.toString(),
    })),
    totals: [
      {
        label: "Military eligibility indicator",
        value: input.military ? "Active-duty Armed Forces PCS move supplied" : "Not supplied",
      },
      {
        label: "Schedule 1 Line 14 deduction",
        value: result.totalDeductible.toString(),
      },
    ],
  };
}

export async function fillForm3903Reference(input: Form3903Input, outputDir: string) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm3903ReferenceSummary(input);
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

  y = drawWrappedText(
    page,
    "This page summarizes supported Form 3903 moving-expense inputs and computed deduction lines that feed Schedule 1 Line 14. It is not an official filed Form 3903 copy.",
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

  for (const move of summary.moves) {
    if (y < 155) {
      newPage();
    }

    y = drawWrappedText(page, `Move ${move.moveNumber}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Line 1 transportation and storage: ${formatAmountString(move.line1TransportationAndStorage)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Line 2 travel and lodging: ${formatAmountString(move.line2TravelAndLodging)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Line 3 total expenses: ${formatAmountString(move.line3TotalExpenses)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Line 4 excluded reimbursements: ${formatAmountString(move.line4ExcludedReimbursements)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Line 5 deductible amount: ${formatAmountString(move.line5DeductibleAmount)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 8;
  }

  if (y < 110) {
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
    y = drawWrappedText(page, `${total.label}: ${total.label.includes("deduction") ? formatAmountString(total.value) : total.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_3903_REFERENCE_FILENAME);
  const bytes = await doc.save();
  await writeFile(outputPath, bytes);
  return outputPath;
}
