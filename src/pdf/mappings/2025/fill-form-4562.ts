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
import { calculateForm4562, type Form4562Result } from "@/engine/forms/form-4562.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_4562_LINES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "19",
  "20",
  "21",
  "22",
  "42",
  "43",
  "44",
] as const;

const INCLUDED_FORM_4562_LINE_SET = new Set<string>(INCLUDED_FORM_4562_LINES);

export const FORM_4562_REFERENCE_FILENAME = "f4562-reference-filled.pdf";

export interface Form4562ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
}

export interface Form4562ReferenceSummaryActivity {
  activityLabel: string;
  downstreamBridgeLabel: string;
  downstreamBridgeValue: string;
  amortizationBridgeLabel: string;
  amortizationBridgeValue: string;
  recaptureLabel: string;
  recaptureValue: string;
  lines: Form4562ReferenceSummaryLine[];
}

export interface Form4562ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  activityCount: number;
  activities: Form4562ReferenceSummaryActivity[];
}

interface Form4562ReferenceActivitySource {
  activityLabel: string;
  downstreamBridgeLabel: string;
  downstreamBridgeValue: Decimal;
  amortizationBridgeLabel: string;
  amortizationBridgeValue: Decimal;
  recaptureLabel: string;
  recaptureValue: Decimal;
  result: Form4562Result;
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

function getReferenceLines(result: Form4562Result) {
  return result.lines
    .filter((line) => line.form === "Form 4562" && INCLUDED_FORM_4562_LINE_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_4562_LINES.indexOf(left.line as typeof INCLUDED_FORM_4562_LINES[number])
        - INCLUDED_FORM_4562_LINES.indexOf(right.line as typeof INCLUDED_FORM_4562_LINES[number]),
    );
}

function toSummaryLines(lines: CalculatedLine[]): Form4562ReferenceSummaryLine[] {
  return lines.map((line) => ({
    line: line.line,
    description: line.description,
    value: line.value.toString(),
  }));
}

function collectForm4562ReferenceActivities(input: TaxYearInput): Form4562ReferenceActivitySource[] {
  const activities: Form4562ReferenceActivitySource[] = [];

  if (input.scheduleC && input.form4562) {
    const result = calculateForm4562(input.form4562);
    const activityName = input.scheduleC.businessName
      ? `Schedule C: ${input.scheduleC.businessName}`
      : "Schedule C activity";

    activities.push({
      activityLabel: activityName,
      downstreamBridgeLabel: "Schedule C Line 13 depreciation and section 179 deduction",
      downstreamBridgeValue: result.line22,
      amortizationBridgeLabel: "Supplemental amortization reference (Form 4562 Line 44)",
      amortizationBridgeValue: result.line44,
      recaptureLabel: "IRC Section 280F recapture income",
      recaptureValue: result.section280FRecaptureIncome,
      result,
    });
  }

  for (const property of input.rentalProperties ?? []) {
    if (!property.form4562) {
      continue;
    }

    const result = calculateForm4562(property.form4562);
    activities.push({
      activityLabel: `Rental property: ${property.description}`,
      downstreamBridgeLabel: "Schedule E depreciation bridge from Form 4562 lines 14-21",
      downstreamBridgeValue: result.line14
        .plus(result.line15)
        .plus(result.line16)
        .plus(result.line17)
        .plus(result.line19)
        .plus(result.line20)
        .plus(result.line21),
      amortizationBridgeLabel: "Schedule E other-expense bridge from Form 4562 Line 44",
      amortizationBridgeValue: result.line44,
      recaptureLabel: "IRC Section 280F recapture income",
      recaptureValue: result.section280FRecaptureIncome,
      result,
    });
  }

  return activities;
}

export function hasForm4562ReferenceSummary(input: TaxYearInput) {
  return collectForm4562ReferenceActivities(input).length > 0;
}

export function buildForm4562ReferenceSummary(input: TaxYearInput): Form4562ReferenceSummary {
  const activities = collectForm4562ReferenceActivities(input);

  if (activities.length === 0) {
    throw new Error("Form 4562 reference summary requires supported Schedule C or rental-property Form 4562 input");
  }

  return {
    title: "Form 4562 Depreciation and Amortization Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: `Computed from ${activities.length} supported Form 4562 activit${activities.length === 1 ? "y" : "ies"} that feed Schedule C or Schedule E.`,
    activityCount: activities.length,
    activities: activities.map((activity) => ({
      activityLabel: activity.activityLabel,
      downstreamBridgeLabel: activity.downstreamBridgeLabel,
      downstreamBridgeValue: activity.downstreamBridgeValue.toString(),
      amortizationBridgeLabel: activity.amortizationBridgeLabel,
      amortizationBridgeValue: activity.amortizationBridgeValue.toString(),
      recaptureLabel: activity.recaptureLabel,
      recaptureValue: activity.recaptureValue.toString(),
      lines: toSummaryLines(getReferenceLines(activity.result)),
    })),
  };
}

export async function fillForm4562Reference(
  input: TaxYearInput,
  outputDir: string,
) {
  assertPdfExportAllowed(input.taxpayer.taxYear, input.taxpayer.taxYear);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm4562ReferenceSummary(input);
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
    "This page summarizes supported Form 4562 outputs and the downstream depreciation, amortization, and recapture bridges that affect the federal packet. It is not an official filed Form 4562 copy.",
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

  for (const activity of summary.activities) {
    if (y < 160) {
      newPage();
    }

    y = drawWrappedText(page, activity.activityLabel, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `${activity.downstreamBridgeLabel}: $${activity.downstreamBridgeValue}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `${activity.amortizationBridgeLabel}: $${activity.amortizationBridgeValue}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `${activity.recaptureLabel}: $${activity.recaptureValue}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;

    for (const line of activity.lines) {
      if (y < 90) {
        newPage();
      }

      y = drawWrappedText(page, `Line ${line.line} ${line.description}: $${line.value}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 13,
      });
    }

    y -= 10;
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_4562_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
