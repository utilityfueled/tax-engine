import { assertPdfExportAllowed } from "../../export-policy.js";
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
import type { TaxReturnResult, CalculatedLine } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);
const ZERO = new Decimal(0);

const INCLUDED_PARTNER_BASIS_LINES = [
  "1",
  "income",
  "basis-before-decreases",
  "distributions",
  "basis-after-distributions",
  "excess-distribution-gain",
  "nondeductible",
  "basis-after-nondeductible",
  "total-losses",
  "total-allowed",
  "total-suspended",
  "ending-basis",
  "debt-15",
  "debt-16",
  "debt-17",
  "debt-18",
  "debt-20",
  "debt-21",
  "ending-basis-adjusted",
] as const;

const INCLUDED_PARTNER_BASIS_LINE_SET = new Set<string>(INCLUDED_PARTNER_BASIS_LINES);

export const PARTNER_BASIS_SCHEDULE_REFERENCE_FILENAME = "partner-basis-schedule-reference-filled.pdf";

export interface PartnerBasisScheduleReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface PartnerBasisScheduleReferenceSummarySection {
  entityName: string;
  entityEin: string;
  entityType: "partnership" | "s_corporation";
  lines: PartnerBasisScheduleReferenceSummaryLine[];
}

export interface PartnerBasisScheduleReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface PartnerBasisScheduleReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  sections: PartnerBasisScheduleReferenceSummarySection[];
  totals: PartnerBasisScheduleReferenceSummaryTotal[];
}

interface PartnerBasisScheduleSectionResult {
  entityName: string;
  entityEin: string;
  entityType: "partnership" | "s_corporation";
  lines: CalculatedLine[];
  endingBasis: Decimal;
  suspendedLosses: Decimal;
  excessDistributionGain: Decimal;
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

function sanitizePdfText(text: string) {
  return text
    .replaceAll("≤", "<=")
    .replaceAll("≥", ">=")
    .replaceAll("×", "x")
    .replaceAll("§", "Sec.")
    .replaceAll("–", "-")
    .replaceAll("—", "-");
}

function normalizeFormula(formula: string) {
  return sanitizePdfText(formula);
}

function getSectionResults(result: TaxReturnResult): PartnerBasisScheduleSectionResult[] {
  return (result.scheduleE?.partnerships ?? [])
    .filter((partnership) => partnership.basisResult !== undefined)
    .map((partnership) => ({
      entityName: partnership.name,
      entityEin: partnership.ein,
      entityType: partnership.basisResult!.entityType,
      lines: partnership.basisResult!.lines,
      endingBasis: partnership.basisResult!.endingBasis,
      suspendedLosses: partnership.basisResult!.totalSuspendedLosses,
      excessDistributionGain: partnership.basisResult!.excessDistributionGain,
    }));
}

function getReferenceLines(lines: CalculatedLine[]) {
  return lines
    .filter((line) => INCLUDED_PARTNER_BASIS_LINE_SET.has(line.line))
    .filter((line) => !(line.line === "excess-distribution-gain" && line.value.eq(0)))
    .filter((line) => !(line.line === "debt-16" && line.value.eq(0)))
    .filter((line) => !(line.line === "debt-18" && line.value.eq(0)))
    .filter((line) => !(line.line === "debt-20" && line.value.eq(0)))
    .sort(
      (left, right) =>
        INCLUDED_PARTNER_BASIS_LINES.indexOf(left.line as typeof INCLUDED_PARTNER_BASIS_LINES[number])
        - INCLUDED_PARTNER_BASIS_LINES.indexOf(right.line as typeof INCLUDED_PARTNER_BASIS_LINES[number]),
    );
}

function formatLine(line: CalculatedLine): PartnerBasisScheduleReferenceSummaryLine {
  return {
    line: line.line,
    description: line.description,
    value: line.value.toString(),
    formula: normalizeFormula(line.formula),
  };
}

export function shouldIncludePartnerBasisScheduleReferenceSummary(result: TaxReturnResult) {
  return getSectionResults(result).length > 0;
}

export function buildPartnerBasisScheduleReferenceSummary(
  result: TaxReturnResult,
): PartnerBasisScheduleReferenceSummary {
  const sections = getSectionResults(result);
  const totalEndingBasis = sections.reduce((sum, section) => sum.plus(section.endingBasis), ZERO);
  const totalSuspendedLosses = sections.reduce((sum, section) => sum.plus(section.suspendedLosses), ZERO);
  const totalExcessDistributionGain = sections.reduce(
    (sum, section) => sum.plus(section.excessDistributionGain),
    ZERO,
  );

  return {
    title: "Partner/Shareholder Basis Schedule Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction:
      `Computed from ${sections.length} supported Schedule K-1 basis schedule${sections.length === 1 ? "" : "s"} using the engine's IRC §704(d) / §1366(d) basis limitation logic.`,
    sections: sections.map((section) => ({
      entityName: section.entityName,
      entityEin: section.entityEin,
      entityType: section.entityType,
      lines: getReferenceLines(section.lines).map(formatLine),
    })),
    totals: [
      {
        label: "Supported basis schedules",
        value: sections.length.toString(),
      },
      {
        label: "Total ending basis",
        value: totalEndingBasis.toString(),
      },
      {
        label: "Total suspended basis losses",
        value: totalSuspendedLosses.toString(),
      },
      {
        label: "Total excess distribution gain",
        value: totalExcessDistributionGain.toString(),
      },
    ],
  };
}

export async function fillPartnerBasisScheduleReference(
  result: TaxReturnResult,
  outputDir: string,
) {
  assertPdfExportAllowed(result.taxYear, result.taxYear);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPartnerBasisScheduleReferenceSummary(result);
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
    y: y - 10,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
  });

  for (const section of summary.sections) {
    if (y < 170) {
      newPage();
    }

    const entityTypeLabel = section.entityType === "s_corporation" ? "S corporation" : "Partnership";
    y = drawWrappedText(page, `${section.entityName} (${entityTypeLabel})`, {
      font: bold,
      size: 13,
      x: PAGE_MARGIN,
      y: y - 16,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 18,
    });

    y = drawWrappedText(page, `EIN: ${section.entityEin}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 4,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    });

    for (const line of section.lines) {
      if (y < 88) {
        newPage();
      }

      y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y: y - 10,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      });

      y = drawWrappedText(page, `Value: ${line.value}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      });

      y = drawWrappedText(page, `Formula: ${line.formula}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      });
    }
  }

  if (y < 130) {
    newPage();
  }

  y = drawWrappedText(page, "Summary totals", {
    font: bold,
    size: 13,
    x: PAGE_MARGIN,
    y: y - 18,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 18,
  });

  for (const total of summary.totals) {
    if (y < 72) {
      newPage();
    }

    y = drawWrappedText(page, `${total.label}: ${total.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 8,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, PARTNER_BASIS_SCHEDULE_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
