import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { CalculatedLine } from "@/models/outputs.js";
import type { Form461Result } from "@/engine/forms/form-461.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_461_LINES = ["2","3","4","5","6","8","9","10","11","12","13","14","15","16","NOL"] as const;

export const FORM_461_REFERENCE_FILENAME = "f461-reference-filled.pdf";

export interface Form461ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form461ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form461ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  lines: Form461ReferenceSummaryLine[];
  totals: Form461ReferenceSummaryTotal[];
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

function formatValue(line: CalculatedLine) {
  return line.value.toString();
}

function getReferenceLines(result: Form461Result) {
  if (![2025,2026].includes(result.taxYear)) throw new Error("Form461 reference requires a supported actual year");
  const retained = [result.line2ScheduleC,result.line3CapitalGainOrLoss,result.line4Form4797,result.line5ScheduleE,result.line6ScheduleF,
    result.line8OtherBusiness,result.line9TotalIncomeLoss,result.line10NonbusinessIncome,result.line11NonbusinessLosses,
    result.line12NonbusinessNet,result.line13Adjustment,result.line14NetBusinessAmount,result.line15Threshold,result.line16NetAfterThreshold,result.nolCarryforward];
  return INCLUDED_FORM_461_LINES.map((id,index)=>{
    const entries=result.lines.filter(line=>line.form==="Form 461"&&line.line===id);
    const expected=retained[index];
    if(entries.length!==1 || !expected?.isFinite() || !entries[0]?.value.isFinite() || !entries[0].value.eq(expected)) {
      throw new Error(`Form461 canonical audit ${id} is missing, duplicated or inconsistent`);
    }
    return entries[0];
  });
}

export function buildForm461ReferenceSummary(result: Form461Result): Form461ReferenceSummary {
  return {
    title: "Form 461 Excess Business Loss Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: `Tax year ${result.taxYear}. ${result.sourceFactsVerified ? "Actual completed business classifications were supplied." : "Historical classification is an unverified preview; final source classifications remain required."} Employee wages are excluded; lines 1 and 7 are reserved.`,
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: line.description,
      value: formatValue(line),
      formula: line.formula,
    })),
    totals: [
      {
        label: "Schedule 1 Line 8p add-back",
        value: result.line16ExcessBusinessLoss.toString(),
      },
      {
        label: "Excess business loss NOL carryforward",
        value: result.nolCarryforward.toString(),
      },
    ],
  };
}

export async function fillForm461Reference(
  result: Form461Result,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm461ReferenceSummary(result);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - PAGE_MARGIN;
    page.drawText(`REFERENCE SUMMARY ONLY - Tax year ${result.taxYear}`,{x:PAGE_MARGIN,y,font:bold,size:11,color:WARNING_COLOR});
    y -= 26;
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
    "This page summarizes the supported Form 461 excess-business-loss limitation outputs that drive Schedule 1 Line 8p and the tracked NOL carryforward. It is not an official filed Form 461.",
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

  for (const line of summary.lines) {
    if (y < 90) {
      newPage();
    }

    y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
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
      size: BODY_FONT_SIZE - 0.5,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
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
  const outputPath = join(outputDir, FORM_461_REFERENCE_FILENAME);
  const bytes = await doc.save();
  await writeFile(outputPath, bytes);
  return outputPath;
}
