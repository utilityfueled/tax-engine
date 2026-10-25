import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form1099K } from "@/models/inputs.js";
import type { Form1099KResult } from "@/engine/forms/form-1099-k.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const FORM_1099_K_REFERENCE_FILENAME = "f1099k-reference-filled.pdf";

export interface Form1099KReferenceSummaryForm {
  pse: string;
  box1aGrossAmount: string;
  routingLabel: string;
  box1bCardNotPresentAmount: string;
  box4FederalWithholding: string;
  box8StateWithholding: string;
  state: string | null;
}

export interface Form1099KReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form1099KReferenceSummary {
  title: string;
  warningLabel: string;
  statementCount: number;
  introduction: string;
  forms: Form1099KReferenceSummaryForm[];
  totals: Form1099KReferenceSummaryTotal[];
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

function describeIncomeType(incomeType: Form1099K["incomeType"]) {
  switch (incomeType) {
    case "business":
      return "Schedule C business receipts";
    case "farm":
      return "Schedule F farm receipts";
    case "rental":
      return "Schedule E rental receipts";
    case "other":
      return "Schedule 1 Line 8z other income";
    default:
      return incomeType;
  }
}

export function buildForm1099KReferenceSummary(
  forms: Form1099K[],
  result: Form1099KResult,
): Form1099KReferenceSummary {
  const statementCount = forms.length;

  return {
    title: "Form 1099-K Payment Platform Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    statementCount,
    introduction: `Computed from ${statementCount} supported Form 1099-K statement${statementCount === 1 ? "" : "s"}.`,
    forms: forms.map((form) => ({
      pse: form.pse,
      box1aGrossAmount: form.grossAmount.toString(),
      routingLabel: describeIncomeType(form.incomeType),
      box1bCardNotPresentAmount: form.cardNotPresent.toString(),
      box4FederalWithholding: form.federalWithheld.toString(),
      box8StateWithholding: form.stateWithheld.toString(),
      state: form.state ?? null,
    })),
    totals: [
      {
        label: "Aggregated Form 1099-K gross amount",
        value: result.grossAmount.toString(),
      },
      {
        label: "Card-not-present subtotal",
        value: result.cardNotPresent.toString(),
      },
      {
        label: "Federal withholding to Form 1040 Line 25d",
        value: result.federalWithholding.toString(),
      },
      {
        label: "Business routing subtotal",
        value: result.businessGross.toString(),
      },
      {
        label: "Farm routing subtotal",
        value: result.farmGross.toString(),
      },
      {
        label: "Rental routing subtotal",
        value: result.rentalGross.toString(),
      },
      {
        label: "Other-income routing subtotal",
        value: result.otherGross.toString(),
      },
      {
        label: "State withholding subtotal",
        value: result.stateWithholding.toString(),
      },
    ],
  };
}

export async function fillForm1099KReference(
  forms: Form1099K[],
  result: Form1099KResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm1099KReferenceSummary(forms, result);
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
    "This page summarizes supported Form 1099-K gross receipts and withholding that feed the federal return. It is not an official payer-issued Form 1099-K copy.",
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
    if (y < 140) {
      newPage();
    }

    y = drawWrappedText(page, `PSE: ${form.pse}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Box 1a gross amount: ${formatAmount(form.box1aGrossAmount)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Routing: ${form.routingLabel}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    if (form.box1bCardNotPresentAmount !== "0") {
      y = drawWrappedText(page, `Box 1b card-not-present amount: ${formatAmount(form.box1bCardNotPresentAmount)}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 13,
      });
    }

    if (form.box4FederalWithholding !== "0") {
      y = drawWrappedText(page, `Box 4 federal withholding: ${formatAmount(form.box4FederalWithholding)}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 13,
      });
    }

    if (form.box8StateWithholding !== "0") {
      const stateLabel = form.state ? ` (${form.state})` : "";
      y = drawWrappedText(page, `Box 8 state withholding${stateLabel}: ${formatAmount(form.box8StateWithholding)}`, {
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

  if (y < 170) {
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

  for (const total of summary.totals) {
    y = drawWrappedText(page, `${total.label}: ${formatAmount(total.value)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  }

  const filePath = join(outputDir, FORM_1099_K_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save({ useObjectStreams: false }));
  return filePath;
}
