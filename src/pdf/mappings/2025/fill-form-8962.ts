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
import { calculateForm8962MarriageSources } from "@/engine/forms/form-8962-marriage-sources.js";
import { calculateForm8962MarriageWorksheets, type Form8962MarriageWorksheetResult } from "@/engine/forms/form-8962-marriage-worksheets.js";
import { premiumTaxCreditReviewOriginalSourceInput, type PreparedPremiumTaxCreditReview } from "../../premium-tax-credit-review-context.js";
import { loadReviewTemplate, createPdfFieldBatch } from "../../pdf-utils.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

const INCLUDED_FORM_8962_LINES: readonly string[] = [
  "1", "2a", "2b", "3", "4", "5", "7", "8a", "8b",
  ...Array.from({ length: 13 }, (_, index) => ["a", "b", "c", "d", "e", "f"].map(column => `${index + 11}${column}`)).flat(),
  "24", "25", "26", "27", "28", "29", "35a", "35b", "35c", "35d", "36a", "36b", "36c", "36d",
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
  annualSLCSP: string | null;
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
  allocations?: { policyNumber: string; firstMonth: number; lastMonth: number; fraction: string; method: 'agreement' | 'default_enrollee_count' | 'no_advance_benchmark' }[];
  allocatedMonths?: { month: number; policyOrdinal: number; originalPremium: string; originalSlcsp: string | null; originalAdvance: string; premium: string; slcsp: string; advance: string; unshared?: true; benchmarkRatio?: { numerator: string; denominator: string } }[];
  householdMonths?: { month: number; policyOrdinals: number[]; premium: string; slcsp: string; advance: string; unsharedBenchmarkGroups: { policyOrdinals: number[]; slcsp: string }[]; noAdvanceBenchmarkGroups?: { policyOrdinals: number[]; slcsp: string }[] }[];
  marriage?: { electionApplies: boolean; worksheets: (Form8962ReferenceSummaryLine & { form: string })[] };
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
  let marriage: Form8962MarriageWorksheetResult | undefined;
  if (summary.sharedPolicyAllocation || summary.marriageCalculation || context) {
    if (!context || JSON.stringify(forms) !== JSON.stringify(context.input.form1095A)) throw new Error("Form8962 review requires matching original policy source context");
    const original = premiumTaxCreditReviewOriginalSourceInput(context.input, result, context.prepared);
    if (summary.sharedPolicyAllocation) allocation = calculateForm8962SharedPolicy(original);
    if (summary.marriageCalculation) {
      const sources = calculateForm8962MarriageSources(original), region = original.form8962?.fplRegion;
      if (!region) throw new Error("Form8962 marriage review requires the actual poverty region");
      marriage = calculateForm8962MarriageWorksheets({ ...sources, taxYear: original.taxpayer.taxYear, fplRegion: region, householdIncome: summary.modifiedAGI });
    }
  }

  const byLine = new Map<string, (typeof summary.lines)[number]>();
  for (const line of summary.lines) {
    if (line.form !== "Form 8962" || !INCLUDED_FORM_8962_LINE_SET.has(line.line)) continue;
    if (byLine.has(line.line) || !line.value.isFinite()) throw new Error(`Form 8962 reference requires unique finite audit line ${line.line}`);
    byLine.set(line.line, line);
  }
  const blankRepayment = marriage?.electionApplies === true && summary.excessAPTC.isZero();
  for (const line of REQUIRED_LINES) {
    if (blankRepayment && (line === "27" || line === "29")) continue;
    if (!byLine.has(line)) throw new Error(`Form 8962 reference is missing audit line ${line}`);
  }
  if (blankRepayment && ["27", "28", "29"].some(line => byLine.has(line))) throw new Error("Form8962 marriage Step8 requires blank repayment lines without excess advances");
  for (const [line, total] of [
    ["3", summary.modifiedAGI], ["4", summary.federalPovertyLine], ["5", summary.fplPercentageForTable],
    ["24", summary.ptcAllowed], ["25", summary.advancePTCTotal], ["26", summary.netPTC], ["27", summary.excessAPTC], ["29", summary.excessAPTCRepayment],
  ] as const) {
    if (blankRepayment && (line === "27" || line === "29") && total.isZero()) continue;
    if (!byLine.get(line)?.value.eq(total)) throw new Error(`Form 8962 audit line ${line} disagrees with its calculated total`);
  }
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
    for (const month of allocation.householdMonths) sourceAdvances.set(month.month, month.advance);
  }
  const reconciliationRows = summary.calculationMethod === "annual" ? ["11"] : [...sourceAdvances.keys()].sort((left, right) => left - right).map(month => String(month + 11));
  let auditedCredit = new Decimal(0), auditedAdvances = new Decimal(0);
  for (const row of reconciliationRows) {
    const advance = byLine.get(`${row}f`);
    if (!advance) throw new Error(`Form 8962 reference is missing audit line ${row}f`);
    auditedAdvances = auditedAdvances.plus(advance.value);
    if (["a", "b", "c", "d", "e"].some(column => byLine.has(`${row}${column}`))) {
      for (const column of ["a", "b", "c", "d", "e"]) if (!byLine.has(`${row}${column}`)) throw new Error(`Form 8962 reference is missing audit line ${row}${column}`);
      if (!marriage?.electionApplies || summary.taxpayerEligible) for (const line of ["7", "8a", "8b"]) if (!byLine.has(line)) throw new Error(`Form 8962 reference is missing contribution audit ${line}`);
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
    introduction: `Computed from ${forms.length} Form 1095-A statement${forms.length === 1 ? "" : "s"} using the ${summary.calculationMethod} method. ${summary.sourceFactsVerified ? "Actual household and coverage facts were supplied." : "This is an unverified historical preview; dependent income, regional residence and coverage eligibility have not been established."} Policy totals below are raw statement amounts; ${allocation ? "the separate actual Part IV allocation determines this return's monthly amounts." : "the calculation uses the corrected household benchmark."}`,
    policies: forms.map((form) => {
      const annualEnrollmentPremium = form.monthlyPremiums.reduce(
        (total, month) => total.plus(month.enrolleePremium),
        summary.annualPremium.minus(summary.annualPremium),
      );
      const annualSLCSP = form.monthlyPremiums.reduce<Decimal | null>(
        (total, month) => month.slcsp === null || total === null ? null : total.plus(month.slcsp),
        new Decimal(0),
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
        annualSLCSP: annualSLCSP?.toString() ?? null,
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
      firstMonth: period.firstMonth, lastMonth: period.lastMonth, fraction: period.fraction.toFixed(2), method: period.method ?? 'agreement' })),
    allocatedMonths: allocation?.months.map(month => ({ month: month.month, policyOrdinal: month.policyIndex + 1, originalPremium: month.originalPremium.toFixed(),
      originalSlcsp: month.originalSlcsp?.toFixed() ?? null, originalAdvance: month.originalAdvance.toFixed(), ...(month.unshared ? { unshared: true as const } : {}),
      premium: month.premium.toFixed(), slcsp: month.slcsp.toFixed(), advance: month.advance.toFixed(),
      ...(month.benchmarkRatio ? { benchmarkRatio: { numerator: month.benchmarkRatio.numerator.toFixed(), denominator: month.benchmarkRatio.denominator.toFixed() } } : {}) })),
    householdMonths: allocation?.householdMonths.filter(row => row.policyIndexes.length > 1).map(row => ({ month: row.month, policyOrdinals: row.policyIndexes.map(index => index + 1),
      premium: row.premium.toFixed(), slcsp: row.slcsp.toFixed(), advance: row.advance.toFixed(),
      unsharedBenchmarkGroups: row.unsharedBenchmarkGroups.map(group => ({ policyOrdinals: group.policyIndexes.map(index => index + 1), slcsp: group.slcsp.toFixed() })),
      ...(row.noAdvanceBenchmarkGroups ? { noAdvanceBenchmarkGroups: row.noAdvanceBenchmarkGroups.map(group => ({ policyOrdinals: group.policyIndexes.map(index => index + 1), slcsp: group.slcsp.toFixed() })) } : {}) })),
    marriage: marriage ? { electionApplies: marriage.electionApplies, worksheets: marriage.lines.filter(row => row.form.startsWith('Pub974 Marriage Worksheet')).map(row => ({
      form: row.form, line: row.line, description: row.description, value: row.value.toFixed(), formula: normalizeFormula(row.formula),
    })) } : undefined,
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

    y = drawWrappedText(page, `Annual SLCSP: ${policy.annualSLCSP === null ? "not totaled; original includes a printed blank" : formatAmountString(policy.annualSLCSP)}`, {
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
    write("All actual allocation periods are retained below. Taxpayer identifiers and private source references are omitted from this review copy. Policy numbers use the final 15 characters required by Part IV.");
    summary.allocations.forEach((period, index) => write(`Allocation ${index + 1}: policy ${period.policyNumber}; months ${period.firstMonth}-${period.lastMonth}; ${period.method === 'no_advance_benchmark'
      ? `premium fraction printed in column e ${period.fraction}; columns f and g blank. No advance credit; actual family benchmark ratio determines premiums before reporting.`
      : `premium, SLCSP and advance fractions ${period.fraction}. ${period.method === 'default_enrollee_count' ? 'Default allocation from actual enrollees.' : 'Actual agreed allocation.'}`}`));
    for (const row of summary.allocatedMonths ?? []) {
      write(`Policy ${row.policyOrdinal}, month ${row.month}. Original monthly source: premium $${row.originalPremium}; SLCSP ${row.originalSlcsp === null ? "printed blank" : `$${row.originalSlcsp}`}; advance $${row.originalAdvance}.`);
      if (row.benchmarkRatio) write(`Actual benchmark ratio before printed rounding: ${row.benchmarkRatio.numerator} / ${row.benchmarkRatio.denominator}.`);
      write(`Actual ${row.unshared ? "unallocated" : "allocated"} amounts before form rounding: premium $${row.premium}; SLCSP $${row.slcsp}; advance $${row.advance}.`);
    }
    for (const row of summary.householdMonths ?? []) {
      write(`Combined household month ${row.month}: policies ${row.policyOrdinals.join(', ')}; premium $${row.premium}; SLCSP $${row.slcsp}; advance $${row.advance}.`, true);
      for (const group of row.unsharedBenchmarkGroups) write(`Actual unshared coverage group: policies ${group.policyOrdinals.join(', ')}; benchmark $${group.slcsp}, counted once.`);
      for (const group of row.noAdvanceBenchmarkGroups ?? []) write(`Complete own coverage-family group: policies ${group.policyOrdinals.join(', ')}; benchmark $${group.slcsp}, counted once.`);
      write('This combined row supplies the monthly calculation once. Original policy rows above remain separate source records.');
    }
  }

  if (summary.marriage) {
    newPage();
    const write = (text: string, heading = false) => {
      for (const row of wrapText(text, regular, BODY_FONT_SIZE, PAGE_WIDTH - PAGE_MARGIN * 2)) {
        if (y < 54) newPage();
        page.drawText(row, { x: PAGE_MARGIN, y, size: BODY_FONT_SIZE, font: heading ? bold : regular }); y -= 14;
      }
      y -= 4;
    };
    write('FORM 8962 MARRIAGE - COMPLETED WORKSHEETS I-V', true);
    write(summary.marriage.electionApplies ? 'The source-verified alternative calculation is applied. Actual joint household income remains unchanged; the elected method cannot create additional net credit.'
      : 'The completed comparison retains the ordinary monthly calculation. No alternative election or Part V amount is applied.');
    write('Private person identifiers and source references are omitted. The actual original policies remain in the source record.');
    let previous = '';
    for (const row of summary.marriage.worksheets) {
      if (previous !== row.form) { write(row.form, true); previous = row.form; }
      write(`${row.line}: ${row.description} = ${row.value}. ${row.formula}`);
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

/** Source-backed Part IV/V map; validate the private original context before loading bytes. */
async function fillForm8962SourceReview(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string,
  prepared?: PreparedPremiumTaxCreditReview): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const summary = buildForm8962ReferenceSummary(input.form1095A, result, { input, prepared });
  if ((!summary.allocations?.length && !summary.marriage && !result.form7206?.coverageFamilyAllocations?.length) || !result.form8962) throw new Error('Form8962 physical review requires actual allocation, marriage or coverage-family sources');
  const values = new Map(summary.lines.map(row => [row.line, row.value]));
  const doc = await loadReviewTemplate(blankPdfPath, 2025), form = doc.getForm(), F = FORM_8962_FIELDS;
  const mappedFields = createPdfFieldBatch(form);
  mappedFields.setText(F.name, [input.taxpayer.primary, ...(input.taxpayer.filingStatus === 'married_filing_jointly' && input.taxpayer.spouse ? [input.taxpayer.spouse] : [])].map(person => `${person.firstName} ${person.lastName}`).join(' & '));
  mappedFields.setText(F.ssn, ''); mappedFields.setCheckBox(F.marriedSeparate, false);
  for (const line of ['1', '2a', '2b', '3', '4', '5', '7', '8a', '8b', '24', '25'] as const) {
    const value = values.get(line);
    mappedFields.setText(F[`line${line}`], value === undefined ? '' : line === '7' ? new Decimal(value).toFixed(4) : new Decimal(value).toFixed(0));
  }
  const region = input.form8962?.fplRegion;
  for (const [index, name] of ['alaska', 'hawaii', 'contiguous'].entries()) mappedFields.setCheckBox(F.regions[index], region === name);
  const specialMethod = Boolean(summary.allocations?.length || summary.marriage?.electionApplies);
  const annual = result.form8962.calculationMethod === 'annual';
  for (const [name, state] of [[F.line9Yes, specialMethod], [F.line9No, !specialMethod], [F.line10Yes, annual], [F.line10No, !annual]] as const) mappedFields.setCheckBox(name, state);
  for (const [index, name] of F.annual.entries()) {
    const value = annual ? values.get(`11${'abcdef'[index]}`) : undefined;
    mappedFields.setText(name, value === undefined ? '' : new Decimal(value).toFixed(0));
  }
  for (const [month, fields] of F.monthly.entries()) for (const [index, name] of fields.entries()) {
    const value = values.get(`${month + 12}${'abcdef'[index]}`); mappedFields.setText(name, value === undefined ? '' : new Decimal(value).toFixed(0));
  }
  const excess = result.form8962.excessAPTC.gt(0);
  mappedFields.setText(F.line26, summary.marriage?.electionApplies ? '0' : excess ? '' : result.form8962.netPTC.toFixed(0));
  for (const line of ['27', '28', '29'] as const) mappedFields.setText(F[`line${line}`], excess && values.has(line) ? new Decimal(values.get(line)!).toFixed(0) : '');
  for (const [index, fields] of F.allocations.entries()) {
    const period = summary.allocations?.[index];
    const row = period ? [period.policyNumber, '', String(period.firstMonth).padStart(2, '0'), String(period.lastMonth).padStart(2, '0'), period.fraction, period.method === 'no_advance_benchmark' ? '' : period.fraction, period.method === 'no_advance_benchmark' ? '' : period.fraction] : Array<string>(7).fill('');
    fields.forEach((name, column) => mappedFields.setText(name, row[column]));
  }
  mappedFields.setCheckBox(F.line34Yes, Boolean(summary.allocations?.length && summary.allocations.length <= 4)); mappedFields.setCheckBox(F.line34No, Boolean(summary.allocations && summary.allocations.length > 4));
  F.marriage.forEach((name, index) => {
    const column = index % 4, value = values.get(`${index < 4 ? '35' : '36'}${'abcd'[column]}`);
    mappedFields.setText(name, value === undefined ? '' : column >= 2 ? new Decimal(value).toFixed(0).padStart(2, '0') : new Decimal(value).toFixed(0));
  });
  mappedFields.apply();
  await markReviewPdf(doc);
  return doc;
}

export async function fillForm8962SharedPolicy(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string,
  prepared?: PreparedPremiumTaxCreditReview): Promise<PDFDocument> {
  if (!result.form8962?.sharedPolicyAllocation) throw new Error('Form8962 physical review requires actual shared-policy allocations');
  return fillForm8962SourceReview(input, result, blankPdfPath, prepared);
}

export async function fillForm8962Marriage(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string,
  prepared?: PreparedPremiumTaxCreditReview): Promise<PDFDocument> {
  if (!result.form8962?.marriageCalculation) throw new Error('Form8962 physical review requires actual marriage sources');
  return fillForm8962SourceReview(input, result, blankPdfPath, prepared);
}

export async function fillForm8962CoverageFamily(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string,
  prepared?: PreparedPremiumTaxCreditReview): Promise<PDFDocument> {
  if (!result.form7206?.coverageFamilyAllocations?.length) throw new Error('Form8962 physical review requires actual coverage-family sources');
  return fillForm8962SourceReview(input, result, blankPdfPath, prepared);
}
