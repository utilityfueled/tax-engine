import Decimal from "decimal.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { codCreditCarryReference } from "./cod-attribute-carry-reference.js";
import type { CalculatedLine, TaxReturnResult } from "@/models/outputs.js";
import type { Form8801Result } from "@/engine/forms/form-8801.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_8801_LINES = Array.from({ length: 55 }, (_, index) => String(index + 1));

const INCLUDED_FORM_8801_LINE_SET = new Set<string>(INCLUDED_FORM_8801_LINES);

export const FORM_8801_REFERENCE_FILENAME = "f8801-reference-filled.pdf";

export interface Form8801ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form8801ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form8801ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  lines: Form8801ReferenceSummaryLine[];
  totals: Form8801ReferenceSummaryTotal[];
}

function sanitizePdfText(text: string) {
  return text
    .replace(/\b(Form|Schedule|line|year)(?=\d)/gi, "$1 ")
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

function formatValue(line: CalculatedLine) {
  return line.value.toString();
}

function getReferenceLines(result: Form8801Result) {
  const byLine = new Map<string, CalculatedLine>();
  for (const line of result.lines) {
    if (line.form !== "Form 8801" || !INCLUDED_FORM_8801_LINE_SET.has(line.line)) continue;
    if (byLine.has(line.line) || !Decimal.isDecimal(line.value) || !line.value.isFinite()) throw new Error(`Form 8801 reference requires unique finite audit line ${line.line}`);
    byLine.set(line.line, line);
  }
  const hasPartIII = INCLUDED_FORM_8801_LINES.slice(26).some(line => byLine.has(line));
  const required = INCLUDED_FORM_8801_LINES.slice(0, hasPartIII ? 55 : 26);
  for (const line of required) if (!byLine.has(line)) throw new Error(`Form 8801 reference is missing audit line ${line}`);
  for (const [line, total] of [
    ["4", result.exclusionOnlyAMTI], ["9", result.exemption], ["10", result.amtBaseOnExclusions],
    ["11", result.exclusionOnlyTMT], ["13", result.tentativeMinimumTaxOnExclusionItems],
    ["15", result.netMinTaxOnExclusionItems], ["18", result.minTaxCreditFromPriorYear],
    ["24", result.currentYearLimitation], ["25", result.creditAllowed], ["26", result.carryforwardToNextYear],
  ] as const) if (!byLine.get(line)?.value.eq(total)) throw new Error(`Form 8801 audit line ${line} disagrees with its calculated total`);
  const combined = byLine.get("21");
  if (!combined || !Decimal.max(0, combined.value).eq(result.totalAvailableCredit)) throw new Error("Form 8801 audit line21 disagrees with the usable credit pool");
  return required.map(line => {
    const entry = byLine.get(line);
    if (!entry) throw new Error(`Form 8801 reference is missing audit line ${line}`);
    return entry;
  });
}

export function buildForm8801ReferenceSummary(result: Form8801Result, taxReturn?: TaxReturnResult): Form8801ReferenceSummary {
  assertPdfExportAllowed(2025, result.taxYear);
  if (result.priorYear !== 2024) throw new Error("Form 8801 prior source year must be2024 for this2025 review mapping");
  const cod = codCreditCarryReference(taxReturn, 'minimum_tax_credit', {
    available: result.totalAvailableCredit, used: result.creditAllowed, carry: result.carryforwardToNextYear,
  });
  return {
    title: "Form 8801 Prior Year Minimum Tax Credit Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: `Tax year 2025; prior source year 2024. ${result.sourceFactsVerified ? "Computed from confirmed actual prior-return source worksheets" : "Computed from unverified historical compatibility inputs"}. Values below copy the Form 8801 audit; current-year credit flows to Schedule 3 line 6b.`,
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: cod && line.line === "26" ? `${line.description} before COD` : line.description,
      value: formatValue(line),
      formula: line.formula,
    })),
    totals: [
      {
        label: "Total available minimum tax credit",
        value: result.totalAvailableCredit.toString(),
      },
      {
        label: "Allowable current-year minimum tax credit",
        value: result.creditAllowed.toString(),
      },
      {
        label: cod ? "Carryforward to next year before COD" : "Carryforward to next year",
        value: result.carryforwardToNextYear.toString(),
      },
      ...(cod ? [
        { label: "Minimum tax credit attribute reduction", value: cod.reduction.toFixed() },
        { label: "Minimum tax credit carry after COD", value: cod.closing.toFixed() },
      ] : []),
    ],
  };
}

export async function fillForm8801Reference(
  result: Form8801Result,
  outputDir: string,
  taxReturn?: TaxReturnResult,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm8801ReferenceSummary(result, taxReturn);
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
    "This page summarizes supported Form 8801 prior-year AMT credit computations that feed the Schedule 3 prior-year minimum tax credit line and the tracked carryforward. It is not an official filed Form 8801.",
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
    const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
    const needed = wrapText(`Line ${line.line}: ${line.description}`, bold, BODY_FONT_SIZE, maxWidth).length * 14
      + wrapText(`Value: ${line.value}`, regular, BODY_FONT_SIZE, maxWidth - 12).length * 13
      + wrapText(`Formula: ${line.formula}`, regular, BODY_FONT_SIZE, maxWidth - 12).length * 13 + 10;
    if (y - needed < PAGE_MARGIN) newPage();

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
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
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

  for (const total of summary.totals) {
    const needed = wrapText(`${total.label}: ${total.value}`, regular, BODY_FONT_SIZE, PAGE_WIDTH - PAGE_MARGIN * 2 - 12).length * 13 + 6;
    if (y - needed < PAGE_MARGIN) newPage();
    y = drawWrappedText(page, `${total.label}: ${total.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 4,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  }

  await markReviewPdf(doc);
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_8801_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
