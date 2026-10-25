import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form1099SA } from "@/models/inputs.js";
import type { Form1099SAResult } from "@/engine/forms/form-1099-sa.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);
const INCLUDED_FORM_1099_SA_LINES = new Set(["1", "2", "3", "4", "5", "6", "7"]);

export const FORM_1099_SA_REFERENCE_FILENAME = "f1099sa-reference-filled.pdf";

export interface Form1099SAReferenceSummaryForm {
  payer: string;
  grossDistribution: string;
  earningsOnExcessContributions: string;
  distributionCode: string;
  fairMarketValueOnDateOfDeath: string;
  accountType: "HSA";
  beneficiaryRole: string;
  deathDistributionTiming: string;
  accountHolder: string;
}

export interface Form1099SAReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form1099SAReferenceSummary {
  title: string;
  warningLabel: string;
  statementCount: number;
  omittedUnsupportedStatementCount: number;
  introduction: string;
  forms: Form1099SAReferenceSummaryForm[];
  lines: Form1099SAReferenceSummaryLine[];
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

function formatAmount(value: string | undefined) {
  return `$${value ?? "0"}`;
}

function formatOptionalText(value: string | undefined) {
  return value ?? "Not supplied";
}

function getSupportedHsaStatements(forms: Form1099SA[]) {
  return forms.filter((form) => form.accountType === "hsa" && form.trusteeToTrusteeTransfer !== true);
}

export function buildForm1099SAReferenceSummary(
  forms: Form1099SA[],
  result: Form1099SAResult,
): Form1099SAReferenceSummary {
  const supportedStatements = getSupportedHsaStatements(forms);

  if (supportedStatements.length === 0) {
    throw new Error("Form 1099-SA reference summary requires at least one supported HSA statement");
  }

  return {
    title: "Form 1099-SA HSA Distribution Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    statementCount: supportedStatements.length,
    omittedUnsupportedStatementCount: forms.length - supportedStatements.length,
    introduction: `Computed from ${supportedStatements.length} supported HSA Form 1099-SA statement${supportedStatements.length === 1 ? "" : "s"}.`,
    forms: supportedStatements.map((form) => ({
      payer: form.payer,
      grossDistribution: form.grossDistribution.toString(),
      earningsOnExcessContributions: (form.earningsOnExcessContributions ?? "0").toString(),
      distributionCode: form.distributionCode,
      fairMarketValueOnDateOfDeath: (form.fmvOnDateOfDeath ?? "0").toString(),
      accountType: "HSA",
      beneficiaryRole: formatOptionalText(form.beneficiaryRole),
      deathDistributionTiming: formatOptionalText(form.deathDistributionTiming),
      accountHolder: formatOptionalText(form.accountHolder),
    })),
    lines: result.lines
      .filter((line) => INCLUDED_FORM_1099_SA_LINES.has(line.line))
      .map((line) => ({
        line: line.line,
        description: line.description,
        value: line.value.toString(),
        formula: line.formula,
      })),
  };
}

export async function fillForm1099SAReference(
  forms: Form1099SA[],
  result: Form1099SAResult,
  outputDir: string,
) {
  const summary = buildForm1099SAReferenceSummary(forms, result);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
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
    "This page summarizes supported HSA Form 1099-SA data that feeds Form 8889 and Form 1040 other income. It is not an official custodian-issued Form 1099-SA copy.",
    {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 10,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  if (summary.omittedUnsupportedStatementCount > 0) {
    y = drawWrappedText(
      page,
      `${summary.omittedUnsupportedStatementCount} unsupported Archer MSA or Medicare Advantage MSA statement${summary.omittedUnsupportedStatementCount === 1 ? "" : "s"} were omitted from this HSA-only reference summary.`,
      {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y: y - 8,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 14,
        color: WARNING_COLOR,
      },
    );
  }

  y -= 16;

  for (const form of summary.forms) {
    if (y < 145) {
      newPage();
    }

    y = drawWrappedText(page, `Payer: ${form.payer}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Box 1 gross distribution: ${formatAmount(form.grossDistribution)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 2 earnings on excess contributions: ${formatAmount(form.earningsOnExcessContributions)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 3 distribution code: ${form.distributionCode}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 4 fair market value at date of death: ${formatAmount(form.fairMarketValueOnDateOfDeath)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 5 account type: HSA`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Beneficiary role: ${form.beneficiaryRole}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Death-distribution timing: ${form.deathDistributionTiming}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Local account-holder tag: ${form.accountHolder}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  if (y < 150) {
    newPage();
  }

  y = drawWrappedText(page, "Computed routing totals", {
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
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
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

    y -= 6;
  }

  const filePath = join(outputDir, FORM_1099_SA_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save({ useObjectStreams: false }));
  return filePath;
}
