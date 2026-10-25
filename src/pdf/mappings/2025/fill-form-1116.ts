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
import type { CalculatedLine, TaxReturnResult } from "@/models/outputs.js";
import Decimal from "decimal.js";
import { d, sum } from "@/utils/decimal.js";
import { DIRECT_FOREIGN_CREDIT_FORM, directForeignCreditReferenceLines } from './foreign-tax-direct-reference.js';
import { ordinaryForeignCreditReferenceSections } from './foreign-tax-ordinary-reference.js';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_1116_LINES = [
  "simplified_eligible",
  "1a",
  "3e",
  "3f",
  "7",
  "20",
  "21",
  "carryforward",
  "schedule-b-used",
  "schedule-b-expired",
] as const;

const INCLUDED_FORM_1116_LINE_SET = new Set<string>(INCLUDED_FORM_1116_LINES);

export const FORM_1116_REFERENCE_FILENAME = "f1116-reference-filled.pdf";

export interface Form1116ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form1116ReferenceSummarySection {
  form: string;
  lines: Form1116ReferenceSummaryLine[];
}

export interface Form1116ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  sections: Form1116ReferenceSummarySection[];
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

function isForm1116AuditLine(line: CalculatedLine) {
  return line.form === "Form 1116" || line.form.startsWith("Form 1116 (");
}

function normalizeFormula(formula: string) {
  return formula.replaceAll("≤", "<=").replaceAll("×", "x");
}

function formatLineValue(line: CalculatedLine) {
  if (line.line === "simplified_eligible") {
    return line.value.eq(1) ? "Yes" : "No";
  }

  return line.value.toString();
}

const DEDUCTION_CARRYOVER_FORM = "Foreign Deduction Carryover WS";

/** A deduction-year record copies canonical audits; it does not compute another credit. */
function deductionYearReferenceLines(result: TaxReturnResult): CalculatedLine[] | undefined {
  const carry = result.foreignTaxDeductionCarryover;
  const canonical = result.allLines.filter(line => line.form === DEDUCTION_CARRYOVER_FORM);
  if (!carry) {
    if (canonical.length) throw new Error("Foreign carryover audit is missing its calculated source result");
    return undefined;
  }
  if (result.scheduleA?.foreignTaxElection.election !== "deduction" || !result.foreignTaxCredit.isZero()) {
    throw new Error("Foreign carryover record requires the actual deduction election and zero current credit");
  }
  const finite = (value: Decimal): boolean => Decimal.isDecimal(value) && value.isFinite();
  const nonnegative = (value: Decimal): boolean => finite(value) && value.gte(0);
  const auditById = new Map<string, CalculatedLine>();
  for (const line of canonical) {
    if (auditById.has(line.line) || !finite(line.value)) throw new Error("Foreign carryover audit is duplicate or invalid");
    auditById.set(line.line, line);
  }
  if (!carry.lines.length || canonical.length !== carry.lines.length) throw new Error("Foreign carryover audit is incomplete");
  const copied = new Set<string>();
  for (const line of carry.lines) {
    const actual = auditById.get(line.line);
    if (line.form !== DEDUCTION_CARRYOVER_FORM || copied.has(line.line) || !actual || !finite(line.value)
      || !actual.value.eq(line.value) || actual.formula !== line.formula || actual.description !== line.description) {
      throw new Error("Foreign carryover audit does not match its calculated source result");
    }
    copied.add(line.line);
  }
  const required = (id: string): CalculatedLine => {
    const line = auditById.get(id);
    if (!line) throw new Error(`Foreign carryover audit is missing ${id}`);
    return line;
  };
  for (const id of ["18", "19", "20"]) if (!nonnegative(required(id).value)) throw new Error("Foreign carryover audit is invalid");
  if (required("19").value.gt(1)) throw new Error("Foreign carryover audit ratio is invalid");
  for (const [id, value] of [["21", carry.hypotheticalLimitation], ["current-tax", carry.currentQualifiedForeignTaxes],
    ["absorbed", carry.absorbed], ["expired", carry.expired], ["carryforward", carry.carryforward]] as const) {
    if (!nonnegative(value) || !required(id).value.eq(value)) throw new Error("Foreign carryover audit totals do not reconcile");
  }
  const seen = new Set<string>();
  for (const row of carry.details) {
    const key = `${row.category}:${row.originTaxYear}`;
    if (seen.has(key) || !["passive", "general"].includes(row.category) || !Number.isInteger(row.originTaxYear)
      || row.originTaxYear >= result.taxYear || row.originTaxYear < result.taxYear - 10
      || ![row.amount, row.absorbed, row.expired, row.remaining].every(nonnegative)
      || !row.amount.eq(sum(row.absorbed, row.expired, row.remaining))) {
      throw new Error("Foreign carryover source balances do not conserve their actual prior amounts");
    }
    seen.add(key);
    const line = required(`${key}:remaining`);
    if (!line.value.eq(row.remaining)) throw new Error("Foreign carryover audit balance does not reconcile");
    for (const [name, value] of [["available", row.amount], ["absorbed", row.absorbed], ["expired", row.expired]] as const) {
      const actual = line.inputs[name];
      if (!Decimal.isDecimal(actual) || !actual.eq(value)) throw new Error("Foreign carryover audit inputs do not reconcile");
    }
  }
  for (const [field, value] of [["absorbed", carry.absorbed], ["expired", carry.expired], ["remaining", carry.carryforward]] as const) {
    if (!sum(...carry.details.map(row => row[field])).eq(value)) throw new Error("Foreign carryover source totals do not reconcile");
  }
  if (!result.carryforwards.foreignTaxCreditCarryforward.eq(carry.carryforward)) throw new Error("Foreign carryover return total does not reconcile");
  const expected = new Map(carry.details.filter(row => row.remaining.gt(0)).map(row => [`${row.category}:${row.originTaxYear}`, row.remaining]));
  for (const groups of [carry.carryforwardByCategory, result.carryforwards.foreignTaxCreditCarryforwardByCategory]) {
    const actual = new Map<string, Decimal>();
    for (const [category, rows] of Object.entries(groups)) for (const row of rows ?? []) {
      const key = `${category}:${row.taxYear}`;
      if (actual.has(key) || !nonnegative(row.amount)) throw new Error("Foreign carryover category records are invalid");
      if (row.amount.gt(0)) actual.set(key, row.amount);
    }
    if (actual.size !== expected.size || [...expected].some(([key, value]) => !value.eq(actual.get(key) ?? d("-1")))) {
      throw new Error("Foreign carryover category records do not reconcile");
    }
  }
  return carry.lines.map(line => {
    const actual = required(line.line);
    const detail = carry.details.find(row => `${row.category}:${row.originTaxYear}:remaining` === line.line);
    return detail ? { ...actual, formula: `Prior balance ${detail.amount}; deemed absorbed ${detail.absorbed}; expired ${detail.expired}; remaining ${detail.remaining}. No current tax benefit.` } : actual;
  });
}

function getReferenceLinesByForm(result: TaxReturnResult) {
  const ordinarySections = ordinaryForeignCreditReferenceSections(result);
  if (ordinarySections) return ordinarySections;
  const directLines = directForeignCreditReferenceLines(result);
  if (directLines) return [{ form: DIRECT_FOREIGN_CREDIT_FORM, lines: directLines }];
  const deductionLines = deductionYearReferenceLines(result);
  if (deductionLines) return [{ form: DEDUCTION_CARRYOVER_FORM, lines: deductionLines }];
  const grouped = new Map<string, CalculatedLine[]>();

  for (const line of result.allLines) {
    if (!isForm1116AuditLine(line) || !INCLUDED_FORM_1116_LINE_SET.has(line.line)) {
      continue;
    }

    const existing = grouped.get(line.form);
    if (existing) {
      existing.push(line);
    } else {
      grouped.set(line.form, [line]);
    }
  }

  return [...grouped.entries()].map(([form, lines]) => ({
    form,
    lines: [...lines].sort(
      (left, right) => INCLUDED_FORM_1116_LINES.indexOf(left.line as typeof INCLUDED_FORM_1116_LINES[number])
        - INCLUDED_FORM_1116_LINES.indexOf(right.line as typeof INCLUDED_FORM_1116_LINES[number]),
    ),
  }));
}

export function shouldIncludeForm1116ReferenceSummary(result: TaxReturnResult) {
  const sections = getReferenceLinesByForm(result);
  if (sections.length === 0) {
    return false;
  }

  const hasSeparateCategorySection = sections.some((section) => section.form !== "Form 1116");
  if (hasSeparateCategorySection) {
    return true;
  }

  const lines = sections.flatMap((section) => section.lines);
  const simplifiedEligibleLine = lines.find((line) => line.line === "simplified_eligible");
  const hasCarryforwardFilingActivity = lines.some((line) =>
    line.line === "schedule-b-used"
    || line.line === "schedule-b-expired"
    || (line.line === "7" && line.formula.includes("carryforward from")),
  );

  if (!simplifiedEligibleLine) {
    return true;
  }

  return simplifiedEligibleLine.value.eq(0) || hasCarryforwardFilingActivity;
}

export function buildForm1116ReferenceSummary(result: TaxReturnResult): Form1116ReferenceSummary {
  const sections = getReferenceLinesByForm(result).map((section) => ({
    form: section.form,
    lines: section.lines.map((line) => ({
      line: line.line,
      description: line.description,
      value: formatLineValue(line),
      formula: normalizeFormula(line.formula),
    })),
  }));

  return {
    title: result.foreignTaxOrdinaryCredit ? "Ordinary Foreign Tax Credit Review Record" : result.foreignTaxDirectCredit ? "Foreign Tax Direct-Credit Election Record" : result.foreignTaxDeductionCarryover
      ? "Foreign Tax Deduction-Year Carryover Record"
      : "Form 1116 Foreign Tax Credit Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: result.foreignTaxOrdinaryCredit
      ? "The actual ordinary passive method keeps regular and AMT taxes, limits and credit histories separate. Current paid taxes precede prior credits; unused current tax is allocated to actual prior-year capacity before forward carry. This review record does not amend a prior return or replace Form 1116 or Schedule B."
      : result.foreignTaxDirectCredit
      ? "The actual section904(j) election uses the eligible paid tax limited by regular tax. No current carry is created. Prior regular and AMT credits are retained without election-year use, subject to their expiration."
      : result.foreignTaxDeductionCarryover
      ? "No current foreign tax credit is claimed, and no deduction of prior carry is allowed. This internal review record shows the hypothetical credit limit, deemed absorption, expiration and remaining prior balances for the actual deduction election."
      : "Computed from supported Form 1116 foreign tax credit audit lines. This artifact appears only when the official filing path requires Form 1116 instead of the no-form simplified election.",
    sections,
  };
}

export async function fillForm1116Reference(result: TaxReturnResult, outputDir: string) {
  assertPdfExportAllowed(result.taxYear, result.taxYear);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm1116ReferenceSummary(result);
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
    result.foreignTaxOrdinaryCredit
      ? "The regular credit feeds Schedule 3 line 1; the separate AMT credit feeds Form 6251 line 8. Each method retains its own carry records. This is not an official filled Form 1116 or Schedule B and does not establish filing qualification."
      : result.foreignTaxDirectCredit
      ? "This is an internal review record of the actual election and prior-credit history. It is not an official Form 1116 or Schedule B and does not establish filing qualification."
      : result.foreignTaxDeductionCarryover
      ? "Current foreign taxes retain their actual deduction treatment. Prior carry is reduced without a current tax benefit. This is not an official Form 1116 or Schedule B and does not establish filing qualification."
      : "This page summarizes the supported Form 1116 limitation, credit, and carryforward outputs that feed Schedule 3 Line 1 and the foreign tax credit carryforward records. It is not an official filled Form 1116.",
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
    if (y < 120) {
      newPage();
    }

    y = drawWrappedText(page, section.form, {
      font: bold,
      size: BODY_FONT_SIZE + 1,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 15,
    });

    for (const line of section.lines) {
      const rowHeight = wrapText(`Line ${line.line}: ${line.description}`, bold, BODY_FONT_SIZE, PAGE_WIDTH - PAGE_MARGIN * 2 - 8).length * 14
        + wrapText(`Value: ${line.value}`, regular, BODY_FONT_SIZE, PAGE_WIDTH - PAGE_MARGIN * 2 - 20).length * 13
        + wrapText(`Formula: ${line.formula}`, regular, BODY_FONT_SIZE - 0.5, PAGE_WIDTH - PAGE_MARGIN * 2 - 20).length * 13 + 16;
      if (y - rowHeight < PAGE_MARGIN + 24) {
        newPage();
      }

      y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 8,
        y: y - 4,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 8,
        lineHeight: 14,
      });

      y = drawWrappedText(page, `Value: ${line.value}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 20,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 20,
        lineHeight: 13,
      });

      y = drawWrappedText(page, `Formula: ${line.formula}`, {
        font: regular,
        size: BODY_FONT_SIZE - 0.5,
        x: PAGE_MARGIN + 20,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 20,
        lineHeight: 13,
      });

      y -= 6;
    }

    y -= 6;
  }

  const filePath = join(outputDir, FORM_1116_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save());
  return filePath;
}
