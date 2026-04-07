import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type {
  AggregationGroupResult,
  Form8995ABusinessResult,
  Form8995AResult,
  PatronageCooperativeResult,
} from "@/engine/forms/form-8995-a.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const FORM_8995_A_REFERENCE_FILENAME = "f8995a-reference-filled.pdf";

export interface Form8995AReferenceEntitySummary {
  category: "Trade or business" | "Qualified PTP";
  name: string;
  isSST: boolean;
  line1QBI: string;
  line3W2Wages: string;
  line5UBIA: string;
  line9W2UBIALimit: string;
  line15QBIComponent: string;
}

export interface Form8995AReferenceAggregationSummary {
  name: string;
  componentBusinessNames: string[];
  combinedQBI: string;
  combinedW2Wages: string;
  combinedUBIA: string;
}

export interface Form8995AReferencePatronageSummary {
  cooperativeName: string;
  qbiAllocable: string;
  ninePercentQBI: string;
  w2WagesAllocable: string;
  fiftyPercentW2: string;
  patronReduction: string;
  cooperativeDPAD: string;
}

export interface Form8995AReferenceOverallLine {
  line: string;
  description: string;
  value: string;
}

export interface Form8995AReferenceTotal {
  label: string;
  value: string;
}

export interface Form8995AReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  businesses: Form8995AReferenceEntitySummary[];
  ptpBusinesses: Form8995AReferenceEntitySummary[];
  aggregationGroups: Form8995AReferenceAggregationSummary[];
  patronageResults: Form8995AReferencePatronageSummary[];
  overallLines: Form8995AReferenceOverallLine[];
  totals: Form8995AReferenceTotal[];
}

function sanitizePdfText(text: string) {
  return text
    .replace(/→/g, "->")
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

function formatValue(value: { toString(): string }) {
  return value.toString();
}

function mapEntity(
  category: Form8995AReferenceEntitySummary["category"],
  entity: Form8995ABusinessResult,
): Form8995AReferenceEntitySummary {
  return {
    category,
    name: entity.name,
    isSST: entity.isSST,
    line1QBI: formatValue(entity.line1QBI),
    line3W2Wages: formatValue(entity.line3W2Wages),
    line5UBIA: formatValue(entity.line5UBIA),
    line9W2UBIALimit: formatValue(entity.line9W2UBIALimit),
    line15QBIComponent: formatValue(entity.line15QBIComponent),
  };
}

function mapAggregationGroup(group: AggregationGroupResult): Form8995AReferenceAggregationSummary {
  return {
    name: group.name,
    componentBusinessNames: group.componentBusinessNames,
    combinedQBI: formatValue(group.combinedQBI),
    combinedW2Wages: formatValue(group.combinedW2Wages),
    combinedUBIA: formatValue(group.combinedUBIA),
  };
}

function mapPatronage(result: PatronageCooperativeResult): Form8995AReferencePatronageSummary {
  return {
    cooperativeName: result.cooperativeName,
    qbiAllocable: formatValue(result.qbiAllocable),
    ninePercentQBI: formatValue(result.ninePercentQBI),
    w2WagesAllocable: formatValue(result.w2WagesAllocable),
    fiftyPercentW2: formatValue(result.fiftyPercentW2),
    patronReduction: formatValue(result.patronReduction),
    cooperativeDPAD: formatValue(result.cooperativeDPAD),
  };
}

export function buildForm8995AReferenceSummary(result: Form8995AResult): Form8995AReferenceSummary {
  return {
    title: "Form 8995-A QBI Deduction Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "Computed from supported Form 8995-A detailed QBI deduction outputs. This packet artifact summarizes the businesses, PTPs, patronage adjustments, and overall limitation lines the engine currently supports.",
    businesses: result.businesses.map((entity) => mapEntity("Trade or business", entity)),
    ptpBusinesses: result.ptpBusinesses.map((entity) => mapEntity("Qualified PTP", entity)),
    aggregationGroups: result.aggregationGroups.map(mapAggregationGroup),
    patronageResults: result.patronageResults.map(mapPatronage),
    overallLines: [
      { line: "phase-in", description: "Phase-in percentage", value: formatValue(result.phaseInPercentage) },
      { line: "16", description: "Total QBI component", value: formatValue(result.totalQBIComponent) },
      { line: "17", description: "Qualified REIT dividends", value: formatValue(result.qualifiedReitDividends) },
      { line: "32", description: "Total REIT and PTP component", value: formatValue(result.reitPTPComponent) },
      { line: "33", description: "Taxable income before QBI", value: formatValue(result.taxableIncomeBeforeQBI) },
      { line: "34", description: "Net capital gain", value: formatValue(result.netCapitalGainAmount) },
      { line: "35", description: "Income limitation", value: formatValue(result.incomeLimitation) },
      { line: "36", description: "Combined QBI, REIT, and PTP", value: formatValue(result.combinedComponent) },
      { line: "37", description: "QBI deduction before DPAD", value: formatValue(result.qbiDeductionBeforeDPAD) },
      { line: "38", description: "Section 199A(g) DPAD from cooperatives", value: formatValue(result.cooperativeDPAD) },
      { line: "39", description: "Section 199A deduction", value: formatValue(result.qbiDeduction) },
      { line: "40", description: "QBI loss carryforward", value: formatValue(result.qbiLossCarryforward) },
    ],
    totals: [
      { label: "Allowed section 199A deduction", value: formatValue(result.qbiDeduction) },
      { label: "Tracked QBI loss carryforward", value: formatValue(result.qbiLossCarryforward) },
    ],
  };
}

function ensureSpace(
  y: number,
  minY: number,
  newPage: () => void,
) {
  if (y < minY) {
    newPage();
    return PAGE_HEIGHT - PAGE_MARGIN;
  }

  return y;
}

export async function fillForm8995AReference(
  result: Form8995AResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm8995AReferenceSummary(result);
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
    "This page is not an official filed Form 8995-A. It exists so draft packets disclose exactly which detailed QBI outputs the engine supports today.",
    {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 10,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  const drawSectionHeader = (label: string) => {
    y = ensureSpace(y - 18, 90, newPage);
    y = drawWrappedText(page, label, {
      font: bold,
      size: 12,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 16,
    });
  };

  drawSectionHeader("Overall supported lines");
  for (const line of summary.overallLines) {
    y = ensureSpace(y - 6, 90, newPage);
    y = drawWrappedText(page, `Line ${line.line}: ${line.description} = ${line.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });
  }

  if (summary.businesses.length > 0) {
    drawSectionHeader("Trade or business details");
    for (const entity of summary.businesses) {
      y = ensureSpace(y - 6, 90, newPage);
      y = drawWrappedText(page, `${entity.name}${entity.isSST ? " (SSTB)" : ""}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 14,
      });
      const detail = `Line 1 QBI ${entity.line1QBI}; Line 3 W-2 wages ${entity.line3W2Wages}; Line 5 UBIA ${entity.line5UBIA}; Line 9 limit ${entity.line9W2UBIALimit}; Line 15 component ${entity.line15QBIComponent}`;
      y = drawWrappedText(page, detail, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 14,
      });
    }
  }

  if (summary.ptpBusinesses.length > 0) {
    drawSectionHeader("Qualified PTP details");
    for (const entity of summary.ptpBusinesses) {
      y = ensureSpace(y - 6, 90, newPage);
      y = drawWrappedText(page, entity.name, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 14,
      });
      const detail = `Line 1 QBI ${entity.line1QBI}; Line 3 W-2 wages ${entity.line3W2Wages}; Line 5 UBIA ${entity.line5UBIA}; Line 9 limit ${entity.line9W2UBIALimit}; Line 15 component ${entity.line15QBIComponent}`;
      y = drawWrappedText(page, detail, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 14,
      });
    }
  }

  if (summary.aggregationGroups.length > 0) {
    drawSectionHeader("Aggregation elections");
    for (const group of summary.aggregationGroups) {
      y = ensureSpace(y - 6, 90, newPage);
      y = drawWrappedText(page, `${group.name}: ${group.componentBusinessNames.join(", ")}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 14,
      });
      y = drawWrappedText(
        page,
        `Combined QBI ${group.combinedQBI}; combined W-2 wages ${group.combinedW2Wages}; combined UBIA ${group.combinedUBIA}`,
        {
          font: regular,
          size: BODY_FONT_SIZE,
          x: PAGE_MARGIN + 12,
          y: y - 2,
          maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
          lineHeight: 14,
        },
      );
    }
  }

  if (summary.patronageResults.length > 0) {
    drawSectionHeader("Patronage adjustments");
    for (const patronage of summary.patronageResults) {
      y = ensureSpace(y - 6, 90, newPage);
      y = drawWrappedText(page, patronage.cooperativeName, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 14,
      });
      y = drawWrappedText(
        page,
        `Schedule D inputs: allocable QBI ${patronage.qbiAllocable}, 9% amount ${patronage.ninePercentQBI}, allocable W-2 ${patronage.w2WagesAllocable}, 50% W-2 ${patronage.fiftyPercentW2}, patron reduction ${patronage.patronReduction}, DPAD ${patronage.cooperativeDPAD}`,
        {
          font: regular,
          size: BODY_FONT_SIZE,
          x: PAGE_MARGIN + 12,
          y: y - 2,
          maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
          lineHeight: 14,
        },
      );
    }
  }

  drawSectionHeader("Tracked totals");
  for (const total of summary.totals) {
    y = ensureSpace(y - 6, 90, newPage);
    y = drawWrappedText(page, `${total.label}: ${total.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });
  }

  const pdfBytes = await doc.save();
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_8995_A_REFERENCE_FILENAME);
  await writeFile(outputPath, pdfBytes);
  return outputPath;
}
