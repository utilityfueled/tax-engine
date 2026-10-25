import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form8824AggregateResult, CalculatedLine } from "@/models/outputs.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_8824_LINES = [
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
] as const;

const INCLUDED_FORM_8824_LINE_SET = new Set<string>(INCLUDED_FORM_8824_LINES);

export const FORM_8824_REFERENCE_FILENAME = "f8824-reference-filled.pdf";

export interface Form8824ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form8824ReferenceSummaryExchange {
  description: string;
  recognizedGainCharacter: string;
  relatedParty: boolean;
  lines: Form8824ReferenceSummaryLine[];
}

export interface Form8824ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form8824ReferenceSummary {
  title: string;
  warningLabel: string;
  introduction: string;
  exchanges: Form8824ReferenceSummaryExchange[];
  totals: Form8824ReferenceSummaryTotal[];
}

function sanitizePdfText(text: string) {
  return text
    .replace(/×/g, " x ")
    .replace(/→/g, "->")
    .replace(/[−–—]/g, "-")
    .replace(/[^\x20-\x7E\n\t]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = sanitizePdfText(text).trim().split(/\s+/).filter(Boolean);

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

function getReferenceLines(lines: CalculatedLine[]) {
  return lines
    .filter((line) => INCLUDED_FORM_8824_LINE_SET.has(line.line))
    .sort(
      (left, right) => INCLUDED_FORM_8824_LINES.indexOf(left.line as typeof INCLUDED_FORM_8824_LINES[number])
        - INCLUDED_FORM_8824_LINES.indexOf(right.line as typeof INCLUDED_FORM_8824_LINES[number]),
    );
}

function formatRoutingCharacter(character: string) {
  return character === "section1231" ? "Form 4797 Part I (section 1231)" : "Schedule D (capital)";
}

export function buildForm8824ReferenceSummary(
  result: Form8824AggregateResult,
): Form8824ReferenceSummary {
  return {
    title: "Form 8824 Like-Kind Exchange Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    introduction: "Computed from supported Form 8824 Part III like-kind exchange inputs that route deterministic gain amounts to Form 4797 and Schedule D.",
    exchanges: result.exchanges.map((exchange) => ({
      description: exchange.description,
      recognizedGainCharacter: exchange.recognizedGainCharacter,
      relatedParty: exchange.isRelatedParty,
      lines: getReferenceLines(exchange.lines).map((line) => ({
        line: line.line,
        description: line.description,
        value: line.value.toString(),
        formula: sanitizePdfText(line.formula),
      })),
    })),
    totals: [
      {
        label: "Form 4797 ordinary income carry amount",
        value: result.totalOrdinaryIncome.toString(),
      },
      {
        label: "Form 4797 Part I section 1231 carry amount",
        value: result.totalSection1231RecognizedGainOrLoss.toString(),
      },
      {
        label: "Schedule D long-term capital carry amount",
        value: result.totalCapitalRecognizedGainOrLoss.toString(),
      },
    ],
  };
}

export async function fillForm8824Reference(
  result: Form8824AggregateResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildForm8824ReferenceSummary(result);
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
    "This page summarizes supported Form 8824 Part III outputs for each exchange. It is not an official filed Form 8824 copy and does not recreate the informational Parts I and II filing layout.",
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

  for (const [index, exchange] of summary.exchanges.entries()) {
    if (y < 170) {
      newPage();
    }

    y = drawWrappedText(page, `Exchange ${index + 1}: ${exchange.description}`, {
      font: bold,
      size: 13,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 16,
    });

    y = drawWrappedText(
      page,
      `Recognized gain routing: ${formatRoutingCharacter(exchange.recognizedGainCharacter)}`,
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
      `Related-party exchange flag: ${exchange.relatedParty ? "Yes" : "No"}`,
      {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y: y - 2,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 13,
      },
    );

    y -= 6;

    for (const line of exchange.lines) {
      if (y < 90) {
        newPage();
      }

      y = drawWrappedText(
        page,
        `Line ${line.line}: ${line.description} = ${line.value}`,
        {
          font: bold,
          size: BODY_FONT_SIZE,
          x: PAGE_MARGIN,
          y,
          maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
          lineHeight: 13,
        },
      );

      y = drawWrappedText(
        page,
        `Formula: ${line.formula}`,
        {
          font: regular,
          size: BODY_FONT_SIZE,
          x: PAGE_MARGIN + 12,
          y: y - 2,
          maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
          lineHeight: 13,
        },
      );

      y -= 4;
    }

    y -= 8;
  }

  if (y < 120) {
    newPage();
  }

  y = drawWrappedText(page, "Federal carry amounts", {
    font: bold,
    size: 13,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 16,
  });

  y -= 6;

  for (const total of summary.totals) {
    y = drawWrappedText(page, `${total.label}: ${total.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 13,
    });
    y -= 2;
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_8824_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
