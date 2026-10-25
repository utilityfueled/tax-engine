import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ScheduleJResult } from "@/engine/state/pa-schedule-j.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_J_REFERENCE_FILENAME = "pa-schedule-j-reference.pdf";

export interface PAScheduleJReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleJReferenceStatementRow {
  estateOrTrustName: string;
  federalEIN: string;
  sourceDocument: string;
  taxableIncome: string;
  nonresidentTaxWithheld: string;
}

export interface PAScheduleJReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleJReferenceSummaryLine[];
  statements: PAScheduleJReferenceStatementRow[];
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

function formatSourceDocumentLabel(sourceDocument: string) {
  switch (sourceDocument) {
    case "pa_rk_1":
      return "PA Schedule RK-1";
    case "pa_nrk_1":
      return "PA Schedule NRK-1";
    case "federal_1041_k1":
      return "Federal Schedule K-1 (Form 1041)";
    default:
      return sourceDocument;
  }
}

export function shouldIncludePAScheduleJReferenceSummary(result: ScheduleJResult) {
  return result.statements.length > 0;
}

export function buildPAScheduleJReferenceSummary(
  result: ScheduleJResult,
): PAScheduleJReferenceSummary {
  if (!shouldIncludePAScheduleJReferenceSummary(result)) {
    throw new Error("PA Schedule J reference summary requires at least one estate or trust statement");
  }

  return {
    title: "Pennsylvania Schedule J Estate or Trust Income Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule J estate-or-trust income computation. It is not an official PA Schedule J filing copy.",
    filingTrigger: "Attach when a Pennsylvania return includes supported estate-or-trust statement detail that flows to PA-40 Line 7 or estate-or-trust nonresident withholding for PA-40 Line 17.",
    totals: [
      { label: "Schedule J total estate or trust income", value: result.totalEstateTrustIncome.toString() },
      { label: "Schedule J total nonresident withholding", value: result.totalNonresidentTaxWithheld.toString() },
    ],
    statements: result.statements.map((statement) => ({
      estateOrTrustName: statement.estateOrTrustName,
      federalEIN: statement.federalEIN,
      sourceDocument: formatSourceDocumentLabel(statement.sourceDocument),
      taxableIncome: statement.taxableIncome.toString(),
      nonresidentTaxWithheld: statement.creditableNonresidentTaxWithheld.toString(),
    })),
  };
}

export async function fillPAScheduleJReference(
  result: ScheduleJResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleJReferenceSummary(result);
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

  y = drawWrappedText(page, summary.filingTrigger, {
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

  for (const statement of summary.statements) {
    y = drawWrappedText(page, statement.estateOrTrustName, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });
    y = drawWrappedText(page, `Federal EIN: ${statement.federalEIN}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(page, `Source document: ${statement.sourceDocument}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(page, `Taxable income carried to Schedule J: ${formatWholeDollar(statement.taxableIncome)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y = drawWrappedText(page, `Creditable PA nonresident withholding: ${formatWholeDollar(statement.nonresidentTaxWithheld)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
    y -= 8;
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, PA_SCHEDULE_J_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
