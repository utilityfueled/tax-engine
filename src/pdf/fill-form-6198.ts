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
import { calculateForm6198, type Form6198Result } from "@/engine/forms/form-6198.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { ScheduleK1, TaxYearInput } from "@/models/inputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);
const ZERO = new Decimal(0);

const INCLUDED_FORM_6198_LINES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "9",
  "10a",
  "10b",
  "20",
  "21",
  "suspended",
  "recapture",
] as const;

const INCLUDED_FORM_6198_LINE_SET = new Set<string>(INCLUDED_FORM_6198_LINES);

export const FORM_6198_REFERENCE_FILENAME = "f6198-reference-filled.pdf";

export interface Form6198ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form6198ReferenceSummarySection {
  activityName: string;
  partnershipName: string;
  partnershipEIN: string;
  lines: Form6198ReferenceSummaryLine[];
}

export interface Form6198ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form6198ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  sections: Form6198ReferenceSummarySection[];
  totals: Form6198ReferenceSummaryTotal[];
}

interface Form6198SectionResult {
  activityName: string;
  partnershipName: string;
  partnershipEIN: string;
  result: Form6198Result;
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

function normalizeFormula(formula: string) {
  return formula.replaceAll("≤", "<=").replaceAll("×", "x");
}

function getSectionResults(input: TaxYearInput): Form6198SectionResult[] {
  return input.scheduleK1
    .filter((k1): k1 is ScheduleK1 & { form6198: NonNullable<ScheduleK1["form6198"]> } => Boolean(k1.form6198))
    .map((k1, index) => {
      const activityName = k1.form6198.activityName?.trim() || k1.partnershipName || `Activity ${index + 1}`;
      const result = calculateForm6198({
        ...k1.form6198,
        activityName,
      });

      return {
        activityName,
        partnershipName: k1.partnershipName,
        partnershipEIN: k1.partnershipEIN,
        result,
      };
    });
}

function getReferenceLines(result: Form6198Result) {
  return result.lines
    .filter((line) => INCLUDED_FORM_6198_LINE_SET.has(line.line))
    .filter((line) => !(line.line === "recapture" && line.value.eq(0)))
    .sort(
      (left, right) => INCLUDED_FORM_6198_LINES.indexOf(left.line as typeof INCLUDED_FORM_6198_LINES[number])
        - INCLUDED_FORM_6198_LINES.indexOf(right.line as typeof INCLUDED_FORM_6198_LINES[number]),
    );
}

function formatLine(line: CalculatedLine): Form6198ReferenceSummaryLine {
  return {
    line: line.line,
    description: line.description,
    value: line.value.toString(),
    formula: normalizeFormula(line.formula),
  };
}

export function shouldIncludeForm6198ReferenceSummary(input: TaxYearInput) {
  return getSectionResults(input).length > 0;
}

export function buildForm6198ReferenceSummary(input: TaxYearInput): Form6198ReferenceSummary {
  const sections = getSectionResults(input);

  const totalDeductibleLoss = sections.reduce(
    (sum, section) => sum.plus(section.result.deductibleLoss),
    ZERO,
  );
  const totalSuspendedLoss = sections.reduce(
    (sum, section) => sum.plus(section.result.suspendedLoss),
    ZERO,
  );
  const totalRecaptureIncome = sections.reduce(
    (sum, section) => sum.plus(section.result.recaptureIncome),
    ZERO,
  );

  return {
    title: "Form 6198 At-Risk Limitation Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction:
      `Computed from ${sections.length} supported Schedule K-1 at-risk activit${sections.length === 1 ? "y" : "ies"} using the engine's Form 6198 limitation logic.`,
    sections: sections.map((section) => ({
      activityName: section.activityName,
      partnershipName: section.partnershipName,
      partnershipEIN: section.partnershipEIN,
      lines: getReferenceLines(section.result).map(formatLine),
    })),
    totals: [
      {
        label: "Activities with supported Form 6198 inputs",
        value: sections.length.toString(),
      },
      {
        label: "Total deductible loss allowed this year",
        value: totalDeductibleLoss.toString(),
      },
      {
        label: "Total suspended at-risk loss carryforward",
        value: totalSuspendedLoss.toString(),
      },
      {
        label: "Total recapture income",
        value: totalRecaptureIncome.toString(),
      },
    ],
  };
}

export async function fillForm6198Reference(input: TaxYearInput, outputDir: string) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm6198ReferenceSummary(input);
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
    "This page summarizes supported Form 6198 at-risk computations that limit current-year Schedule E losses and track suspended at-risk losses. It is not an official filed Form 6198 copy.",
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
    if (y < 190) {
      newPage();
    }

    y = drawWrappedText(page, section.activityName, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Partnership: ${section.partnershipName} (${section.partnershipEIN})`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    for (const line of section.lines) {
      if (y < 110) {
        newPage();
      }

      y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y: y - 2,
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

  y -= 6;
  y = drawWrappedText(page, "Downstream totals", {
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
  const outputPath = join(outputDir, FORM_6198_REFERENCE_FILENAME);
  const bytes = await doc.save();
  await writeFile(outputPath, bytes);
  return outputPath;
}
