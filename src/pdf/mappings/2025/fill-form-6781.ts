import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import Decimal from "decimal.js";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  calculateForm6781,
  type Form6781Result,
} from "@/engine/forms/form-6781.js";
import type { Form6781Input, TaxYearInput } from "@/models/inputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_6781_LINES = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "11a",
  "11b",
  "13a",
  "13b",
] as const;

const INCLUDED_FORM_6781_LINE_SET = new Set<string>(INCLUDED_FORM_6781_LINES);

export const FORM_6781_REFERENCE_FILENAME = "f6781-reference-filled.pdf";

export interface Form6781ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form6781ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form6781ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  lines: Form6781ReferenceSummaryLine[];
  totals: Form6781ReferenceSummaryTotal[];
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

function getReferenceLines(result: Form6781Result) {
  return result.lines
    .filter((line) => INCLUDED_FORM_6781_LINE_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_6781_LINES.indexOf(left.line as typeof INCLUDED_FORM_6781_LINES[number])
        - INCLUDED_FORM_6781_LINES.indexOf(right.line as typeof INCLUDED_FORM_6781_LINES[number]),
    );
}

function hasSupportedForm6781Activity(input: Form6781Input) {
  if (input.carrybackElection) {
    return true;
  }

  const numericFields = [
    input.section1256Gains,
    input.section1256Losses,
    input.adjustments,
    input.carrybackAmount,
    input.shortTermStraddleLosses,
    input.longTermStraddleLosses,
    input.shortTermStraddleGains,
    input.longTermStraddleGains,
  ];

  return numericFields.some((value) => !new Decimal(value ?? 0).isZero());
}

export function shouldIncludeForm6781ReferenceSummary(input: TaxYearInput) {
  return input.form6781 !== undefined && hasSupportedForm6781Activity(input.form6781);
}

export function buildForm6781ReferenceSummary(
  _input: Form6781Input,
  result: Form6781Result,
): Form6781ReferenceSummary {
  return {
    title: "Form 6781 Section 1256 and Straddles Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "Computed from supported Form 6781 section 1256 contract and straddle inputs that flow to Schedule D.",
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: line.description,
      value: line.value.toString(),
      formula: sanitizePdfText(line.formula),
    })),
    totals: [
      {
        label: "Schedule D Line 4 carry amount",
        value: result.scheduleDShortTerm.toString(),
      },
      {
        label: "Schedule D Line 11 carry amount",
        value: result.scheduleDLongTerm.toString(),
      },
    ],
  };
}

export async function fillForm6781Reference(
  input: Form6781Input,
  outputDir: string,
) {
  const result = calculateForm6781(input);
  const summary = buildForm6781ReferenceSummary(input, result);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
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
    "This page summarizes supported Form 6781 outputs that feed Schedule D lines 4 and 11. It is not an official filed Form 6781 copy.",
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

    y -= 8;
  }

  if (y < 100) {
    newPage();
  }

  y = drawWrappedText(page, "Downstream Schedule D carry amounts", {
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
  const outputPath = join(outputDir, FORM_6781_REFERENCE_FILENAME);
  const pdfBytes = await doc.save();
  await writeFile(outputPath, pdfBytes);
  return outputPath;
}
