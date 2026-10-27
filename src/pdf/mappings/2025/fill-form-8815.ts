import { mkdir, writeFile } from "fs/promises";
import Decimal from "decimal.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { SavingsBondRedemption, TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { Form8815Result } from "@/engine/forms/form-8815.js";
import { calculateSavingsBondStatementSources } from "@/engine/forms/savings-bond-statement-sources.js";
import { displaySavingsBondRatio } from "@/utils/savings-bond-ratios.js";
import { savingsBondReviewOriginalInput, type PreparedSavingsBondReview } from "../../savings-bond-review-context.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_8815_LINES = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "6-worksheet-1", "6-worksheet-2", "6-worksheet-3", "6-worksheet-4",
  "6-worksheet-5", "6-worksheet-6", "6-worksheet-7", "6-worksheet-8",
  "statement-prior-interest-adjustment",
  "current-reissue-interest",
] as const;

const INCLUDED_FORM_8815_LINE_SET = new Set<string>(INCLUDED_FORM_8815_LINES);
interface SavingsBondReviewContext { input: TaxYearInput; result: TaxReturnResult; prepared: PreparedSavingsBondReview }

export const FORM_8815_REFERENCE_FILENAME = "f8815-reference-filled.pdf";

export interface Form8815ReferenceSummaryRedemption {
  redemptionNumber: number;
  proceeds: string;
  interest: string;
  principal: string;
  eligibility: string;
}

export interface Form8815ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form8815ReferenceSummaryTotal {
  label: string;
  value: string;
}

export interface Form8815ReferenceSummary {
  title: string;
  warningLabel: string;
  redemptionCount: number;
  introduction: string;
  redemptions: Form8815ReferenceSummaryRedemption[];
  lines: Form8815ReferenceSummaryLine[];
  totals: Form8815ReferenceSummaryTotal[];
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
    onPageBreak,
  }: {
    font: PDFFont;
    size: number;
    x: number;
    y: number;
    maxWidth: number;
    lineHeight?: number;
    color?: ReturnType<typeof rgb>;
    onPageBreak: () => PDFPage;
  },
) {
  const lines = wrapText(text, font, size, maxWidth);
  let cursorY = y;

  for (const line of lines) {
    if (cursorY < PAGE_MARGIN) {
      page = onPageBreak();
      cursorY = PAGE_HEIGHT - PAGE_MARGIN;
    }
    page.drawText(line, { x, y: cursorY, font, size, color });
    cursorY -= lineHeight;
  }

  return cursorY;
}

function getReferenceLines(result: Form8815Result) {
  const selected = new Map<string, Form8815Result["lines"][number]>();
  for (const line of result.lines) {
    if (line.form !== "Form 8815" || !INCLUDED_FORM_8815_LINE_SET.has(line.line)) continue;
    if (selected.has(line.line)) throw new Error(`Form 8815 duplicate audit line ${line.line}.`);
    if (!line.value.isFinite() || (line.line !== "9" && line.value.isNegative())) throw new Error(`Form 8815 audit line ${line.line} is not a finite allowed amount.`);
    selected.set(line.line, line);
  }
  const required = result.sourceFactsVerified ? INCLUDED_FORM_8815_LINES.filter(id => id !== "current-reissue-interest" || result.reissueSourcesVerified) : INCLUDED_FORM_8815_LINES.slice(0, 13);
  for (const id of required) if (!selected.has(id)) throw new Error(`Form 8815 missing audited line ${id}.`);
  const totals: Array<[string, Decimal]> = [
    ["2", result.grossQualifiedExpenses], ["3", result.nontaxableEducationalBenefits], ["4", result.qualifiedExpenses],
    ["5", result.totalProceeds], ["6", result.totalInterest], ["7", result.expenseRatio],
    ["8", result.excludableBeforePhaseOut], ["9", result.modifiedAGI], ["10", result.phaseOutThreshold],
    ["14", result.excludableSavingsBondInterest],
  ];
  for (const [id, value] of totals) if (!value.isFinite() || !selected.get(id)?.value.eq(value)) throw new Error(`Form 8815 line ${id} does not reconcile to its result total.`);
  return INCLUDED_FORM_8815_LINES.flatMap(id => {
    const line = selected.get(id);
    return line ? [line] : [];
  });
}

export function buildForm8815ReferenceSummary(
  redemptions: SavingsBondRedemption[],
  result: Form8815Result,
  context?: SavingsBondReviewContext,
): Form8815ReferenceSummary {
  assertPdfExportAllowed(2025, result.taxYear);
  const historyTotals: Form8815ReferenceSummaryTotal[] = [];
  if (result.reissueSourcesVerified || redemptions.some(row => row.reissueSourceId !== undefined) || context) {
    if (!context) throw new Error("Savings-bond reissue reference requires its prepared original return context.");
    const original = savingsBondReviewOriginalInput(context.input, context.result, context.prepared);
    if (context.result.form8815 !== result && JSON.stringify(context.result.form8815) !== JSON.stringify(result)) throw new Error("Savings-bond reference result does not match its prepared return.");
    if (JSON.stringify(context.input.savingsBondRedemptions) !== JSON.stringify(redemptions)) throw new Error("Savings-bond reference originals do not match the prepared rendering sources.");
    const history = calculateSavingsBondStatementSources(original);
    if (!history && (result.reissueSourcesVerified || redemptions.some(row => row.reissueSourceId !== undefined))) throw new Error("Savings-bond reference is missing its original history.");
    for (const [index, group] of (original.form8815?.reissueSources?.groups ?? []).entries()) {
      const computed = history?.groups[index]; if (!computed) throw new Error("Savings-bond original group is missing.");
      for (const [label, value] of [["original face value", group.originalFaceValue], ["your purchase funds", group.taxpayerPurchaseFunds], ["spouse purchase funds", group.spousePurchaseFunds], ["value at reissue", group.valueAtReissue]] as const)
        historyTotals.push({ label: `Group ${index + 1} ${label}`, value: `$${value}` });
      historyTotals.push({ label: `Group ${index + 1} actual reissue year`, value: group.reissueDate?.slice(0,4) ?? "" });
      for (const owner of ["primary", "spouse"] as const) historyTotals.push({ label: `Group ${index + 1} ${owner} transfer recognized`, value: `$${displaySavingsBondRatio(computed.recognizedAtReissue[owner])}` });
    }
    for (const [index, statement] of (original.form8815?.reissueSources?.statements ?? []).entries()) {
      for (const [label, value] of [["original Box 3", statement.box3], ["earlier-year interest included", statement.priorRecognizedInterestIncluded], ["other Box 3 interest", statement.otherBox3Interest]] as const)
        historyTotals.push({ label: `Statement ${index + 1} ${label}`, value: `$${value}` });
    }
    for (const owner of ["primary", "spouse"] as const) {
      const row = context.result.allLines.find(line => line.form === "Educator education exclusions" && line.line === `${owner}:bond-exclusion`);
      if (row) historyTotals.push({ label: `${owner === "primary" ? "Primary" : "Spouse"} educator excluded bond interest`, value: String(row.inputs["Exact recipient exclusion"]) });
    }
    const educatorMagi = context.result.allLines.find(line => line.form === "Form 8815 MAGI Worksheet" && line.line === "educator");
    if (educatorMagi) {
      historyTotals.push({ label: "Educator deduction for Form 8815 MAGI", value: educatorMagi.value.toFixed() });
      historyTotals.push({ label: "Final Schedule 1 educator deduction", value: context.result.schedule1?.educatorExpenses.toFixed() ?? "0" });
    }
  }
  if (result.redemptionResults.length !== redemptions.length) throw new Error("Form 8815 redemption sources do not match the calculation.");
  const rows = result.redemptionResults.map((calculated, index) => {
    const source = redemptions[index];
    if (!source) throw new Error("Form 8815 missing redemption source.");
    const proceeds = new Decimal(source.proceeds);
    if (!proceeds.isFinite() || !calculated.proceeds.isFinite() || !proceeds.eq(calculated.proceeds) || source.sourceId !== calculated.sourceId) throw new Error("Form 8815 redemption source does not reconcile to the calculation.");
    if ((calculated.principal && (!calculated.principal.isFinite() || calculated.principal.isNegative())) || (calculated.currentYearInterest && (!calculated.currentYearInterest.isFinite() || calculated.currentYearInterest.isNegative()))) throw new Error("Form 8815 redemption source contains a nonfinite or negative amount.");
    return {
      redemptionNumber: index + 1,
      proceeds: calculated.proceeds.toString(),
      interest: calculated.currentYearInterestRatio ? displaySavingsBondRatio(calculated.currentYearInterestRatio) : calculated.currentYearInterest?.toString() ?? "Not applicable to this ineligible bond type",
      principal: calculated.principal?.toString() ?? "Not applicable to this ineligible bond type",
      eligibility: calculated.eligible === undefined ? "Unverified historical input" : calculated.eligible ? "Eligible from actual source facts" : "Ineligible from actual source facts",
    };
  });
  return {
    title: "Form 8815 Savings Bond Interest Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    redemptionCount: redemptions.length,
    introduction: `${result.sourceFactsVerified ? "Calculated using actual source facts" : "Calculated using unverified historical aggregate inputs"} for ${redemptions.length} redemption${redemptions.length === 1 ? "" : "s"}. Education costs are coordinated once for the return. This reference does not establish filing readiness.`,
    redemptions: rows,
    lines: getReferenceLines(result).map((line) => ({
      line: line.line,
      description: line.description,
      value: line.value.toString(),
      formula: sanitizePdfText(line.formula),
    })),
    totals: [
      {
        label: "Schedule B Line 3 exclusion",
        value: result.excludableSavingsBondInterest.toString(),
      }, ...historyTotals,
    ],
  };
}

export async function fillForm8815Reference(
  redemptions: SavingsBondRedemption[],
  result: Form8815Result,
  outputDir: string,
  context?: SavingsBondReviewContext,
) {
  const summary = buildForm8815ReferenceSummary(redemptions, result, context);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - PAGE_MARGIN;
    return page;
  };

  y = drawWrappedText(page, summary.title, {
    onPageBreak: newPage,
    font: bold,
    size: 20,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 24,
  });

  y = drawWrappedText(page, summary.warningLabel, {
    onPageBreak: newPage,
    font: bold,
    size: 12,
    x: PAGE_MARGIN,
    y: y - 6,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 16,
    color: WARNING_COLOR,
  });

  y = drawWrappedText(page, summary.introduction, {
    onPageBreak: newPage,
    font: regular,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y: y - 8,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  y = drawWrappedText(
    page,
    "This page summarizes supported savings-bond redemption inputs and the resulting Form 8815 outputs that feed Schedule B Line 3. It is not an official filed Form 8815 copy.",
    {
      onPageBreak: newPage,
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 10,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  y -= 16;

  for (const redemption of summary.redemptions) {
    if (y < 140) {
      newPage();
    }

    y = drawWrappedText(page, `Redemption ${redemption.redemptionNumber}`, {
      onPageBreak: newPage,
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Proceeds: ${redemption.proceeds}`, {
      onPageBreak: newPage,
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Current-year interest: ${redemption.interest}`, {
      onPageBreak: newPage,
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Principal: ${redemption.principal}`, {
      onPageBreak: newPage,
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, redemption.eligibility, {
      onPageBreak: newPage,
      font: regular, size: BODY_FONT_SIZE, x: PAGE_MARGIN + 12, y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12, lineHeight: 13,
    });

    y -= 8;
  }

  for (const line of summary.lines) {
    if (y < 130) {
      newPage();
    }

    y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
      onPageBreak: newPage,
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Value: ${line.value}`, {
      onPageBreak: newPage,
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Formula: ${line.formula}`, {
      onPageBreak: newPage,
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 8;
  }

  if (y < 90) {
    newPage();
  }

  y = drawWrappedText(page, "Computed totals", {
    onPageBreak: newPage,
    font: bold,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  for (const total of summary.totals) {
    y = drawWrappedText(page, `${total.label}: ${total.value}`, {
      onPageBreak: newPage,
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });
  }

  await markReviewPdf(doc);
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, FORM_8815_REFERENCE_FILENAME);
  await writeFile(outputPath, await doc.save());
  return outputPath;
}
