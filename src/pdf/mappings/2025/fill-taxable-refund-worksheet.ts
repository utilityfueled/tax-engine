import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form1099G, TaxableRefundWorksheetInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { TaxableRefundWorksheetResult } from "@/engine/forms/taxable-refund-worksheet.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_WORKSHEET_LINES = [
  "1",
  "2",
  "3",
  "4",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "sales_tax_alt_cap",
  "result",
] as const;

const INCLUDED_WORKSHEET_LINE_SET = new Set<string>(INCLUDED_WORKSHEET_LINES);

export const TAXABLE_REFUND_WORKSHEET_REFERENCE_FILENAME =
  "taxable-refund-worksheet-reference-filled.pdf";

export interface TaxableRefundWorksheetReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface TaxableRefundWorksheetReferenceSummarySection {
  heading: string;
  lines: TaxableRefundWorksheetReferenceSummaryLine[];
}

export interface TaxableRefundWorksheetReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface TaxableRefundWorksheetReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  sections: TaxableRefundWorksheetReferenceSummarySection[];
  totals: TaxableRefundWorksheetReferenceSummaryTotal[];
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

function humanizeFilingStatus(status: TaxableRefundWorksheetInput["priorYearFilingStatus"]) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatValue(value: CalculatedLine["value"] | string | number | undefined) {
  if (value === undefined) {
    return "0";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  return value.toString();
}

function getWorksheetLines(result: TaxableRefundWorksheetResult) {
  return result.lines
    .filter((line) => INCLUDED_WORKSHEET_LINE_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_WORKSHEET_LINES.indexOf(left.line as typeof INCLUDED_WORKSHEET_LINES[number])
        - INCLUDED_WORKSHEET_LINES.indexOf(right.line as typeof INCLUDED_WORKSHEET_LINES[number]),
    );
}

export function buildTaxableRefundWorksheetReferenceSummary(
  forms: Form1099G[],
  worksheet: TaxableRefundWorksheetInput,
  result: TaxableRefundWorksheetResult,
): TaxableRefundWorksheetReferenceSummary {
  const refundInputLines = forms.length > 0
    ? forms.map((form, index) => ({
      line: `1099-G #${index + 1}`,
      description: `${form.payer} Box 2 state/local income tax refund${form.refundTaxYear ? ` for tax year ${form.refundTaxYear}` : ""}`,
      value: formatValue(form.stateLocalIncomeTaxRefund),
      formula: "Supported Form 1099-G Box 2 amount included in Worksheet Line 1.",
    }))
    : [{
      line: "1099-G",
      description: "Supported Form 1099-G Box 2 state/local income tax refunds",
      value: "0",
      formula: "No supported Form 1099-G Box 2 refunds were provided.",
    }];

  return {
    title: "Taxable Refund Worksheet Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction:
      "Computed from supported Form 1099-G Box 2 refunds and prior-year Schedule A comparison inputs used to support Schedule 1 Line 1.",
    sections: [
      {
        heading: "Refund inputs",
        lines: refundInputLines,
      },
      {
        heading: "Prior-year comparison inputs",
        lines: [
          {
            line: "itemized",
            description: "Prior-year return itemized deductions",
            value: worksheet.priorYearItemized ? "Yes" : "No",
            formula: "Provided by taxableRefundWorksheet.priorYearItemized.",
          },
          {
            line: "status",
            description: "Prior-year filing status",
            value: humanizeFilingStatus(worksheet.priorYearFilingStatus),
            formula: "Provided by taxableRefundWorksheet.priorYearFilingStatus.",
          },
          {
            line: "sched-a",
            description: "Prior-year Schedule A Line 17 itemized deductions",
            value: formatValue(worksheet.priorYearItemizedTotal),
            formula: "Provided by taxableRefundWorksheet.priorYearItemizedTotal.",
          },
          {
            line: "std",
            description: "Prior-year Form 1040 Line 12a standard deduction",
            value: formatValue(worksheet.priorYearStandardDeduction),
            formula: "Provided by taxableRefundWorksheet.priorYearStandardDeduction.",
          },
          {
            line: "salt-paid",
            description: "Prior-year state and local income taxes paid before the SALT cap",
            value: formatValue(worksheet.priorYearStateLocalTaxesPaid),
            formula: "Provided by taxableRefundWorksheet.priorYearStateLocalTaxesPaid.",
          },
          {
            line: "sales-tax-alt",
            description: "Prior-year alternative general sales tax deduction",
            value: formatValue(worksheet.priorYearAlternativeGeneralSalesTaxDeduction),
            formula: "Provided by taxableRefundWorksheet.priorYearAlternativeGeneralSalesTaxDeduction.",
          },
        ],
      },
      {
        heading: "Taxable Refund Worksheet",
        lines: getWorksheetLines(result).map((line) => ({
          line: line.line,
          description: line.description,
          value: formatValue(line.value),
          formula: line.formula,
        })),
      },
    ],
    totals: [
      {
        label: "Total Form 1099-G Box 2 refunds",
        value: result.totalRefund.toString(),
      },
      {
        label: "Tax benefit amount before SALT-cap adjustments",
        value: result.taxBenefitAmount.toString(),
      },
      {
        label: "Excess over SALT cap",
        value: result.excessOverSaltCap.toString(),
      },
      {
        label: "Alternative sales-tax comparison cap",
        value: result.alternativeSalesTaxCap.toString(),
      },
      {
        label: "Schedule 1 Line 1 taxable refund",
        value: result.taxableRefund.toString(),
      },
      {
        label: "SALT cap adjustment applied",
        value: result.saltCapApplied ? "Yes" : "No",
      },
      {
        label: "Alternative sales-tax cap applied",
        value: result.alternativeSalesTaxCapApplied ? "Yes" : "No",
      },
    ],
  };
}

export async function fillTaxableRefundWorksheetReference(
  forms: Form1099G[],
  worksheet: TaxableRefundWorksheetInput,
  result: TaxableRefundWorksheetResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildTaxableRefundWorksheetReferenceSummary(forms, worksheet, result);
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
    "This page summarizes the supported taxable-refund worksheet inputs and outputs that feed Schedule 1 Line 1. It is not an official IRS worksheet attachment.",
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
    if (y < 110) {
      newPage();
    }

    y = drawWrappedText(page, section.heading, {
      font: bold,
      size: 12,
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

      y = drawWrappedText(page, `${line.line}: ${line.description} = ${line.value}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 13,
      });

      y = drawWrappedText(page, `Formula: ${line.formula}`, {
        font: regular,
        size: 9,
        x: PAGE_MARGIN + 24,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 24,
        lineHeight: 12,
      });

      y -= 4;
    }

    y -= 8;
  }

  if (y < 110) {
    newPage();
  }

  y = drawWrappedText(page, "Key totals", {
    font: bold,
    size: 12,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 16,
  });

  y -= 4;

  for (const total of summary.totals) {
    if (y < 90) {
      newPage();
    }

    y = drawWrappedText(page, `${total.label}: ${total.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 3;
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, TAXABLE_REFUND_WORKSHEET_REFERENCE_FILENAME);
  const bytes = await doc.save();
  await writeFile(outputPath, bytes);
  return outputPath;
}
