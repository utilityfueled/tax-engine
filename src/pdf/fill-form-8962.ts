import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form1095A } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_8962_LINES = [
  "1",
  "2",
  "3",
  "5",
  "7",
  "11a",
  "11b",
  "11c",
  "24",
  "25",
  "26",
  "27",
] as const;

const INCLUDED_FORM_8962_LINE_SET = new Set<string>(INCLUDED_FORM_8962_LINES);

export const FORM_8962_REFERENCE_FILENAME = "f8962-reference-filled.pdf";

export interface Form8962ReferenceSummaryPolicy {
  marketplace: string;
  policyNumber: string;
  coveredMonths: string;
  annualEnrollmentPremium: string;
  annualSLCSP: string;
  annualAdvancePTC: string;
}

export interface Form8962ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form8962ReferenceSummary {
  title: string;
  warningLabel: string;
  policyCount: number;
  introduction: string;
  policies: Form8962ReferenceSummaryPolicy[];
  lines: Form8962ReferenceSummaryLine[];
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

function formatAmountString(value: string) {
  return `$${value}`;
}

function summarizeMonths(months: number[]) {
  if (months.length === 0) {
    return "None";
  }

  const sorted = [...new Set(months)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let rangeStart = sorted[0]!;
  let previous = sorted[0]!;

  for (const month of sorted.slice(1)) {
    if (month === previous + 1) {
      previous = month;
      continue;
    }

    ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
    rangeStart = month;
    previous = month;
  }

  ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
  return ranges.join(", ");
}

function normalizeFormula(formula: string) {
  return formula
    .replaceAll("≤", "<=")
    .replaceAll("×", "x")
    .replaceAll("→", "->");
}

export function buildForm8962ReferenceSummary(
  forms: Form1095A[],
  result: TaxReturnResult,
): Form8962ReferenceSummary {
  const summary = result.form8962;
  if (!summary) {
    throw new Error("Form 8962 reference summary requires result.form8962");
  }

  return {
    title: "Form 8962 Premium Tax Credit Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    policyCount: forms.length,
    introduction: `Computed from ${forms.length} supported Form 1095-A marketplace statement${forms.length === 1 ? "" : "s"} and the supported Form 8962 reconciliation outputs.`,
    policies: forms.map((form) => {
      const annualEnrollmentPremium = form.monthlyPremiums.reduce(
        (total, month) => total.plus(month.enrolleePremium),
        summary.annualPremium.minus(summary.annualPremium),
      );
      const annualSLCSP = form.monthlyPremiums.reduce(
        (total, month) => total.plus(month.slcsp),
        summary.annualPremium.minus(summary.annualPremium),
      );
      const annualAdvancePTC = form.monthlyPremiums.reduce(
        (total, month) => total.plus(month.advancePremiumTaxCredit ?? 0),
        summary.annualPremium.minus(summary.annualPremium),
      );

      return {
        marketplace: form.marketplace,
        policyNumber: form.policyNumber,
        coveredMonths: summarizeMonths(form.monthlyPremiums.map((month) => month.month)),
        annualEnrollmentPremium: annualEnrollmentPremium.toString(),
        annualSLCSP: annualSLCSP.toString(),
        annualAdvancePTC: annualAdvancePTC.toString(),
      };
    }),
    lines: summary.lines
      .filter((line) => INCLUDED_FORM_8962_LINE_SET.has(line.line))
      .sort(
        (left, right) => INCLUDED_FORM_8962_LINES.indexOf(left.line as typeof INCLUDED_FORM_8962_LINES[number])
          - INCLUDED_FORM_8962_LINES.indexOf(right.line as typeof INCLUDED_FORM_8962_LINES[number]),
      )
      .map((line) => ({
        line: line.line,
        description: line.description,
        value: line.value.toString(),
        formula: normalizeFormula(line.formula),
      })),
  };
}

export async function fillForm8962Reference(
  forms: Form1095A[],
  result: TaxReturnResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm8962ReferenceSummary(forms, result);
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
    "This page summarizes supported Form 1095-A marketplace amounts and the supported Form 8962 reconciliation outputs that feed Schedule 2 Line 2 and Schedule 3 Line 10. It is not an official filled Form 8962.",
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

  for (const policy of summary.policies) {
    if (y < 110) {
      newPage();
    }

    y = drawWrappedText(page, `Marketplace: ${policy.marketplace}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Policy number: ${policy.policyNumber}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Covered months: ${policy.coveredMonths}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Annual enrollment premium: ${formatAmountString(policy.annualEnrollmentPremium)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Annual SLCSP: ${formatAmountString(policy.annualSLCSP)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Annual advance PTC: ${formatAmountString(policy.annualAdvancePTC)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
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

  y = drawWrappedText(page, "Supported Form 8962 reconciliation lines", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const line of summary.lines) {
    if (y < 90) {
      newPage();
    }

    y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 8,
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

  const filePath = join(outputDir, FORM_8962_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save());
  return filePath;
}
