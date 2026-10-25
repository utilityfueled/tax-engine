import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { calculateForm8829, type Form8829Result } from "@/engine/forms/form-8829.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { Form8829Input } from "@/models/inputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_8829_LINES = [
  "1",
  "2",
  "3",
  "7",
  "8",
  "14",
  "15",
  "24",
  "27",
  "29",
  "30",
  "31",
  "32",
  "33",
  "35",
  "36",
  "42",
  "43",
  "44",
] as const;

const INCLUDED_FORM_8829_LINE_SET = new Set<string>(INCLUDED_FORM_8829_LINES);

export const FORM_8829_REFERENCE_FILENAME = "f8829-reference-filled.pdf";

export interface Form8829ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form8829ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form8829ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  lines: Form8829ReferenceSummaryLine[];
  totals: Form8829ReferenceSummaryTotal[];
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

function getReferenceLines(result: Form8829Result) {
  return result.lines
    .filter((line) => INCLUDED_FORM_8829_LINE_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_8829_LINES.indexOf(left.line as typeof INCLUDED_FORM_8829_LINES[number])
        - INCLUDED_FORM_8829_LINES.indexOf(right.line as typeof INCLUDED_FORM_8829_LINES[number]),
    );
}

export function buildForm8829ReferenceSummary(input: Form8829Input): Form8829ReferenceSummary {
  const result = calculateForm8829(input);

  return {
    title: "Form 8829 Home Office Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "Computed from supported actual-expense home-office facts that feed Schedule C Line 30.",
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: line.description,
      value: formatValue(line),
      formula: line.formula,
    })),
    totals: [
      {
        label: "Schedule C Line 30 home-office deduction",
        value: result.line36.toString(),
      },
      {
        label: "Operating-expense carryover to next year",
        value: result.line43.toString(),
      },
      {
        label: "Casualty and depreciation carryover to next year",
        value: result.line44.toString(),
      },
    ],
  };
}

export async function fillForm8829Reference(
  input: Form8829Input,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm8829ReferenceSummary(input);
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
    "This page summarizes supported Form 8829 actual-expense home-office calculations that feed Schedule C Line 30. It is not an official filed Form 8829 copy.",
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
    if (y < 110) {
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
      y: y - 1,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  if (y < 100) {
    newPage();
  }

  y = drawWrappedText(page, "Totals", {
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
  const outputPath = join(outputDir, FORM_8829_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
