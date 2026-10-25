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
import type { TaxReturnResult } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const SE_HEALTH_INSURANCE_WORKSHEET_REFERENCE_FILENAME =
  "se-health-insurance-worksheet-reference-filled.pdf";

type SEHealthInsuranceWorksheetPacketResult = NonNullable<TaxReturnResult["seHealthInsuranceWorksheet"]>;

export interface SEHealthInsuranceWorksheetReferenceLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface SEHealthInsuranceWorksheetReferenceSection {
  heading: string;
  lines: SEHealthInsuranceWorksheetReferenceLine[];
}

export interface SEHealthInsuranceWorksheetReferenceSummary {
  title: string;
  warningLabel: string;
  sections: SEHealthInsuranceWorksheetReferenceSection[];
}

const WORKSHEET_LINE_METADATA = [
  ["1", "medicalDentalPremiums", "Medical and dental insurance premiums"],
  ["2", "longTermCarePremiumsAllowed", "Qualified long-term care insurance premiums (age-limited)"],
  ["3", "medicarePremiums", "Medicare premiums"],
  ["4", "totalPremiums", "Total premiums before proration"],
  ["5", "eligibleMonths", "Number of months eligible for deduction"],
  ["6", "proratedPremiums", "Prorated premiums"],
  ["7", "netProfit", "Net profit from business"],
  ["8", "deductibleSETax", "Deductible portion of self-employment tax"],
  ["9", "seRetirementContributions", "Self-employed retirement plan contributions"],
  ["10", "earnedIncomeLimit", "Earned income limit"],
  ["11", "deductibleAmount", "Self-employed health insurance deduction"],
  ["excessForScheduleA", "excessForScheduleA", "Excess premiums available for Schedule A medical expenses"],
] as const;

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

function getWorksheetFormula(
  worksheet: SEHealthInsuranceWorksheetPacketResult,
  line: string,
) {
  const auditLine = worksheet.lines.find((entry) => entry.line === line);
  if (!auditLine && line === "excess") {
    return "Prorated premiums minus deductible amount available for Schedule A medical-expense treatment";
  }
  if (!auditLine) {
    throw new Error(`SE health insurance worksheet result is missing ${line} audit metadata`);
  }

  return auditLine.formula;
}

function getWorksheetValue(
  worksheet: SEHealthInsuranceWorksheetPacketResult,
  key: typeof WORKSHEET_LINE_METADATA[number][1],
) {
  if (key === "eligibleMonths") {
    return worksheet.eligibleMonths.toString();
  }

  return worksheet[key].toString();
}

export function buildSEHealthInsuranceWorksheetReferenceSummary(
  result: TaxReturnResult,
): SEHealthInsuranceWorksheetReferenceSummary {
  const worksheet = result.seHealthInsuranceWorksheet;
  if (!worksheet) {
    throw new Error(
      "SE health insurance worksheet reference summary requires result.seHealthInsuranceWorksheet",
    );
  }

  const sections: SEHealthInsuranceWorksheetReferenceSection[] = [
    {
      heading: "Self-Employed Health Insurance Deduction Worksheet",
      lines: WORKSHEET_LINE_METADATA.map(([line, key, description]) => ({
        line,
        description,
        value: getWorksheetValue(worksheet, key),
        formula: getWorksheetFormula(worksheet, line === "excessForScheduleA" ? "excess" : line),
      })),
    },
    {
      heading: "Downstream effects",
      lines: [
        {
          line: "Sched1-17",
          description: "Schedule 1 Line 17 self-employed health insurance deduction",
          value: result.schedule1?.seHealthInsurance.toString() ?? worksheet.deductibleAmount.toString(),
          formula: "Worksheet Line 11 amount carried to Schedule 1 Line 17",
        },
        {
          line: "SchedA-1 support",
          description: "Excess premiums available for Schedule A medical expenses",
          value: worksheet.excessForScheduleA.toString(),
          formula: "Worksheet excess premiums that remain eligible for Schedule A medical-expense treatment",
        },
      ],
    },
  ];

  return {
    title: "Self-Employed Health Insurance Worksheet Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    sections,
  };
}

export async function fillSEHealthInsuranceWorksheetReference(
  result: TaxReturnResult,
  outputDir: string,
) {
  assertPdfExportAllowed(result.taxYear, result.taxYear);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildSEHealthInsuranceWorksheetReferenceSummary(result);
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
    "This page summarizes the supported Pub. 535 self-employed health insurance deduction worksheet outputs that feed Schedule 1 Line 17. It is not an official filed worksheet.",
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

      y -= 8;
    }
  }

  const outputPath = join(outputDir, SE_HEALTH_INSURANCE_WORKSHEET_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
