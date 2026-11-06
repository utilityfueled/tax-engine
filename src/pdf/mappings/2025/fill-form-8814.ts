import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { AggregatedForm8814, Form8814Result } from "@/engine/forms/form-8814.js";
import type { CalculatedLine } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_8814_LINES = ["1b", "4", "6", "9", "10", "12", "15"] as const;
const INCLUDED_FORM_8814_LINE_SET = new Set<string>(INCLUDED_FORM_8814_LINES);

export const FORM_8814_REFERENCE_FILENAME = "f8814-reference-filled.pdf";

export interface Form8814ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form8814ReferenceSummaryChild {
  childNumber: number;
  status: "applicable" | "not_applicable" | "unsupported";
  note: string;
  lines: Form8814ReferenceSummaryLine[];
}

export interface Form8814ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form8814ReferenceSummary {
  title: string;
  warningLabel: string;
  childCount: number;
  applicableChildCount: number;
  introduction: string;
  children: Form8814ReferenceSummaryChild[];
  totals: Form8814ReferenceSummaryTotal[];
}

function sanitizePdfText(text: string) {
  return text
    .replace(/→/g, "->")
    .replace(/×/g, "x")
    .replace(/[−–—]/g, "-")
    .replace(/[^\x20-\x7E\n\t]/g, "");
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

function getChildReferenceLines(child: Form8814Result) {
  return child.lines
    .filter((line) => line.form === "Form 8814" && INCLUDED_FORM_8814_LINE_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_8814_LINES.indexOf(left.line as typeof INCLUDED_FORM_8814_LINES[number])
        - INCLUDED_FORM_8814_LINES.indexOf(right.line as typeof INCLUDED_FORM_8814_LINES[number]),
    );
}

function toSummaryLines(lines: CalculatedLine[]): Form8814ReferenceSummaryLine[] {
  return lines.map((line) => ({
    line: line.line,
    description: line.description,
    value: line.value.toString(),
    formula: line.formula,
  }));
}

function getChildStatus(child: Form8814Result): Form8814ReferenceSummaryChild["status"] {
  if (child.applies) {
    return "applicable";
  }

  if (child.exceedsMaximum) {
    return "unsupported";
  }

  return "not_applicable";
}

function getChildNote(child: Form8814Result): string {
  if (child.applies) {
    return "Child income is within the Form 8814 computation range. Eligibility is validated separately from this reference summary.";
  }

  if (child.exceedsMaximum) {
    return "Child income reaches the Form 8814 maximum, so the child must file separately instead of using the parent election.";
  }

  return "Child income does not produce a supported Form 8814 parent-election result.";
}

export function buildForm8814ReferenceSummary(result: AggregatedForm8814): Form8814ReferenceSummary {
  const applicableChildCount = result.children.filter((child) => child.applies).length;

  return {
    title: "Form 8814 Child Interest Election Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    childCount: result.children.length,
    applicableChildCount,
    introduction: `Computed from ${result.children.length} child interest/dividend input${result.children.length === 1 ? "" : "s"}. This summary separates child worksheet information from parent return transfers. Election eligibility is validated separately before creating the return packet.`,
    children: result.children.map((child, index) => ({
      childNumber: index + 1,
      status: getChildStatus(child),
      note: getChildNote(child),
      lines: toSummaryLines(getChildReferenceLines(child)),
    })),
    totals: [
      {
        label: "Child tax-exempt interest for dependent worksheets (not parent Line 2a)",
        value: result.totalTaxExemptInterest.toString(),
      },
      {
        label: "Parent Form 1040 Lines 3a and 3b addition",
        value: result.totalQualifiedDividends.toString(),
      },
      {
        label: "Parent Schedule D / Form 1040 Line 7 addition",
        value: result.totalCapitalGains.toString(),
      },
      {
        label: "Parent Schedule 1 Line 8z addition",
        value: result.totalOtherIncome.toString(),
      },
      {
        label: "Parent Form 1040 Line 16 tax addition",
        value: result.totalTax.toString(),
      },
    ],
  };
}

export async function fillForm8814Reference(
  result: AggregatedForm8814,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm8814ReferenceSummary(result);
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
    "This page summarizes supported Form 8814 parent-election outputs and the resulting amounts that flow onto the parent's return. It is not an official filed Form 8814 copy.",
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

  for (const child of summary.children) {
    if (y < 140) {
      newPage();
    }

    y = drawWrappedText(page, `Child ${child.childNumber} (${child.status.replaceAll("_", " ")}):`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, child.note, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    for (const line of child.lines) {
      if (y < 90) {
        newPage();
      }

      y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y: y - 4,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 13,
      });

      y = drawWrappedText(page, `Value: ${line.value}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 24,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 24,
        lineHeight: 13,
      });

      y = drawWrappedText(page, `Formula: ${line.formula}`, {
        font: regular,
        size: BODY_FONT_SIZE - 0.5,
        x: PAGE_MARGIN + 24,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 24,
        lineHeight: 13,
      });
    }

    y -= 8;
  }

  if (y < 120) {
    newPage();
  }

  y = drawWrappedText(page, "Child worksheet amounts and parent-return totals", {
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
      y: y - 4,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_8814_REFERENCE_FILENAME);
  const pdfBytes = await doc.save({ useObjectStreams: false });
  await writeFile(outputPath, pdfBytes);
  return outputPath;
}
