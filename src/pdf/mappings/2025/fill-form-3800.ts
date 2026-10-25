import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { CalculatedLine } from "@/models/outputs.js";
import type { Form3800Result } from "@/engine/forms/form-3800.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_3800_LINES = [
  "K-1 Box 15",
  "Part I Line 1",
  "Part I Line 2",
  "Part I Line 3",
  "Part I Line 5",
  "Part II Line 14",
  "Part II Line 15",
  "Part II Line 16",
  "Part II Line 17",
  "Part II Line 18",
  "Part II Line 19",
  "Part II Line 20",
  "Part II Line 21",
  "Carryforward",
] as const;

const INCLUDED_FORM_3800_LINE_SET = new Set<string>(INCLUDED_FORM_3800_LINES);

export const FORM_3800_REFERENCE_FILENAME = "f3800-reference-filled.pdf";

export interface Form3800ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form3800ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form3800ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  lines: Form3800ReferenceSummaryLine[];
  totals: Form3800ReferenceSummaryTotal[];
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

function getReferenceLines(result: Form3800Result) {
  return result.lines
    .filter((line) => INCLUDED_FORM_3800_LINE_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_3800_LINES.indexOf(left.line as typeof INCLUDED_FORM_3800_LINES[number])
        - INCLUDED_FORM_3800_LINES.indexOf(right.line as typeof INCLUDED_FORM_3800_LINES[number]),
    );
}

export function buildForm3800ReferenceSummary(result: Form3800Result): Form3800ReferenceSummary {
  return {
    title: "Form 3800 General Business Credit Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "Computed from supported general-business-credit inputs and the engine-calculated Form 3800 limitation lines.",
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: line.description,
      value: formatValue(line),
      formula: line.formula,
    })),
    totals: [
      {
        label: "K-1 Box 15 credits",
        value: result.k1TotalCredits.toString(),
      },
      {
        label: "Direct current-year credits",
        value: result.currentYearCredit.minus(result.k1TotalCredits).toString(),
      },
      {
        label: "Passive activity credits allowed",
        value: result.passiveActivityCredits.toString(),
      },
      {
        label: "Prior-year carryforward applied",
        value: result.carryforwardApplied.toString(),
      },
      {
        label: "Allowable Schedule 3 Line 6a credit",
        value: result.allowableCredit.toString(),
      },
      {
        label: "Unused credit carried forward",
        value: result.carryforwardToNextYear.toString(),
      },
    ],
  };
}

export async function fillForm3800Reference(
  result: Form3800Result,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm3800ReferenceSummary(result);
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
    "This page summarizes supported Form 3800 credit aggregation and limitation outputs that feed Schedule 3 Line 6a. It is not an official filed Form 3800.",
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

    y = drawWrappedText(page, `${line.line}: ${line.description}`, {
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

    y -= 6;
  }

  if (summary.totals.length > 0) {
    if (y < 120) {
      newPage();
    }

    y = drawWrappedText(page, "Key totals", {
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
  }

  const pdfBytes = await doc.save();
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_3800_REFERENCE_FILENAME);
  await writeFile(outputPath, pdfBytes);
  return outputPath;
}
