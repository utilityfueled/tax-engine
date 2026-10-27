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
import type { CalculatedLine, TaxReturnResult } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_982_EXCLUSION_LINES = [
  "982-1a",
  "982-1b",
  "982-1c",
  "982-1d",
  "982-1e",
] as const;

const INCLUDED_FORM_982_REDUCTION_LINES = [
  "part2-108b5",
  "part2-qpr",
  "part2-qrpb",
  "part2-line4",
  "part2-line5",
  "part2-line6",
  "part2-line7",
  "part2-line8",
  "part2-line9",
  "part2-line10",
] as const;

const FORM_982_EXCLUSION_DESCRIPTION: Record<
  typeof INCLUDED_FORM_982_EXCLUSION_LINES[number],
  { line: string; description: string }
> = {
  "982-1a": { line: "1a", description: "Bankruptcy exclusion" },
  "982-1b": { line: "1b", description: "Insolvency exclusion" },
  "982-1c": { line: "1c", description: "Qualified farm exclusion" },
  "982-1d": { line: "1d", description: "Qualified real property business exclusion" },
  "982-1e": { line: "1e", description: "Qualified principal residence exclusion" },
};

const INCLUDED_FORM_982_EXCLUSION_SET = new Set<string>(INCLUDED_FORM_982_EXCLUSION_LINES);
const INCLUDED_FORM_982_REDUCTION_SET = new Set<string>(INCLUDED_FORM_982_REDUCTION_LINES);

export const FORM_982_REFERENCE_FILENAME = "f982-reference-filled.pdf";

export interface Form982ReferenceSummaryExclusion {
  line: string;
  description: string;
  value: string;
}

export interface Form982ReferenceSummaryReduction {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form982ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form982ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  exclusions: Form982ReferenceSummaryExclusion[];
  reductions: Form982ReferenceSummaryReduction[];
  totals: Form982ReferenceSummaryTotal[];
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

function getForm982ExclusionLines(result: TaxReturnResult) {
  return result.allLines
    .filter((line) => line.form === "Form 1099-C" && INCLUDED_FORM_982_EXCLUSION_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_982_EXCLUSION_LINES.indexOf(left.line as typeof INCLUDED_FORM_982_EXCLUSION_LINES[number])
        - INCLUDED_FORM_982_EXCLUSION_LINES.indexOf(right.line as typeof INCLUDED_FORM_982_EXCLUSION_LINES[number]),
    );
}

function getForm982ReductionLines(result: TaxReturnResult) {
  const form982 = result.form982;
  if (!form982) {
    return [];
  }

  return form982.lines
    .filter((line) => INCLUDED_FORM_982_REDUCTION_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_982_REDUCTION_LINES.indexOf(left.line as typeof INCLUDED_FORM_982_REDUCTION_LINES[number])
        - INCLUDED_FORM_982_REDUCTION_LINES.indexOf(right.line as typeof INCLUDED_FORM_982_REDUCTION_LINES[number]),
    );
}

function formatCalculatedLineValue(line: CalculatedLine) {
  return line.value.toString();
}

export function buildForm982ReferenceSummary(result: TaxReturnResult): Form982ReferenceSummary {
  const cod = result.codNolReduction;
  if (cod) {
    if (cod.sourceFactsVerified !== true || cod.calculationComplete !== true || !cod.regular || !cod.alternativeTax || result.form982) {
      throw new Error("Form982 source NOL reference requires its complete independent source calculation");
    }
    const same = (actual: Decimal | undefined, expected: Decimal) => {
      if (!Decimal.isDecimal(actual) || !actual.isFinite() || !actual.eq(expected)) throw new Error("Form982 NOL reference amounts do not reconcile");
    };
    for (const ledger of [cod.regular, cod.alternativeTax]) {
      const total = (key: "beforeReduction" | "currentTaxUse" | "modifiedAbsorption" | "modifiedAvailableBeforeReduction"
        | "attributeReduction" | "expiredAfterReduction" | "remainingCarryforward") => ledger.vintages.reduce((value, row) => value.plus(row[key]), new Decimal(0));
      same(ledger.beforeReduction, total("beforeReduction")); same(ledger.reduction, total("attributeReduction")); same(ledger.carryforward, total("remainingCarryforward"));
      same(ledger.currentTaxUse, total("currentTaxUse")); same(ledger.modifiedAbsorption, total("modifiedAbsorption"));
      same(ledger.modifiedAvailableBeforeReduction, total("modifiedAvailableBeforeReduction"));
      same(ledger.modifiedUseAdjustment, ledger.modifiedAbsorption.minus(ledger.currentTaxUse));
      same(ledger.expiredAfterReduction, total("expiredAfterReduction"));
      same(ledger.beforeReduction.minus(ledger.modifiedUseAdjustment), ledger.modifiedAvailableBeforeReduction);
      same(ledger.modifiedAvailableBeforeReduction, ledger.reduction.plus(ledger.expiredAfterReduction).plus(ledger.carryforward));
      same(ledger.reduction, cod.reportedExcludedAmount);
      for (const row of ledger.vintages) {
        same(row.beforeReduction.minus(row.modifiedAbsorption.minus(row.currentTaxUse)), row.modifiedAvailableBeforeReduction);
        same(row.modifiedAvailableBeforeReduction, row.attributeReduction.plus(row.expiredAfterReduction).plus(row.remainingCarryforward));
        if (Boolean(row.charitableComparison) !== Boolean(ledger.charitableComparison)) throw new Error("Form982 charitable comparison completeness does not reconcile");
        if (row.charitableComparison) same(row.charitableComparison.beforeReduction,
          row.attributeReduction.plus(row.charitableComparison.expiredAfterReduction).plus(row.charitableComparison.remainingCarryforward));
      }
      const comparison = ledger.charitableComparison;
      if (comparison) {
        const comparisonTotal = (key: "expiredAfterReduction" | "remainingCarryforward") => ledger.vintages.reduce((value, row) =>
          value.plus(row.charitableComparison?.[key] ?? 0), new Decimal(0));
        same(comparison.expiredAfterReduction, comparisonTotal("expiredAfterReduction"));
        same(comparison.carryforward, comparisonTotal("remainingCarryforward"));
        same(comparison.nolDifferenceBeforeReduction, ledger.carryforwardBeforeReduction.minus(comparison.carryforwardBeforeReduction));
        same(comparison.nolDifferenceAfterReduction, ledger.carryforward.minus(comparison.carryforward));
        same(comparison.nolDifferenceBeforeReduction, comparison.nolDifferenceAfterReduction);
      }
    }
    same(result.carryforwards.nolCarryforward, cod.regular.carryforward);
    same(result.carryforwards.alternativeTaxNolCarryforward, cod.alternativeTax.carryforward);
    for (const [line, expected] of [["2", cod.reportedExcludedAmount], ["6", cod.regular.reduction]] as const) {
      for (const lines of [cod.lines, result.allLines]) {
        const rows = lines.filter(row => row.form === "Form 982" && row.line === line);
        if (rows.length !== 1) throw new Error("Form982 NOL reference requires unique retained source audits");
        same(rows[0].value, expected);
      }
    }
    return {
      title: "Form 982 Insolvency and NOL Reduction Reference Summary", warningLabel: "REFERENCE SUMMARY ONLY",
      introduction: "Actual personal-debt insolvency exclusion. Current tax is calculated before the separate regular and alternative loss-vintage reductions. Original sources and every reduced vintage are reconciled in the accompanying NOL statement.",
      exclusions: [{ line: "1b", description: "Insolvency exclusion", value: cod.reportedExcludedAmount.toString() }],
      reductions: [{ line: "6", description: "Regular net operating loss attribute reduction", value: cod.regular.reduction.toString(),
        formula: "Current-year original NOL first; then oldest carryover to this year before residual expiry. Actual current deductions are unchanged." }],
      totals: [
        { label: "Line2 reported excluded debt", value: cod.reportedExcludedAmount.toString() },
        { label: "Exact original excluded debt", value: cod.sourceExcludedAmount.toString() },
        { label: "Actual immediately-before-discharge insolvency", value: cod.insolvencyAmount.toString() },
        { label: "Regular remaining NOL", value: cod.regular.carryforward.toString() },
        { label: "Regular residual expiry after COD", value: cod.regular.expiredAfterReduction.toString() },
        { label: "Alternative-tax NOL reduction", value: cod.alternativeTax.reduction.toString() },
        { label: "Alternative-tax remaining NOL", value: cod.alternativeTax.carryforward.toString() },
        { label: "Alternative residual expiry after COD", value: cod.alternativeTax.expiredAfterReduction.toString() },
        ...([ ["Regular", cod.regular], ["Alternative", cod.alternativeTax] ] as const).flatMap(([label, ledger]) => [
          ...(!ledger.modifiedUseAdjustment.isZero() ? [
            { label: `${label} actual current-tax NOL use`, value: ledger.currentTaxUse.toString() },
            { label: `${label} modified NOL absorption`, value: ledger.modifiedAbsorption.toString() },
            { label: `${label} modified loss available before COD`, value: ledger.modifiedAvailableBeforeReduction.toString() },
          ] : []),
          ...(ledger.charitableComparison ? [
            { label: `${label} comparison remaining NOL`, value: ledger.charitableComparison.carryforward.toString() },
            { label: `${label} succeeding NOL difference after COD`, value: ledger.charitableComparison.nolDifferenceAfterReduction.toString() },
          ] : []),
        ]),
      ],
    };
  }
  if (!result.form982) {
    throw new Error("Form 982 reference summary requires result.form982");
  }

  const exclusions = getForm982ExclusionLines(result).map((line) => ({
    line: FORM_982_EXCLUSION_DESCRIPTION[line.line as typeof INCLUDED_FORM_982_EXCLUSION_LINES[number]].line,
    description: FORM_982_EXCLUSION_DESCRIPTION[line.line as typeof INCLUDED_FORM_982_EXCLUSION_LINES[number]].description,
    value: formatCalculatedLineValue(line),
  }));
  const reductions = getForm982ReductionLines(result).map((line) => ({
    line: line.line,
    description: line.description,
    value: formatCalculatedLineValue(line),
    formula: line.formula,
  }));
  const totalExcluded = exclusions.reduce(
    (sum, exclusion) => sum.plus(exclusion.value),
    new Decimal(0),
  );

  return {
    title: "Form 982 COD Attribute Reduction Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "Computed from supported cancellation-of-debt exclusions and the engine-calculated Form 982 attribute-reduction outputs.",
    exclusions,
    reductions,
    totals: [
      {
        label: "Total excluded cancellation of debt",
        value: totalExcluded.toString(),
      },
      {
        label: "Total Form 982 attribute reduction applied",
        value: result.form982.totalReduction.toString(),
      },
      {
        label: "Excluded amount not absorbed by supported attributes",
        value: result.form982.unreducedExclusion.toString(),
      },
    ],
  };
}

export async function fillForm982Reference(
  result: TaxReturnResult,
  outputDir: string,
) {
  assertPdfExportAllowed(result.taxYear, result.taxYear);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm982ReferenceSummary(result);
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
    "This page summarizes the supported cancellation-of-debt exclusion categories and Form 982 attribute reductions used by the engine. It is not an official filed Form 982 copy.",
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

  y = drawWrappedText(page, "Exclusion categories", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const exclusion of summary.exclusions) {
    if (y < 120) {
      newPage();
    }

    y = drawWrappedText(page, `Line ${exclusion.line}: ${exclusion.description}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Value: ${exclusion.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 24,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 24,
      lineHeight: 13,
    });
  }

  y -= 10;
  y = drawWrappedText(page, "Attribute reduction outputs", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const line of summary.reductions) {
    if (y < 100) {
      newPage();
    }

    y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Value: ${line.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 24,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 24,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Formula: ${line.formula}`, {
      font: regular,
      size: BODY_FONT_SIZE - 0.5,
      x: PAGE_MARGIN + 24,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 24,
      lineHeight: 13,
    });

    y -= 4;
  }

  if (y < 120) {
    newPage();
  }

  y -= 6;
  y = drawWrappedText(page, "Summary totals", {
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
  const outputPath = join(outputDir, FORM_982_REFERENCE_FILENAME);
  const bytes = await doc.save();
  await writeFile(outputPath, bytes);
  return outputPath;
}
