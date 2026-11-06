import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form8615Input } from "@/models/inputs.js";
import type { Form8615Result } from "@/engine/forms/form-8615.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const FORM_8615_REFERENCE_FILENAME = "f8615-reference-filled.pdf";

export interface Form8615ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
}

export interface Form8615ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form8615ReferenceSummary {
  title: string;
  warningLabel: string;
  lineCount: number;
  introduction: string;
  lines: Form8615ReferenceSummaryLine[];
  totals: Form8615ReferenceSummaryTotal[];
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

export function buildForm8615ReferenceSummary(
  input: Form8615Input,
  result: Form8615Result,
): Form8615ReferenceSummary {
  if (!result.applies) {
    throw new Error("Form 8615 reference summary requires an applicable Form 8615 result");
  }

  const lines = result.lines
    .filter((line) => line.form === "8615" && /^\d+$/.test(line.line))
    .sort((left, right) => Number(left.line) - Number(right.line))
    .map((line) => ({
      line: line.line,
      description: line.description,
      value: line.value.toString(),
    }));

  return {
    title: "Form 8615 Kiddie Tax Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    lineCount: lines.length,
    introduction: `Computed from supported kiddie-tax inputs for a ${input.parentFilingStatus.replaceAll("_", " ")} parent filing status. This summary reflects the Form 8615 line outputs that replace Form 1040 Line 16 tax when the form applies.`,
    lines,
    totals: [
      {
        label: "Form 1040 Line 16 tax replacement",
        value: result.tax.toString(),
      },
    ],
  };
}

export async function fillForm8615Reference(
  input: Form8615Input,
  result: Form8615Result,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm8615ReferenceSummary(input, result);
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
    "This page summarizes supported Form 8615 outputs and the resulting Form 1040 Line 16 tax override. It is not an official filed Form 8615 copy.",
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

  for (const line of summary.lines) {
    if (y < 90) {
      newPage();
    }

    y = drawWrappedText(page, `Line ${line.line} ${line.description}: ${formatAmountString(line.value)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 13,
    });
  }

  if (y < 100) {
    newPage();
  }

  y -= 8;
  y = drawWrappedText(page, "Computed totals", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const total of summary.totals) {
    y = drawWrappedText(page, `${total.label}: ${formatAmountString(total.value)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 4,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_8615_REFERENCE_FILENAME);
  const pdfBytes = await doc.save();
  await writeFile(outputPath, pdfBytes);
  return outputPath;
}
