import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form1099Q, QualifiedEducationExpenseSummary } from "@/models/inputs.js";
import type { Form1099QResult } from "@/engine/forms/form-1099-q.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_1099_Q_LINES = new Set([
  "gross-distribution",
  "total-earnings",
  "total-basis",
  "adjusted-qee",
  "taxable-earnings",
  "tax-free-earnings",
  "penalty-amount",
  "penalty-exception-amount",
  "net-penalty",
]);

export const FORM_1099_Q_REFERENCE_FILENAME = "f1099q-reference-filled.pdf";

export interface Form1099QReferenceSummaryForm {
  payerName: string;
  accountType: string;
  box1GrossDistribution: string;
  box2Earnings: string;
  box3Basis: string;
  box4TrusteeToTrusteeTransfer: boolean;
}

export interface Form1099QReferenceSummaryValue {
  label: string;
  value: string;
}

export interface Form1099QReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
}

export interface Form1099QReferenceSummary {
  title: string;
  warningLabel: string;
  statementCount: number;
  introduction: string;
  forms: Form1099QReferenceSummaryForm[];
  qualifiedEducationExpenseInputs: Form1099QReferenceSummaryValue[];
  lines: Form1099QReferenceSummaryLine[];
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

function formatAmount(value: { toString(): string }) {
  return `$${value.toString()}`;
}

function formatBoolean(value: boolean | undefined) {
  return value ? "Yes" : "No";
}

function formatAccountType(value: Form1099Q["accountType"]) {
  return value === "coverdell_esa" ? "Coverdell ESA" : "529 plan";
}

function getReferenceLines(result: Form1099QResult) {
  return result.lines.filter((line) => INCLUDED_FORM_1099_Q_LINES.has(line.line));
}

export function buildForm1099QReferenceSummary(
  forms: Form1099Q[],
  result: Form1099QResult,
  qeeSummary: QualifiedEducationExpenseSummary | undefined,
): Form1099QReferenceSummary {
  return {
    title: "Form 1099-Q Education Distribution Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    statementCount: forms.length,
    introduction: `Computed from ${forms.length} supported Form 1099-Q statement${forms.length === 1 ? "" : "s"}.`,
    forms: forms.map((form, index) => ({
      payerName: form.payerName?.trim() || `Statement ${index + 1}`,
      accountType: formatAccountType(form.accountType),
      box1GrossDistribution: form.grossDistribution.toString(),
      box2Earnings: (form.earnings ?? 0).toString(),
      box3Basis: (form.basis ?? 0).toString(),
      box4TrusteeToTrusteeTransfer: form.isTrusteeToTrustee ?? false,
    })),
    qualifiedEducationExpenseInputs: [
      {
        label: "Total qualified education expenses",
        value: (qeeSummary?.totalQualifiedExpenses ?? 0).toString(),
      },
      {
        label: "Tax-free educational assistance",
        value: (qeeSummary?.taxFreeEducationalAssistance ?? 0).toString(),
      },
      {
        label: "Amounts used for education credits",
        value: (qeeSummary?.amountsUsedForEducationCredits ?? 0).toString(),
      },
      {
        label: "Scholarship penalty exception amount",
        value: (qeeSummary?.penaltyExceptionScholarshipAmount ?? 0).toString(),
      },
      {
        label: "Military academy penalty exception amount",
        value: (qeeSummary?.penaltyExceptionMilitaryAcademyAmount ?? 0).toString(),
      },
      {
        label: "Death exception",
        value: formatBoolean(qeeSummary?.penaltyExceptionDeath),
      },
      {
        label: "Disability exception",
        value: formatBoolean(qeeSummary?.penaltyExceptionDisability),
      },
    ],
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: line.description,
      value: line.value.toString(),
    })),
  };
}

export async function fillForm1099QReference(
  forms: Form1099Q[],
  result: Form1099QResult,
  qeeSummary: QualifiedEducationExpenseSummary | undefined,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm1099QReferenceSummary(forms, result, qeeSummary);
  const referenceLines = getReferenceLines(result);
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
    "This page summarizes supported Form 1099-Q inputs and the resulting taxable-earnings plus Form 5329 penalty amounts. It is not an official payer-issued Form 1099-Q copy.",
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

  for (const form of summary.forms) {
    if (y < 120) {
      newPage();
    }

    y = drawWrappedText(page, `Payer: ${form.payerName}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Account type: ${form.accountType}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 1 gross distribution: ${formatAmount(form.box1GrossDistribution)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 2 earnings: ${formatAmount(form.box2Earnings)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 3 basis: ${formatAmount(form.box3Basis)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 4 trustee-to-trustee transfer: ${formatBoolean(form.box4TrusteeToTrusteeTransfer)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  if (y < 170) {
    newPage();
  }

  y = drawWrappedText(page, "Qualified education expense inputs", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const inputLine of summary.qualifiedEducationExpenseInputs) {
    const value = inputLine.value === "Yes" || inputLine.value === "No"
      ? inputLine.value
      : formatAmount(inputLine.value);

    y = drawWrappedText(page, `${inputLine.label}: ${value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  }

  y -= 10;

  for (const [index, line] of summary.lines.entries()) {
    if (y < 100) {
      newPage();
    }

    y = drawWrappedText(page, `${line.description}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Value: ${formatAmount(line.value)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Formula: ${referenceLines[index]?.formula ?? ""}`, {
      font: regular,
      size: BODY_FONT_SIZE - 0.5,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  const filePath = join(outputDir, FORM_1099_Q_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save({ useObjectStreams: false }));
  return filePath;
}
