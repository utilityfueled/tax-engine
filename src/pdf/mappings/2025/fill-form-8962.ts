import Decimal from "decimal.js";
import { roundDollar } from "@/utils/decimal.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Form1095A, TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { calculateForm8962SharedPolicy, type Form8962SharedPolicyResult } from "@/engine/forms/form-8962-shared-policy.js";
import { premiumTaxCreditReviewOriginalSourceInput, type PreparedPremiumTaxCreditReview } from "../../premium-tax-credit-review-context.js";
import { loadReviewTemplate, setCheckBox, setTextField } from "../../pdf-utils.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_8962_LINES: readonly string[] = [
  "1", "2a", "2b", "3", "4", "5", "7", "8a", "8b",
  ...Array.from({ length: 13 }, (_, index) => ["a", "b", "c", "d", "e", "f"].map(column => `${index + 11}${column}`)).flat(),
  "24", "25", "26", "27", "28", "29",
];
const INCLUDED_FORM_8962_LINE_SET = new Set(INCLUDED_FORM_8962_LINES);
const REQUIRED_LINES = ["1", "2a", "2b", "3", "4", "5", "24", "25", "26", "27", "29"] as const;

export const FORM_8962_REFERENCE_FILENAME = "f8962-reference-filled.pdf";
export interface Form8962ReviewContext { input: TaxYearInput; prepared?: PreparedPremiumTaxCreditReview }

export interface Form8962ReferenceSummaryPolicy {
  marketplace: string;
  policyNumber: string;
  coveredMonths: string;
  annualEnrollmentPremium: string;
  annualSLCSP: string;
  annualAdvancePTC: string;
}

export interface Form8962ReferenceSummaryLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface Form8962ReferenceSummary {
  title: string;
  warningLabel: string;
  policyCount: number;
  introduction: string;
  policies: Form8962ReferenceSummaryPolicy[];
  lines: Form8962ReferenceSummaryLine[];
  allocations?: { policyNumber: string; firstMonth: number; lastMonth: number; fraction: string }[];
  allocatedMonths?: { month: number; originalPremium: string; originalSlcsp: string; originalAdvance: string; premium: string; slcsp: string; advance: string }[];
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

function summarizeMonths(months: number[]) {
  if (months.length === 0) {
    return "None";
  }

  const sorted = [...new Set(months)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let rangeStart = sorted[0]!;
  let previous = sorted[0]!;

  for (const month of sorted.slice(1)) {
    if (month === previous + 1) {
      previous = month;
      continue;
    }

    ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
    rangeStart = month;
    previous = month;
  }

  ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
  return ranges.join(", ");
}

function normalizeFormula(formula: string) {
  return formula
    .replaceAll("≤", "<=")
    .replaceAll("×", "x")
    .replaceAll("→", "->");
}

export function buildForm8962ReferenceSummary(
  forms: Form1095A[],
  result: TaxReturnResult,
  context?: Form8962ReviewContext,
): Form8962ReferenceSummary {
  const summary = result.form8962;
  if (!summary) {
    throw new Error("Form 8962 reference summary requires result.form8962");
  }
  let allocation: Form8962SharedPolicyResult | undefined;
  if (summary.sharedPolicyAllocation || context) {
    if (!context || JSON.stringify(forms) !== JSON.stringify(context.input.form1095A)) throw new Error("Form8962 shared-policy review requires matching original policy source context");
    const original = premiumTaxCreditReviewOriginalSourceInput(context.input, result, context.prepared);
    allocation = calculateForm8962SharedPolicy(original);
  }

  const byLine = new Map<string, (typeof summary.lines)[number]>();
  for (const line of summary.lines) {
    if (line.form !== "Form 8962" || !INCLUDED_FORM_8962_LINE_SET.has(line.line)) continue;
    if (byLine.has(line.line) || !line.value.isFinite()) throw new Error(`Form 8962 reference requires unique finite audit line ${line.line}`);
    byLine.set(line.line, line);
  }
  for (const line of REQUIRED_LINES) if (!byLine.has(line)) throw new Error(`Form 8962 reference is missing audit line ${line}`);
  for (const [line, total] of [
    ["3", summary.modifiedAGI], ["4", summary.federalPovertyLine], ["5", summary.fplPercentageForTable],
    ["24", summary.ptcAllowed], ["25", summary.advancePTCTotal], ["26", summary.netPTC], ["27", summary.excessAPTC], ["29", summary.excessAPTCRepayment],
  ] as const) if (!byLine.get(line)?.value.eq(total)) throw new Error(`Form 8962 audit line ${line} disagrees with its calculated total`);
  const sourceAdvances = new Map<number, Decimal>();
  for (const form of forms) for (const month of form.monthlyPremiums) {
    if (month.advancePremiumTaxCredit === undefined) throw new Error("Form 8962 source advance amount is missing");
    const amount = new Decimal(month.advancePremiumTaxCredit);
    if (!amount.isFinite() || amount.isNegative()) throw new Error("Form 8962 source advance amount is invalid");
    sourceAdvances.set(month.month, (sourceAdvances.get(month.month) ?? new Decimal(0)).plus(amount));
  }
  // Original policy amounts stay above/in the source statement. Only the actual
  // source-derived allocation reconciles with this return's PartII advances.
  if (allocation) {
    sourceAdvances.clear();
    for (const month of allocation.months) sourceAdvances.set(month.month, month.advance);
  }
  const reconciliationRows = summary.calculationMethod === "annual" ? ["11"] : [...sourceAdvances.keys()].sort((left, right) => left - right).map(month => String(month + 11));
  let auditedCredit = new Decimal(0), auditedAdvances = new Decimal(0);
  for (const row of reconciliationRows) {
    const advance = byLine.get(`${row}f`);
    if (!advance) throw new Error(`Form 8962 reference is missing audit line ${row}f`);
    auditedAdvances = auditedAdvances.plus(advance.value);
    if (["a", "b", "c", "d", "e"].some(column => byLine.has(`${row}${column}`))) {
      for (const column of ["a", "b", "c", "d", "e"]) if (!byLine.has(`${row}${column}`)) throw new Error(`Form 8962 reference is missing audit line ${row}${column}`);
      for (const line of ["7", "8a", "8b"]) if (!byLine.has(line)) throw new Error(`Form 8962 reference is missing contribution audit ${line}`);
      auditedCredit = auditedCredit.plus(byLine.get(`${row}e`)?.value ?? 0);
    }
  }
  if (!auditedCredit.eq(summary.ptcAllowed) || !auditedAdvances.eq(summary.advancePTCTotal)) throw new Error("Form 8962 reconciliation audit columns disagree with totals");
  const sourceAdvanceTotal = summary.calculationMethod === "annual"
    ? roundDollar([...sourceAdvances.values()].reduce((total, amount) => total.plus(amount), new Decimal(0)))
    : [...sourceAdvances.values()].reduce((total, amount) => total.plus(roundDollar(amount)), new Decimal(0));
  if (!sourceAdvanceTotal.eq(summary.advancePTCTotal)) throw new Error("Form 8962 source advance totals disagree with calculation");
  return {
    title: "Form 8962 Premium Tax Credit Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    policyCount: forms.length,
    introduction: `Computed from ${forms.length} Form 1095-A statement${forms.length === 1 ? "" : "s"} using the ${summary.calculationMethod} method. ${summary.sourceFactsVerified ? "Actual household and coverage facts were supplied." : "This is an unverified historical preview; dependent income, regional residence and coverage eligibility have not been established."} Policy totals below are raw statement amounts; ${allocation ? "the separate actual Part IV agreement determines this return's allocated monthly amounts." : "the calculation uses the corrected household benchmark."}`,
    policies: forms.map((form) => {
      const annualEnrollmentPremium = form.monthlyPremiums.reduce(
        (total, month) => total.plus(month.enrolleePremium),
        summary.annualPremium.minus(summary.annualPremium),
      );
      const annualSLCSP = form.monthlyPremiums.reduce(
        (total, month) => total.plus(month.slcsp),
        summary.annualPremium.minus(summary.annualPremium),
      );
      const annualAdvancePTC = form.monthlyPremiums.reduce(
        (total, month) => total.plus(month.advancePremiumTaxCredit ?? 0),
        summary.annualPremium.minus(summary.annualPremium),
      );

      return {
        marketplace: form.marketplace,
        policyNumber: form.policyNumber,
        coveredMonths: summarizeMonths(form.monthlyPremiums.map((month) => month.month)),
        annualEnrollmentPremium: annualEnrollmentPremium.toString(),
        annualSLCSP: annualSLCSP.toString(),
        annualAdvancePTC: annualAdvancePTC.toString(),
      };
    }),
    lines: [...byLine.values()]
      .sort(
        (left, right) => INCLUDED_FORM_8962_LINES.indexOf(left.line)
          - INCLUDED_FORM_8962_LINES.indexOf(right.line),
      )
      .map((line) => ({
        line: line.line,
        description: line.description,
        value: line.value.toString(),
        formula: normalizeFormula(line.formula),
      })),
    allocations: allocation?.periods.map(period => ({ policyNumber: forms[period.policyIndex].policyNumber.slice(-15),
      firstMonth: period.firstMonth, lastMonth: period.lastMonth, fraction: period.fraction.toFixed(2) })),
    allocatedMonths: allocation?.months.map(month => ({ month: month.month, originalPremium: month.originalPremium.toFixed(),
      originalSlcsp: month.originalSlcsp.toFixed(), originalAdvance: month.originalAdvance.toFixed(),
      premium: month.premium.toFixed(), slcsp: month.slcsp.toFixed(), advance: month.advance.toFixed() })),
  };
}

export async function fillForm8962Reference(
  forms: Form1095A[],
  result: TaxReturnResult,
  outputDir: string,
  context?: Form8962ReviewContext,
) {
  assertPdfExportAllowed(result.taxYear, result.taxYear);
  const summary = buildForm8962ReferenceSummary(forms, result, context);
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
    "This page summarizes supported Form 1095-A marketplace amounts and the supported Form 8962 reconciliation outputs that feed Schedule 2 Line 1a and Schedule 3 Line 9. It is not an official filled Form 8962.",
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

  for (const policy of summary.policies) {
    if (y < 110) {
      newPage();
    }

    y = drawWrappedText(page, `Marketplace: ${policy.marketplace}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Policy number: ${policy.policyNumber}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Covered months: ${policy.coveredMonths}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Annual enrollment premium: ${formatAmountString(policy.annualEnrollmentPremium)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Annual SLCSP: ${formatAmountString(policy.annualSLCSP)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Annual advance PTC: ${formatAmountString(policy.annualAdvancePTC)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  if (summary.allocations) {
    // A complete additional statement accompanies PartIV when four rows are
    // insufficient. Static source ordinals preserve identity privacy.
    newPage();
    const write = (value: string, boldText = false) => {
      const rows = wrapText(value, regular, BODY_FONT_SIZE, PAGE_WIDTH - PAGE_MARGIN * 2);
      for (const row of rows) {
        if (y < 54) newPage();
        page.drawText(row, { x: PAGE_MARGIN, y, size: BODY_FONT_SIZE, font: boldText ? bold : regular }); y -= 14;
      }
      y -= 5;
    };
    write("FORM 8962 PART IV - COMPLETE ALLOCATION STATEMENT", true);
    write("All actual allocation periods are retained below. Taxpayer identifiers and private agreement references are omitted from this review copy. Policy numbers use the final 15 characters required by Part IV.");
    summary.allocations.forEach((period, index) => write(`Allocation ${index + 1}: policy ${period.policyNumber}; months ${period.firstMonth}-${period.lastMonth}; premium, SLCSP and advance fractions ${period.fraction}.`));
    for (const row of summary.allocatedMonths ?? []) {
      write(`Month ${row.month}. Original monthly source: premium $${row.originalPremium}; SLCSP $${row.originalSlcsp}; advance $${row.originalAdvance}.`);
      write(`Actual allocated amounts before form rounding: premium $${row.premium}; SLCSP $${row.slcsp}; advance $${row.advance}.`);
    }
  }

  if (y < 120) {
    newPage();
  }

  y = drawWrappedText(page, "Supported Form 8962 reconciliation lines", {
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
      x: PAGE_MARGIN,
      y: y - 8,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Value: ${line.value}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Formula: ${line.formula}`, {
      font: regular,
      size: BODY_FONT_SIZE - 0.5,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  await markReviewPdf(doc);
  const filePath = join(outputDir, FORM_8962_REFERENCE_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save());
  return filePath;
}

const field = (page: number, number: number, group = '') => `topmostSubform[0].Page${page}[0].${group}f${page}_${number}[0]`;
const check = (page: number, group: number, index: number) => `topmostSubform[0].Page${page}[0].c${page}_${group}[${index}]`;
/** Final2025 template fields independently inspected against page labels/widgets. */
export const FORM_8962_FIELDS = {
  name: field(1, 1), ssn: field(1, 2), line1: field(1, 3), line2a: field(1, 4), line2b: field(1, 5),
  line3: field(1, 6), line4: field(1, 7), line5: field(1, 8), line7: field(1, 9), line8a: field(1, 10), line8b: field(1, 11),
  marriedSeparate: check(1, 1, 0), regions: [check(1, 2, 0), check(1, 2, 1), check(1, 2, 2)],
  line9Yes: check(1, 4, 0), line9No: check(1, 4, 1), line10Yes: check(1, 5, 0), line10No: check(1, 5, 1),
  annual: Array.from({ length: 6 }, (_, index) => field(1, index + 13, 'Part2Table1[0].BodyRow1[0].')),
  monthly: Array.from({ length: 12 }, (_, month) => Array.from({ length: 6 }, (_, column) => field(1, 19 + 6 * month + column, `Part2Table2[0].BodyRow${month + 1}[0].`))),
  line24: field(1, 91), line25: field(1, 92), line26: field(1, 93), line27: field(1, 94), line28: field(1, 95), line29: field(1, 96),
  allocations: Array.from({ length: 4 }, (_, period) => Array.from({ length: 7 }, (_, column) => field(2, 1 + 7 * period + column, column >= 4 ? `Lines${period + 30}e-g[0].` : ''))),
  line34Yes: check(2, 1, 0), line34No: check(2, 1, 1), marriage: Array.from({ length: 8 }, (_, index) => field(2, index + 29)),
} as const;

/** Actual PartIV map only. Other supported historical methods retain their
 * existing reference output; all source facts are checked before loading bytes. */
export async function fillForm8962SharedPolicy(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string,
  prepared?: PreparedPremiumTaxCreditReview): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const summary = buildForm8962ReferenceSummary(input.form1095A, result, { input, prepared });
  if (!summary.allocations?.length || !result.form8962) throw new Error('Form8962 physical review requires actual shared-policy allocations');
  const values = new Map(summary.lines.map(row => [row.line, row.value]));
  const doc = await loadReviewTemplate(blankPdfPath, 2025), form = doc.getForm(), F = FORM_8962_FIELDS;
  setTextField(form, F.name, [input.taxpayer.primary, ...(input.taxpayer.filingStatus === 'married_filing_jointly' && input.taxpayer.spouse ? [input.taxpayer.spouse] : [])].map(person => `${person.firstName} ${person.lastName}`).join(' & '));
  setTextField(form, F.ssn, ''); setCheckBox(form, F.marriedSeparate, false);
  for (const line of ['1', '2a', '2b', '3', '4', '5', '7', '8a', '8b', '24', '25'] as const) {
    const value = values.get(line);
    setTextField(form, F[`line${line}`], value === undefined ? '' : line === '7' ? new Decimal(value).toFixed(4) : new Decimal(value).toFixed(0));
  }
  const region = input.form8962?.fplRegion;
  for (const [index, name] of ['alaska', 'hawaii', 'contiguous'].entries()) setCheckBox(form, F.regions[index], region === name);
  for (const [name, state] of [[F.line9Yes, true], [F.line9No, false], [F.line10Yes, false], [F.line10No, true]] as const) setCheckBox(form, name, state);
  for (const name of F.annual) setTextField(form, name, '');
  for (const [month, fields] of F.monthly.entries()) for (const [index, name] of fields.entries()) {
    const value = values.get(`${month + 12}${'abcdef'[index]}`); setTextField(form, name, value === undefined ? '' : new Decimal(value).toFixed(0));
  }
  const excess = result.form8962.excessAPTC.gt(0);
  setTextField(form, F.line26, excess ? '' : result.form8962.netPTC.toFixed(0));
  for (const line of ['27', '28', '29'] as const) setTextField(form, F[`line${line}`], excess && values.has(line) ? new Decimal(values.get(line)!).toFixed(0) : '');
  for (const [index, fields] of F.allocations.entries()) {
    const period = summary.allocations[index];
    const row = period ? [period.policyNumber, '', String(period.firstMonth).padStart(2, '0'), String(period.lastMonth).padStart(2, '0'), period.fraction, period.fraction, period.fraction] : Array<string>(7).fill('');
    fields.forEach((name, column) => setTextField(form, name, row[column]));
  }
  setCheckBox(form, F.line34Yes, summary.allocations.length <= 4); setCheckBox(form, F.line34No, summary.allocations.length > 4);
  F.marriage.forEach(name => setTextField(form, name, ''));
  await markReviewPdf(doc);
  return doc;
}
