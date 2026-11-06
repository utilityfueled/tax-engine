import {assertPdfExportAllowed,markReviewPdf} from "@/pdf/export-policy.js";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PAScheduleEResult } from "@/engine/state/pa-schedule-e.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_E_REFERENCE_FILENAME = "pa-schedule-e-reference.pdf";

export interface PAScheduleEReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleEReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  totals: PAScheduleEReferenceSummaryLine[];
  royaltyDetails: {title:string;lines:PAScheduleEReferenceSummaryLine[]}[];
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

export function shouldIncludePAScheduleEReferenceSummary(result: PAScheduleEResult) {
  return result.royaltyProperties.length > 0
    || result.properties.length > 0
    || !result.miscRents.isZero()
    || !result.miscRoyalties.isZero()
    || !result.passThroughNetIncome.isZero()
    || !result.reportableNetRentalRoyaltyIncome.isZero();
}

export function buildPAScheduleEReferenceSummary(
  result: PAScheduleEResult,
): PAScheduleEReferenceSummary {
  const totals: PAScheduleEReferenceSummaryLine[] = [
    { label: "Source tax year", value:String(result.taxYear) },
    { label: "Supported rental properties summarized", value: String(result.properties.length) },
    { label: "Gross rents from directly owned rental property", value: result.propertyGrossRents.toString() },
    { label: "Total allowable rental and royalty expenses", value: result.totalAllowableExpenses.toString() },
    { label: "Net income or loss from directly owned rental property", value: result.propertyNetIncome.toString() },
    { label: "Gross Form 1099-MISC rents and royalties", value: result.miscRents.plus(result.miscRoyalties).toString() },
    { label: "Pass-through rental and royalty income", value: result.passThroughNetIncome.toString() },
    { label: "Combined Schedule E income or loss", value: result.netRentalRoyaltyIncome.toString() },
    { label: "Actual royalty properties summarized", value:String(result.royaltyProperties.length) },
    { label: "Actual PA royalty expenses", value:result.directRoyaltyExpenses.toFixed() },
    { label: "Actual PA royalty net income or loss", value:result.directRoyaltyNetIncome.toFixed() },
    { label: "PA-40 Line 6 reportable net rental and royalty income", value: result.reportableNetRentalRoyaltyIncome.toString() },
  ];

  if (
    !result.taxpayerNetRentalRoyaltyIncome.eq(result.netRentalRoyaltyIncome)
    || !result.spouseNetRentalRoyaltyIncome.isZero()
  ) {
    totals.splice(7, 0,
      {
        label: "Separate taxpayer Schedule E income or loss",
        value: result.taxpayerNetRentalRoyaltyIncome.toString(),
      },
      {
        label: "Separate spouse Schedule E income or loss",
        value: result.spouseNetRentalRoyaltyIncome.toString(),
      },
    );
  }

  return {
    title: "Pennsylvania Schedule E Rental and Royalty Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule E computation. It is not an official PA Schedule E filing copy.",
    filingTrigger: "Attach when a resident return includes supported rental-property, royalty, copyright, patent, or pass-through Schedule E activity, including zero-net property detail that still requires disclosure support in the packet.",
    totals,
    royaltyDetails:result.royaltyProperties.map((property,index)=>({title:`Royalty property ${index+1} - ${property.accountHolder==='primary'?'Primary taxpayer':'Spouse'}`,
      lines:property.lines.map(line=>({label:line.line.endsWith('surface-excluded')?'Excluded surface expenses (actual receipt amount)':`PA line ${line.line.split(':')[1]} - ${line.description}`,value:line.value.toFixed()}))})),
  };
}

export async function fillPAScheduleEReference(
  result: PAScheduleEResult,
  outputDir: string,
) {
  assertPdfExportAllowed(result.taxYear,result.taxYear);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleEReferenceSummary(result);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

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

  y = drawWrappedText(page, summary.filingTrigger, {
    font: regular,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y: y - 8,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  y -= 16;

  const bodyWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const minimumY = PAGE_MARGIN + 12;
  function continuedPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - PAGE_MARGIN;
    y = drawWrappedText(page, `${summary.title} - continued`, {
      font: bold, size: 13, x: PAGE_MARGIN, y, maxWidth: bodyWidth, lineHeight: 17,
    });
    y = drawWrappedText(page, summary.warningLabel, {
      font: bold, size: 11, x: PAGE_MARGIN, y: y - 6,
      maxWidth: bodyWidth, lineHeight: 15, color: WARNING_COLOR,
    });
    y -= 12;
  }
  function rowHeight(text: string, font: PDFFont) {
    return wrapText(text, font, BODY_FONT_SIZE, bodyWidth).length * 13;
  }
  function row(label: string, value: string, heading = false) {
    const text = heading ? label : `${label}: ${value}`;
    const font = heading ? bold : regular;
    if (y - rowHeight(text, font) < minimumY) continuedPage();
    y = drawWrappedText(page, text, {
      font, size: BODY_FONT_SIZE, x: PAGE_MARGIN, y,
      maxWidth: bodyWidth, lineHeight: 13,
    });
  }
  for (const total of summary.totals) row(total.label, total.value);
  for (const property of summary.royaltyDetails) {
    const blockHeight = 12 + rowHeight(property.title, bold)
      + property.lines.reduce((height, line) => height + rowHeight(`${line.label}: ${line.value}`, regular), 0);
    if (y - blockHeight < minimumY) continuedPage();
    y -= 12;
    row(property.title, '', true);
    for (const line of property.lines) row(line.label, line.value);
  }
  await markReviewPdf(doc);

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, PA_SCHEDULE_E_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
