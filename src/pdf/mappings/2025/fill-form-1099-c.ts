import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { calculateForm1099C } from "@/engine/forms/form-1099-c.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
import type { CodExclusion, Form1099C } from "@/models/inputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const FORM_1099_C_REFERENCE_FILENAME = "f1099c-reference-filled.pdf";

export interface Form1099CReferenceSummaryForm {
  creditor: string;
  box2AmountDischarged: string;
  box3InterestIncluded: string;
  box4DebtDescription: string;
  box5PersonallyLiable: boolean;
  box6IdentifiableEventCode: string;
  box7FairMarketValueOfProperty: string;
}

export interface Form1099CReferenceSummaryValue {
  label: string;
  value: string;
}

export interface Form1099CReferenceSummary {
  title: string;
  warningLabel: string;
  statementCount: number;
  introduction: string;
  forms: Form1099CReferenceSummaryForm[];
  exclusionInputs: Form1099CReferenceSummaryValue[];
  totals: Form1099CReferenceSummaryValue[];
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

function formatAmount(value: { toString(): string } | string | undefined) {
  if (typeof value === "string") {
    return `$${value}`;
  }

  return `$${value?.toString() ?? "0"}`;
}

function formatOptionalText(value: string | undefined) {
  return value ?? "Not supplied";
}

function formatYesNo(value: boolean | undefined) {
  return value ? "Yes" : "No";
}

export function buildForm1099CReferenceSummary(
  forms: Form1099C[],
  exclusion: CodExclusion | undefined,
  filingStatus: FilingStatus,
  taxYear: number,
): Form1099CReferenceSummary {
  const constants = getConstants(taxYear);
  const result = calculateForm1099C(forms, exclusion, filingStatus, constants);

  return {
    title: "Form 1099-C Cancellation of Debt Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    statementCount: forms.length,
    introduction: `Computed from ${forms.length} supported Form 1099-C statement${forms.length === 1 ? "" : "s"}.`,
    forms: forms.map((form, index) => ({
      creditor: form.creditor?.trim() || `Statement ${index + 1}`,
      box2AmountDischarged: form.amountDischarged.toString(),
      box3InterestIncluded: (form.interestIncluded ?? 0).toString(),
      box4DebtDescription: formatOptionalText(form.debtDescription),
      box5PersonallyLiable: form.personallyLiable ?? false,
      box6IdentifiableEventCode: formatOptionalText(form.identifiableEventCode),
      box7FairMarketValueOfProperty: (form.fmvOfProperty ?? 0).toString(),
    })),
    exclusionInputs: [
      {
        label: "Bankruptcy exclusion elected",
        value: formatYesNo(exclusion?.bankruptcy),
      },
      {
        label: "Insolvency total liabilities",
        value: exclusion?.insolvency?.totalLiabilities?.toString() ?? "0",
      },
      {
        label: "Insolvency total assets",
        value: exclusion?.insolvency?.totalAssets?.toString() ?? "0",
      },
      {
        label: "Qualified principal residence discharged amount",
        value: exclusion?.qualifiedPrincipalResidence?.dischargedAmount?.toString() ?? "0",
      },
      {
        label: "Qualified farm exclusion input",
        value: exclusion?.qualifiedFarmExclusion?.toString() ?? "0",
      },
      {
        label: "Qualified real property business exclusion input",
        value: exclusion?.qualifiedRealPropertyBusinessExclusion?.toString() ?? "0",
      },
    ],
    totals: [
      {
        label: "Aggregated Form 1099-C Box 2 total",
        value: result.totalCancelledDebt.toString(),
      },
      {
        label: "Aggregated Form 1099-C Box 3 total",
        value: result.totalInterestIncluded.toString(),
      },
      {
        label: "Bankruptcy exclusion used",
        value: result.bankruptcyExclusion.toString(),
      },
      {
        label: "Insolvency exclusion used",
        value: result.insolvencyExclusion.toString(),
      },
      {
        label: "Qualified principal residence exclusion used",
        value: result.qualifiedPrincipalResidenceExclusion.toString(),
      },
      {
        label: "Qualified farm exclusion used",
        value: result.qualifiedFarmExclusion.toString(),
      },
      {
        label: "Qualified real property business exclusion used",
        value: result.qualifiedRealPropertyBusinessExclusion.toString(),
      },
      {
        label: "Total exclusions",
        value: result.totalExclusions.toString(),
      },
      {
        label: "Schedule 1 Line 8c taxable COD income",
        value: result.taxableCodIncome.toString(),
      },
    ],
  };
}

export async function fillForm1099CReference(
  forms: Form1099C[],
  exclusion: CodExclusion | undefined,
  filingStatus: FilingStatus,
  taxYear: number,
  outputDir: string,
) {
  if (forms.length === 0) {
    throw new Error("Form 1099-C reference summary requires at least one Form 1099-C statement");
  }

  const summary = buildForm1099CReferenceSummary(forms, exclusion, filingStatus, taxYear);
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
    "This page summarizes supported cancellation-of-debt inputs and computed exclusions that feed Schedule 1 Line 8c. It is not an official creditor-issued Form 1099-C copy or a substitute for Form 982 when exclusions apply.",
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
    if (y < 165) {
      newPage();
    }

    y = drawWrappedText(page, `Creditor: ${form.creditor}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Box 2 amount discharged: ${formatAmount(form.box2AmountDischarged)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 3 interest included: ${formatAmount(form.box3InterestIncluded)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 4 debt description: ${form.box4DebtDescription}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 5 personally liable: ${formatYesNo(form.box5PersonallyLiable)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 6 identifiable event code: ${form.box6IdentifiableEventCode}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Box 7 fair market value of property: ${formatAmount(form.box7FairMarketValueOfProperty)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  if (y < 175) {
    newPage();
  }

  y = drawWrappedText(page, "Applied exclusion inputs", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const value of summary.exclusionInputs) {
    y = drawWrappedText(page, `${value.label}: ${value.label === "Bankruptcy exclusion elected" ? value.value : formatAmount(value.value)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  }

  if (y < 155) {
    newPage();
  }

  y = drawWrappedText(page, "Computed totals", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y: y - 8,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const [index, value] of summary.totals.entries()) {
    y = drawWrappedText(page, `${value.label}: ${formatAmount(value.value)}`, {
      font: index === summary.totals.length - 1 ? bold : regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  }

  const filePath = join(outputDir, FORM_1099_C_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save({ useObjectStreams: false }));
  return filePath;
}
