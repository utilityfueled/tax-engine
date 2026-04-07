import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form1098E } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const FORM_1098_E_REFERENCE_FILENAME = "f1098e-reference-filled.pdf";

export interface Form1098EReferenceSummaryForm {
  lender: string;
  box1StudentLoanInterest: string;
  includesOriginationFeesOrCapitalizedInterest: boolean;
}

export interface Form1098EReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form1098EReferenceSummary {
  title: string;
  warningLabel: string;
  statementCount: number;
  introduction: string;
  forms: Form1098EReferenceSummaryForm[];
  totals: Form1098EReferenceSummaryTotal[];
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

export function buildForm1098EReferenceSummary(
  forms: Form1098E[],
  result: TaxReturnResult,
): Form1098EReferenceSummary {
  const summary = result.form1098ESummary;
  if (!summary) {
    throw new Error("Form 1098-E reference summary requires result.form1098ESummary");
  }

  const manualAddOn = summary.totalStudentLoanInterest.minus(summary.totalForm1098EInterest);
  const deduction = result.schedule1?.studentLoanInterest ?? summary.totalStudentLoanInterest;

  return {
    title: "Form 1098-E Student Loan Interest Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    statementCount: forms.length,
    introduction: `Computed from ${forms.length} supported Form 1098-E statement${forms.length === 1 ? "" : "s"}.`,
    forms: forms.map((form) => ({
      lender: form.lender,
      box1StudentLoanInterest: form.studentLoanInterestReceived.toString(),
      includesOriginationFeesOrCapitalizedInterest:
        form.includesOriginationFeesOrCapitalizedInterest ?? false,
    })),
    totals: [
      {
        label: "Aggregated Form 1098-E Box 1 total",
        value: summary.totalForm1098EInterest.toString(),
      },
      {
        label: "Manual add-on interest used in supported aggregation",
        value: manualAddOn.toString(),
      },
      {
        label: "Combined student loan interest before Schedule 1 limits",
        value: summary.totalStudentLoanInterest.toString(),
      },
      {
        label: "Schedule 1 Line 21 deduction",
        value: deduction.toString(),
      },
    ],
  };
}

export async function fillForm1098EReference(
  forms: Form1098E[],
  result: TaxReturnResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm1098EReferenceSummary(forms, result);
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
    "This page summarizes supported student loan interest amounts that feed Schedule 1 Line 21. It is not an official lender-issued Form 1098-E copy.",
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
    if (y < 90) {
      newPage();
    }

    y = drawWrappedText(page, `Lender: ${form.lender}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Box 1 student loan interest: ${formatAmountString(form.box1StudentLoanInterest)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    if (form.includesOriginationFeesOrCapitalizedInterest) {
      y = drawWrappedText(page, "Box 2 indicator: includes origination fees and/or capitalized interest.", {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 13,
      });
    }

    y -= 6;
  }

  if (y < 120) {
    newPage();
  }

  y = drawWrappedText(page, "Computed totals", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  summary.totals.forEach((total, index) => {
    y = drawWrappedText(page, `${total.label}: ${formatAmountString(total.value)}`, {
      font: index === summary.totals.length - 1 ? bold : regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  });

  const filePath = join(outputDir, FORM_1098_E_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save({ useObjectStreams: false }));
  return filePath;
}
