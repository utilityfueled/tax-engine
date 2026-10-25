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
import type { CalculatedLine } from "@/models/outputs.js";
import type { Form2555Result } from "@/engine/forms/form-2555.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const PART_IV_LINES = ["19", "20a", "20b", "21a", "21b", "21c", "21d", "22a", "22b", "22c", "22d", "22e", "22f", "22g", "23", "24", "25"];
const REQUIRED_LINES = ["26", "27", "28", "29b", ...Array.from({ length: 21 }, (_, i) => String(i + 30)), "carryover"];
const INCLUDED_FORM_2555_LINE_SET = new Set([...PART_IV_LINES, ...REQUIRED_LINES]);

export const FORM_2555_REFERENCE_FILENAME = "f2555-reference-filled.pdf";

export interface Form2555ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form2555ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  lines: Form2555ReferenceSummaryLine[];
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/(Part)([IVX]+)/g, "$1 $2").replace(/(\d)(?=line)/g, "$1 ").replace(/\b(Form|Schedule|line|year)(?=\d)/gi, "$1 ").replace(/→/g, "->").replace(/[−–—]/g, "-").replace(/[^\x20-\x7E\n\t]/g, "").trim().split(/\s+/).filter(Boolean);

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

function getReferenceLines(result: Form2555Result) {
  const byLine = new Map<string, CalculatedLine>();
  for (const line of result.lines) {
    if (line.form !== "2555" || !INCLUDED_FORM_2555_LINE_SET.has(line.line)) continue;
    if (byLine.has(line.line) || !Decimal.isDecimal(line.value) || !line.value.isFinite()) throw new Error(`Form2555 reference requires unique finite audit line${line.line}`);
    byLine.set(line.line, line);
  }
  const hasPartIV = result.sourceFactsVerified || PART_IV_LINES.some(line => byLine.has(line));
  const required = [...(hasPartIV ? PART_IV_LINES : []), ...REQUIRED_LINES];
  for (const line of required) if (!byLine.has(line)) throw new Error(`Form2555 reference is missing audit line${line}`);
  for (const [line, total] of [
    ["26", result.foreignEarnedIncome], ["27", result.foreignEarnedIncome], ["29b", result.housingExpenseLimit],
    ["30", result.qualifiedHousingExpensesCapped], ["32", result.baseHousingAmount], ["33", result.housingAmount],
    ["36", result.housingExclusion], ["37", result.maximumExclusion], ["40", result.proratedMaximumExclusion],
    ["41", result.incomeAvailableForExclusion], ["42", result.foreignEarnedIncomeExclusion], ["43", result.totalExclusion],
    ["45", result.netExclusion], ["50", result.housingDeduction], ["carryover", result.housingDeductionCarryover],
  ] as const) if (!byLine.get(line)?.value.eq(total)) throw new Error(`Form2555 audit line${line} disagrees with its calculated total`);
  if (!result.netExclusion.eq(result.totalIncomeReduction) || !result.netExclusion.plus(result.housingDeduction).eq(result.foreignEarnedIncomeTaxWorksheetAmount)) throw new Error("Form2555 audit totals disagree with return routing");
  return required.map(line => {
    const entry = byLine.get(line);
    if (!entry) throw new Error(`Form2555 reference is missing audit line${line}`);
    return entry;
  });
}

export function buildForm2555ReferenceSummary(result: Form2555Result): Form2555ReferenceSummary {
  assertPdfExportAllowed(2025, result.taxYear);
  return {
    title: "Form 2555 Foreign Earned Income Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: `Tax year2025. ${result.sourceFactsVerified ? "Computed from confirmed actual PartIV and source worksheets" : "Computed from unverified historical aggregate inputs; detailed source facts are not reconstructed"}. Values copy the Form2555 audit.`,
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: line.description,
      value: formatValue(line),
      formula: line.formula,
    })),
  };
}

export async function fillForm2555Reference(
  result: Form2555Result,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm2555ReferenceSummary(result);
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
    "Gross income remains in its original return sources. Net line45 enters Schedule1line8d as a negative amount; housing line50 enters Schedule1line24j. The stacking worksheet starts with 45+50. This is not an official filled Form2555; residence, travel, eligibility and election attachments require actual source records and independent qualification.",
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
      + wrapText(`Formula: ${line.formula}`, regular, BODY_FONT_SIZE - 0.5, maxWidth - 12).length * 13 + 10;
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
      size: BODY_FONT_SIZE - 0.5,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  await markReviewPdf(doc);
  const filePath = join(outputDir, FORM_2555_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save());
  return filePath;
}
