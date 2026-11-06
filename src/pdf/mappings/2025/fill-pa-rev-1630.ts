import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { REV1630Result } from "@/engine/state/pa-rev-1630.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_REV_1630_REFERENCE_FILENAME = "pa-rev-1630-reference.pdf";

export interface PAREV1630ReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAREV1630ReferenceQuarterSummary {
  quarterLabel: string;
  requiredInstallment: string;
  estimatedPayment: string;
  underpayment: string;
  interest: string;
  exception1Met: boolean;
}

export interface PAREV1630ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  totals: PAREV1630ReferenceSummaryLine[];
  quarters: PAREV1630ReferenceQuarterSummary[];
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

function formatWholeDollar(value: string) {
  return `$${value}`;
}

export function buildPAREV1630ReferenceSummary(
  result: REV1630Result,
): PAREV1630ReferenceSummary {
  if (!result.penaltyRequired || result.totalInterest.lte(0)) {
    throw new Error("PA REV-1630 reference summary requires a positive estimated-underpayment penalty");
  }

  return {
    title: "Pennsylvania REV-1630 Underpayment Interest Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported REV-1630 underpayment-of-estimated-tax computation used to populate PA-40 Line 27. It is not an official filed REV-1630.",
    totals: [
      { label: "Line 1a tax liability", value: result.taxLiability.toString() },
      { label: "Line 1b ninety percent of tax liability", value: result.ninetyPercentTax.toString() },
      { label: "Line 2 withholding and credits", value: result.withholdingAndCredits.toString() },
      { label: "Line 3 net tax owed", value: result.netTaxOwed.toString() },
      { label: "Line 4 underpayment base", value: result.underpaymentBase.toString() },
      { label: "Line 16 total interest penalty", value: result.totalInterest.toString() },
    ],
    quarters: result.quarters.map((quarter, index) => ({
      quarterLabel: `Quarter ${index + 1}`,
      requiredInstallment: quarter.requiredInstallment.toString(),
      estimatedPayment: quarter.estimatedPayment.toString(),
      underpayment: quarter.underpayment.toString(),
      interest: quarter.interest.toString(),
      exception1Met: quarter.exception1Met,
    })),
  };
}

export async function fillPAREV1630Reference(
  result: REV1630Result,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAREV1630ReferenceSummary(result);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

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

  y -= 16;

  for (const total of summary.totals) {
    y = drawWrappedText(page, `${total.label}: ${formatWholeDollar(total.value)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 13,
    });
  }

  y -= 12;

  for (const quarter of summary.quarters) {
    y = drawWrappedText(page, quarter.quarterLabel, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });
    y = drawWrappedText(page, `Required installment: ${formatWholeDollar(quarter.requiredInstallment)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(page, `Estimated payment: ${formatWholeDollar(quarter.estimatedPayment)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(page, `Underpayment: ${formatWholeDollar(quarter.underpayment)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(page, `Interest: ${formatWholeDollar(quarter.interest)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(
      page,
      `Exception 1 safe harbor met: ${quarter.exception1Met ? "yes" : "no"}`,
      {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 13,
      },
    );
    y -= 8;
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, PA_REV_1630_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
