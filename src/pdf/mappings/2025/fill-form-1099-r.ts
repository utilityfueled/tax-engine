import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form1099R } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { Form1099RResult } from "@/engine/forms/form-1099-r.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_1099_R_LINES = new Set(["1", "2", "3", "4", "5"]);

export const FORM_1099_R_REFERENCE_FILENAME = "f1099r-reference-filled.pdf";

export interface Form1099RReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form1099RReferenceSummary {
  title: string;
  warningLabel: string;
  statementCount: number;
  introduction: string;
  lines: Form1099RReferenceSummaryLine[];
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

function formatValue(line: CalculatedLine) {
  return line.value.toString();
}

function getReferenceLines(result: Form1099RResult) {
  return result.lines.filter((line) => INCLUDED_FORM_1099_R_LINES.has(line.line));
}

export function buildForm1099RReferenceSummary(
  forms: Form1099R[],
  result: Form1099RResult,
): Form1099RReferenceSummary {
  const statementCount = forms.length;

  return {
    title: "Form 1099-R Retirement Distribution Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    statementCount,
    introduction: `Computed from ${statementCount} supported Form 1099-R statement${statementCount === 1 ? "" : "s"}.`,
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: line.description,
      value: formatValue(line),
      formula: line.formula,
    })),
  };
}

export async function fillForm1099RReference(
  forms: Form1099R[],
  result: Form1099RResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm1099RReferenceSummary(forms, result);
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
    "This page summarizes the supported Form 1099-R results that feed Form 1040 Lines 4a, 4b, 5a, 5b, and 25b. It is not an official payer-issued Form 1099-R copy.",
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
      size: BODY_FONT_SIZE - 0.5,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  const filePath = join(outputDir, FORM_1099_R_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save({ useObjectStreams: false }));
  return filePath;
}
