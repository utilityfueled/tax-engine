import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  aggregateForm6252Results,
  calculateForm6252,
  type Form6252Result,
} from "@/engine/forms/form-6252.js";
import type { Form6252Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_6252_LINES = [
  "5",
  "10",
  "13",
  "16",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "34",
  "35",
  "36",
  "37",
] as const;

const INCLUDED_FORM_6252_LINE_SET = new Set<string>(INCLUDED_FORM_6252_LINES);

export const FORM_6252_REFERENCE_FILENAME = "f6252-reference-filled.pdf";

interface ApplicableForm6252Reference {
  input: Form6252Input;
  result: Form6252Result;
}

export interface Form6252ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form6252ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form6252ReferenceSummarySale {
  description: string;
  propertyType: string;
  gainCharacter: string;
  filingStage: string;
  lines: Form6252ReferenceSummaryLine[];
  totals: Form6252ReferenceSummaryTotal[];
}

export interface Form6252ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  saleCount: number;
  sales: Form6252ReferenceSummarySale[];
  aggregateTotals: Form6252ReferenceSummaryTotal[];
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

function getReferenceLines(result: Form6252Result) {
  return result.lines
    .filter((line) => INCLUDED_FORM_6252_LINE_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_6252_LINES.indexOf(left.line as typeof INCLUDED_FORM_6252_LINES[number])
        - INCLUDED_FORM_6252_LINES.indexOf(right.line as typeof INCLUDED_FORM_6252_LINES[number]),
    );
}

function formatPropertyType(propertyType: Form6252Input["propertyType"]) {
  switch (propertyType) {
    case "personal_use":
      return "Personal-use property";
    case "farm":
      return "Farm";
    case "timeshare_residential_lot":
      return "Timeshare or residential lot";
    default:
      return "Other property";
  }
}

function formatGainCharacter(gainCharacter: Form6252Input["gainCharacter"]) {
  switch (gainCharacter) {
    case "short_term_capital":
      return "Short-term capital";
    case "section_1231":
      return "Section 1231";
    default:
      return "Long-term capital";
  }
}

function hasCurrentYearFilingEffect(input: Form6252Input, result: Form6252Result) {
  if (!result.line16.gt(0)) {
    return false;
  }

  if (input.isYearOfSale) {
    return true;
  }

  return result.line22.gt(0) || result.line35.gt(0);
}

function getApplicableForms(forms: Form6252Input[] | undefined) {
  return (forms ?? [])
    .map((input) => ({ input, result: calculateForm6252(input) }))
    .filter(({ input, result }) => hasCurrentYearFilingEffect(input, result));
}

function formatValue(line: CalculatedLine) {
  return line.value.toString();
}

export function shouldIncludeForm6252ReferenceSummary(forms: Form6252Input[] | undefined) {
  return getApplicableForms(forms).length > 0;
}

export function buildForm6252ReferenceSummary(forms: Form6252Input[] | undefined): Form6252ReferenceSummary {
  const applicableForms = getApplicableForms(forms);
  const aggregate = aggregateForm6252Results(applicableForms.map(({ result }) => result));

  return {
    title: "Form 6252 Installment Sale Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: `Computed from ${applicableForms.length} supported installment sale entr${applicableForms.length === 1 ? "y" : "ies"} that currently affect the filing year packet.`,
    saleCount: applicableForms.length,
    sales: applicableForms.map(({ input, result }, index) => ({
      description: input.description.trim() || `Installment sale ${index + 1}`,
      propertyType: formatPropertyType(input.propertyType),
      gainCharacter: formatGainCharacter(input.gainCharacter),
      filingStage: input.isYearOfSale ? "Year of sale" : "Subsequent year with current filing effect",
      lines: getReferenceLines(result).map((line) => ({
        line: line.line,
        description: line.description,
        value: formatValue(line),
        formula: line.formula,
      })),
      totals: [
        {
          label: "Current-year installment income",
          value: result.line24.toString(),
        },
        {
          label: "Current-year ordinary income",
          value: result.totalOrdinaryIncome.toString(),
        },
        {
          label: "Current-year capital or Section 1231 gain",
          value: result.totalCapitalGain.toString(),
        },
        {
          label: "Remaining future-year recapture",
          value: result.remainingOrdinaryRecapture.toString(),
        },
      ],
    })),
    aggregateTotals: [
      {
        label: "Short-term capital gain routed from supported sales",
        value: aggregate.shortTermCapitalGain.toString(),
      },
      {
        label: "Long-term capital gain routed from supported sales",
        value: aggregate.longTermCapitalGain.toString(),
      },
      {
        label: "Section 1231 gain routed from supported sales",
        value: aggregate.section1231Gain.toString(),
      },
      {
        label: "Ordinary income routed from supported sales",
        value: aggregate.totalOrdinaryIncome.toString(),
      },
      {
        label: "Year-of-sale depreciation recapture already recognized elsewhere",
        value: aggregate.totalDepreciationRecapture.toString(),
      },
    ],
  };
}

export async function fillForm6252Reference(
  forms: Form6252Input[] | undefined,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm6252ReferenceSummary(forms);
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
    "This page summarizes supported Form 6252 installment sale computations that feed Schedule D or Form 4797 routing. It is not an official filed Form 6252.",
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
    if (y < 170) {
      newPage();
    }

    y = drawWrappedText(
      page,
      `${sale.description} - ${sale.propertyType} - ${sale.gainCharacter} - ${sale.filingStage}`,
      {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 14,
      },
    );

    for (const line of sale.lines) {
      if (y < 90) {
        newPage();
      }

      y = drawWrappedText(
        page,
        `Line ${line.line}: ${line.description} = ${line.value}`,
        {
          font: regular,
          size: BODY_FONT_SIZE,
          x: PAGE_MARGIN,
          y: y - 4,
          maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
          lineHeight: 13,
        },
      );

      y = drawWrappedText(
        page,
        `Formula: ${line.formula}`,
        {
          font: regular,
          size: 9,
          x: PAGE_MARGIN + 14,
          y: y + 1,
          maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 14,
          lineHeight: 12,
        },
      );
    }

    for (const total of sale.totals) {
      if (y < 90) {
        newPage();
      }

      y = drawWrappedText(page, `${total.label}: ${total.value}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 14,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 14,
        lineHeight: 13,
      });
    }

    y -= 10;
  }

  if (y < 150) {
    newPage();
  }

  y = drawWrappedText(page, "Packet routing totals", {
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const total of summary.aggregateTotals) {
    if (y < 90) {
      newPage();
    }

    y = drawWrappedText(page, `${total.label}: ${total.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 4,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 13,
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_6252_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
