import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const IRA_DEDUCTION_WORKSHEET_REFERENCE_FILENAME =
  "ira-deduction-worksheet-reference-filled.pdf";

type IraDeductionWorksheetPacketResult = NonNullable<TaxReturnResult["iraDeductionWorksheet"]>;

export interface IraDeductionWorksheetReferenceLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface IraDeductionWorksheetReferenceSection {
  heading: string;
  lines: IraDeductionWorksheetReferenceLine[];
}

export interface IraDeductionWorksheetReferenceSummary {
  title: string;
  warningLabel: string;
  sections: IraDeductionWorksheetReferenceSection[];
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

function getFormula(
  result: IraDeductionWorksheetPacketResult["primary"],
  line: "contributionLimit" | "deductibleAmount",
) {
  const formula = result.lines.find((entry) => entry.line === line)?.formula;
  if (!formula) {
    throw new Error(`IRA deduction worksheet result is missing ${line} audit metadata`);
  }

  return formula;
}

function buildTaxpayerSection(
  heading: string,
  result: IraDeductionWorksheetPacketResult["primary"],
): IraDeductionWorksheetReferenceSection {
  return {
    heading,
    lines: [
      {
        line: "contributionLimit",
        description: "Maximum allowable IRA contribution",
        value: result.contributionLimit.toString(),
        formula: getFormula(result, "contributionLimit"),
      },
      {
        line: "deductibleAmount",
        description: "Deductible traditional IRA contribution",
        value: result.deductibleAmount.toString(),
        formula: getFormula(result, "deductibleAmount"),
      },
    ],
  };
}

export function buildIraDeductionWorksheetReferenceSummary(
  result: IraDeductionWorksheetPacketResult,
): IraDeductionWorksheetReferenceSummary {
  const sections: IraDeductionWorksheetReferenceSection[] = [
    buildTaxpayerSection("Primary taxpayer", result.primary),
  ];

  if (result.spouse) {
    sections.push(buildTaxpayerSection("Spouse", result.spouse));
  }

  sections.push({
    heading: "Schedule 1 Line 20",
    lines: [
      {
        line: "totalDeduction",
        description: "Combined IRA deduction",
        value: result.totalDeduction.toString(),
        formula: "Primary deductible amount + spouse deductible amount (if any)",
      },
    ],
  });

  return {
    title: "IRA Deduction Worksheet Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    sections,
  };
}

export async function fillIraDeductionWorksheetReference(
  result: IraDeductionWorksheetPacketResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildIraDeductionWorksheetReferenceSummary(result);
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
    "This page summarizes the supported IRA deduction worksheet outputs that feed Schedule 1 Line 20. It is not an official filed worksheet.",
    {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 8,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  y -= 16;

  for (const section of summary.sections) {
    if (y < 100) {
      newPage();
    }

    y = drawWrappedText(page, section.heading, {
      font: bold,
      size: 13,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 16,
    });

    y -= 4;

    for (const line of section.lines) {
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

    y -= 8;
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, IRA_DEDUCTION_WORKSHEET_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
