import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine, TaxReturnResult } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const HOME_SALE_EXCLUSION_REFERENCE_FILENAME = "home-sale-exclusion-reference-filled.pdf";

export interface HomeSaleExclusionReferenceCheck {
  line: "ownership-test" | "use-test" | "frequency-test";
  description: string;
  status: "pass" | "fail" | "not-applicable";
}

export interface HomeSaleExclusionReferenceLine {
  line: "1" | "2" | "3" | "4" | "5" | "6" | "depreciation-recapture";
  description: string;
  value: string;
}

export interface HomeSaleExclusionReferenceSale {
  saleLabel: string;
  accountHolderLabel: string;
  hasGain: boolean;
  meetsFullExclusionTests: boolean;
  qualifiesForReducedExclusion: boolean;
  hasDepreciationRecapture: boolean;
  checks: HomeSaleExclusionReferenceCheck[];
  lines: HomeSaleExclusionReferenceLine[];
  notes: string[];
}

export interface HomeSaleExclusionReferenceTotal {
  label: string;
  value: string;
}

export interface HomeSaleExclusionReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  saleCount: number;
  sales: HomeSaleExclusionReferenceSale[];
  totals: HomeSaleExclusionReferenceTotal[];
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

function formatAccountHolderLabel(accountHolder: TaxYearInput["homeSales"][number]["accountHolder"]) {
  if (accountHolder === "primary") {
    return "Primary taxpayer";
  }

  if (accountHolder === "spouse") {
    return "Spouse";
  }

  return "Taxpayer";
}

function findAuditLine(lines: CalculatedLine[], line: string) {
  return lines.find((candidate) => candidate.line === line);
}

function formatCheckStatus(line: CalculatedLine | undefined): "pass" | "fail" {
  return line?.value.equals(1) ? "pass" : "fail";
}

export function buildHomeSaleExclusionReferenceSummary(
  input: TaxYearInput,
  result: TaxReturnResult,
): HomeSaleExclusionReferenceSummary {
  const sourceSales = input.homeSales ?? [];
  const aggregate = result.scheduleD?.homeSales;

  if (sourceSales.length === 0 || !aggregate || aggregate.sales.length !== sourceSales.length) {
    throw new Error("Home sale exclusion reference summary requires supported home sale results");
  }

  return {
    title: "Home Sale Exclusion Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: `Computed from ${sourceSales.length} supported home sale input${sourceSales.length === 1 ? "" : "s"}.`,
    saleCount: sourceSales.length,
    sales: aggregate.sales.map((sale, index) => {
      const inputSale = sourceSales[index]!;
      const notes: string[] = [];

      if (!sale.hasGain) {
        notes.push("Loss on personal-use property is not deductible.");
      }

      if (sale.qualifiesForReducedExclusion) {
        notes.push("Reduced exclusion applied under IRC Section 121(c).");
      }

      return {
        saleLabel: `Home sale ${index + 1}`,
        accountHolderLabel: formatAccountHolderLabel(inputSale.accountHolder),
        hasGain: sale.hasGain,
        meetsFullExclusionTests: sale.meetsFullExclusionTests,
        qualifiesForReducedExclusion: sale.qualifiesForReducedExclusion,
        hasDepreciationRecapture: sale.hasDepreciationRecapture,
        checks: sale.hasGain
          ? [
            {
              line: "ownership-test",
              description: "Ownership test",
              status: formatCheckStatus(findAuditLine(sale.lines, "ownership")),
            },
            {
              line: "use-test",
              description: "Use test",
              status: formatCheckStatus(findAuditLine(sale.lines, "use")),
            },
            {
              line: "frequency-test",
              description: "Frequency limitation",
              status: formatCheckStatus(findAuditLine(sale.lines, "frequency")),
            },
          ]
          : [
            { line: "ownership-test", description: "Ownership test", status: "not-applicable" },
            { line: "use-test", description: "Use test", status: "not-applicable" },
            { line: "frequency-test", description: "Frequency limitation", status: "not-applicable" },
          ],
        lines: [
          { line: "1", description: "Amount realized from sale", value: sale.amountRealized.toString() },
          { line: "2", description: "Adjusted basis of home", value: sale.adjustedBasis.toString() },
          { line: "3", description: "Gain or loss on sale", value: sale.gainOrLoss.toString() },
          { line: "4", description: "Maximum exclusion amount", value: sale.maxExclusion.toString() },
          { line: "5", description: "Excludable gain", value: sale.excludableGain.toString() },
          { line: "6", description: "Taxable gain", value: sale.taxableGain.toString() },
          {
            line: "depreciation-recapture",
            description: "Depreciation recapture (unrecaptured Section 1250 gain)",
            value: sale.depreciationRecapture.toString(),
          },
        ],
        notes,
      };
    }),
    totals: [
      {
        label: "Aggregate Schedule D taxable gain",
        value: aggregate.totalTaxableGain.toString(),
      },
      {
        label: "Aggregate depreciation recapture included in taxable gain",
        value: aggregate.totalDepreciationRecapture.toString(),
      },
    ],
  };
}

function formatStatus(status: HomeSaleExclusionReferenceCheck["status"]) {
  if (status === "pass") {
    return "PASS";
  }

  if (status === "fail") {
    return "FAIL";
  }

  return "N/A";
}

export async function fillHomeSaleExclusionReference(
  input: TaxYearInput,
  result: TaxReturnResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildHomeSaleExclusionReferenceSummary(input, result);
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
    "This page summarizes supported principal-residence sale calculations that route to Schedule D. It is not an official IRS form or filing attachment.",
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

  for (const sale of summary.sales) {
    if (y < 180) {
      newPage();
    }

    y = drawWrappedText(page, `${sale.saleLabel} (${sale.accountHolderLabel})`, {
      font: bold,
      size: BODY_FONT_SIZE + 1,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(
      page,
      `Outcome flags: gain=${sale.hasGain ? "yes" : "no"}, full exclusion tests=${sale.meetsFullExclusionTests ? "yes" : "no"}, reduced exclusion=${sale.qualifiesForReducedExclusion ? "yes" : "no"}, depreciation recapture=${sale.hasDepreciationRecapture ? "yes" : "no"}`,
      {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y: y - 4,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 13,
      },
    );

    y -= 4;

    for (const check of sale.checks) {
      y = drawWrappedText(page, `${check.description}: ${formatStatus(check.status)}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 8,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 8,
        lineHeight: 13,
      });
    }

    y -= 2;

    for (const line of sale.lines) {
      y = drawWrappedText(page, `${line.line} ${line.description}: ${formatAmountString(line.value)}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 8,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 8,
        lineHeight: 13,
      });
    }

    for (const note of sale.notes) {
      y = drawWrappedText(page, `Note: ${note}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 8,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 8,
        lineHeight: 13,
      });
    }

    y -= 12;
  }

  if (y < 110) {
    newPage();
  }

  y = drawWrappedText(page, "Aggregate Schedule D carry totals", {
    font: bold,
    size: BODY_FONT_SIZE + 1,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const total of summary.totals) {
    y = drawWrappedText(page, `${total.label}: ${formatAmountString(total.value)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 8,
      y: y - 4,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 8,
      lineHeight: 13,
    });
  }

  const outputPath = join(outputDir, HOME_SALE_EXCLUSION_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
