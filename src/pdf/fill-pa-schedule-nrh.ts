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
import type { PAScheduleNRHResult } from "@/engine/state/pa-schedule-nrh.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const PA_SCHEDULE_NRH_REFERENCE_FILENAME = "pa-schedule-nrh-reference.pdf";

export interface PAScheduleNRHReferenceSummaryLine {
  label: string;
  value: string;
}

export interface PAScheduleNRHReferenceSummarySection {
  heading: string;
  lines: PAScheduleNRHReferenceSummaryLine[];
}

export interface PAScheduleNRHReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  filingTrigger: string;
  sections: PAScheduleNRHReferenceSummarySection[];
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

function formatWholeDollar(value: string) {
  return `$${value}`;
}

function formatRatio(value: string) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized.toFixed(6) : value;
}

function getScheduleNRHInput(input: TaxYearInput) {
  return input.paNonresidentReturn?.scheduleNRH;
}

export function shouldIncludePAScheduleNRHReferenceSummary(input: TaxYearInput) {
  const scheduleNRH = getScheduleNRHInput(input);
  return !!(scheduleNRH?.compensation || scheduleNRH?.businessApportionment);
}

export function buildPAScheduleNRHReferenceSummary(
  input: TaxYearInput,
  result: PAScheduleNRHResult,
): PAScheduleNRHReferenceSummary {
  if (!shouldIncludePAScheduleNRHReferenceSummary(input)) {
    throw new Error("PA Schedule NRH reference summary requires supported Schedule NRH input");
  }

  const scheduleNRH = getScheduleNRHInput(input)!;
  const sections: PAScheduleNRHReferenceSummarySection[] = [];

  if (scheduleNRH.compensation) {
    sections.push({
      heading: "Compensation apportionment",
      lines: [
        {
          label: "Selected method",
          value: scheduleNRH.compensation.method === "business_volume"
            ? "Business volume"
            : "Working days",
        },
        { label: "Working days", value: String(result.workingDays) },
        { label: "Working-day fraction", value: formatRatio(result.workingDayFraction.toString()) },
        { label: "Business-volume fraction", value: formatRatio(result.businessVolumeFraction.toString()) },
        {
          label: "Selected apportionment fraction",
          value: formatRatio(result.selectedApportionmentFraction.toString()),
        },
        {
          label: "Employer-reported PA gross compensation",
          value: formatWholeDollar(result.employerReportedPAGrossCompensation.toString()),
        },
        { label: "Gross compensation to apportion", value: formatWholeDollar(result.grossCompensation.toString()) },
        {
          label: "Apportioned PA gross compensation",
          value: formatWholeDollar(result.apportionedGrossCompensation.toString()),
        },
        {
          label: "Apportioned employee business expenses",
          value: formatWholeDollar(result.apportionedEmployeeBusinessExpenses.toString()),
        },
        {
          label: "Apportioned expense reimbursements",
          value: formatWholeDollar(result.apportionedExpenseReimbursements.toString()),
        },
        {
          label: "Total PA gross compensation",
          value: formatWholeDollar(result.totalPAGrossCompensation.toString()),
        },
        {
          label: "Net PA taxable compensation",
          value: formatWholeDollar(result.netPATaxableCompensation.toString()),
        },
      ],
    });
  }

  if (scheduleNRH.businessApportionment) {
    sections.push({
      heading: "Business apportionment",
      lines: [
        {
          label: "Property factor",
          value: formatRatio((result.propertyFactor ?? 0).toString()),
        },
        {
          label: "Payroll factor",
          value: formatRatio((result.payrollFactor ?? 0).toString()),
        },
        {
          label: "Sales factor",
          value: formatRatio((result.salesFactor ?? 0).toString()),
        },
        {
          label: "Sum of applicable factors",
          value: formatRatio((result.businessFactorSum ?? 0).toString()),
        },
        {
          label: "Applicable factor count",
          value: String(result.businessApplicableFactorCount),
        },
        {
          label: "Business apportionment fraction",
          value: formatRatio((result.businessApportionmentFraction ?? 0).toString()),
        },
        {
          label: "Total net profits",
          value: formatWholeDollar((result.totalNetProfits ?? 0).toString()),
        },
        {
          label: "PA net profits",
          value: formatWholeDollar((result.paNetProfits ?? 0).toString()),
        },
      ],
    });
  }

  return {
    title: "Pennsylvania Schedule NRH Nonresident Apportionment Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "This page summarizes the supported Pennsylvania Schedule NRH nonresident apportionment computation. It is not an official PA Schedule NRH filing copy.",
    filingTrigger: "Attach when a Pennsylvania nonresident or part-year resident return includes supported Schedule NRH compensation or business apportionment input.",
    sections,
  };
}

export async function fillPAScheduleNRHReference(
  input: TaxYearInput,
  result: PAScheduleNRHResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildPAScheduleNRHReferenceSummary(input, result);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const startNewPage = () => {
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

  y = drawWrappedText(page, summary.filingTrigger, {
    font: regular,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y: y - 8,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  y -= 16;

  for (const section of summary.sections) {
    if (y <= PAGE_MARGIN + 80) {
      startNewPage();
    }

    y = drawWrappedText(page, section.heading, {
      font: bold,
      size: 12,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 16,
    });

    y -= 4;

    for (const line of section.lines) {
      if (y <= PAGE_MARGIN + 24) {
        startNewPage();
      }

      y = drawWrappedText(page, `${line.label}: ${line.value}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 13,
      });
    }

    y -= 12;
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, PA_SCHEDULE_NRH_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
