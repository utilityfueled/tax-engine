import { assertPdfExportAllowed } from "../../export-policy.js";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { CalculatedLine, TaxReturnResult } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_1116_LINES = [
  "simplified_eligible",
  "1a",
  "3e",
  "3f",
  "7",
  "20",
  "21",
  "carryforward",
  "schedule-b-used",
  "schedule-b-expired",
] as const;

const INCLUDED_FORM_1116_LINE_SET = new Set<string>(INCLUDED_FORM_1116_LINES);

export const FORM_1116_REFERENCE_FILENAME = "f1116-reference-filled.pdf";

export interface Form1116ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form1116ReferenceSummarySection {
  form: string;
  lines: Form1116ReferenceSummaryLine[];
}

export interface Form1116ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  sections: Form1116ReferenceSummarySection[];
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

function isForm1116AuditLine(line: CalculatedLine) {
  return line.form === "Form 1116" || line.form.startsWith("Form 1116 (");
}

function normalizeFormula(formula: string) {
  return formula.replaceAll("≤", "<=").replaceAll("×", "x");
}

function formatLineValue(line: CalculatedLine) {
  if (line.line === "simplified_eligible") {
    return line.value.eq(1) ? "Yes" : "No";
  }

  return line.value.toString();
}

function getReferenceLinesByForm(result: TaxReturnResult) {
  const grouped = new Map<string, CalculatedLine[]>();

  for (const line of result.allLines) {
    if (!isForm1116AuditLine(line) || !INCLUDED_FORM_1116_LINE_SET.has(line.line)) {
      continue;
    }

    const existing = grouped.get(line.form);
    if (existing) {
      existing.push(line);
    } else {
      grouped.set(line.form, [line]);
    }
  }

  return [...grouped.entries()].map(([form, lines]) => ({
    form,
    lines: [...lines].sort(
      (left, right) => INCLUDED_FORM_1116_LINES.indexOf(left.line as typeof INCLUDED_FORM_1116_LINES[number])
        - INCLUDED_FORM_1116_LINES.indexOf(right.line as typeof INCLUDED_FORM_1116_LINES[number]),
    ),
  }));
}

export function shouldIncludeForm1116ReferenceSummary(result: TaxReturnResult) {
  const sections = getReferenceLinesByForm(result);
  if (sections.length === 0) {
    return false;
  }

  const hasSeparateCategorySection = sections.some((section) => section.form !== "Form 1116");
  if (hasSeparateCategorySection) {
    return true;
  }

  const lines = sections.flatMap((section) => section.lines);
  const simplifiedEligibleLine = lines.find((line) => line.line === "simplified_eligible");
  const hasCarryforwardFilingActivity = lines.some((line) =>
    line.line === "schedule-b-used"
    || line.line === "schedule-b-expired"
    || (line.line === "7" && line.formula.includes("carryforward from")),
  );

  if (!simplifiedEligibleLine) {
    return true;
  }

  return simplifiedEligibleLine.value.eq(0) || hasCarryforwardFilingActivity;
}

export function buildForm1116ReferenceSummary(result: TaxReturnResult): Form1116ReferenceSummary {
  const sections = getReferenceLinesByForm(result).map((section) => ({
    form: section.form,
    lines: section.lines.map((line) => ({
      line: line.line,
      description: line.description,
      value: formatLineValue(line),
      formula: normalizeFormula(line.formula),
    })),
  }));

  return {
    title: "Form 1116 Foreign Tax Credit Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction:
      "Computed from supported Form 1116 foreign tax credit audit lines. This artifact appears only when the official filing path requires Form 1116 instead of the no-form simplified election.",
    sections,
  };
}

export async function fillForm1116Reference(result: TaxReturnResult, outputDir: string) {
  assertPdfExportAllowed(result.taxYear, result.taxYear);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm1116ReferenceSummary(result);
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
    "This page summarizes the supported Form 1116 limitation, credit, and carryforward outputs that feed Schedule 3 Line 1 and the foreign tax credit carryforward records. It is not an official filled Form 1116.",
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

  for (const section of summary.sections) {
    if (y < 120) {
      newPage();
    }

    y = drawWrappedText(page, section.form, {
      font: bold,
      size: BODY_FONT_SIZE + 1,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 15,
    });

    for (const line of section.lines) {
      if (y < 90) {
        newPage();
      }

      y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 8,
        y: y - 4,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 8,
        lineHeight: 14,
      });

      y = drawWrappedText(page, `Value: ${line.value}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 20,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 20,
        lineHeight: 13,
      });

      y = drawWrappedText(page, `Formula: ${line.formula}`, {
        font: regular,
        size: BODY_FONT_SIZE - 0.5,
        x: PAGE_MARGIN + 20,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 20,
        lineHeight: 13,
      });

      y -= 6;
    }

    y -= 6;
  }

  const filePath = join(outputDir, FORM_1116_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save());
  return filePath;
}
