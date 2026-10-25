import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8949 — Sales and Other Dispositions of Capital Assets.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Page 1 = Part I (Short-Term), Page 2 = Part II (Long-Term).
 *
 * Each page has 11 transaction rows plus a totals row.
 * Per IRS rules, only one box can be checked per copy of the form.
 * Every supported category has its own part; continuation copies retain every
 * transaction and a complete interactive AcroForm field tree.
 */

import { PDFDocument, PDFObjectCopier, PDFPage, PDFPageLeaf } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CategoryTotals, TransactionSummary } from "@/engine/forms/form-8949.js";
import { form8949ReviewCalculation, type PreparedForm8949Review } from "../../form-8949-review-context.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
  formatCurrency,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Transaction Row Definitions ───────────────────────────────────────────
// Each row has 8 fields: (a) description, (b) date acquired, (c) date sold,
// (d) proceeds, (e) cost basis, (f) code, (g) adjustment, (h) gain/loss.

interface RowFields {
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: string;
  costBasis: string;
  code: string;
  adjustment: string;
  gainLoss: string;
}

function makePageRows(prefix: string, pageHelper: (n: string) => string): RowFields[] {
  const rows: RowFields[] = [];
  // Rows 1-11, each with 8 consecutive fields
  // Row 1 starts at f{p}_03, Row 2 at f{p}_11, etc. (8 fields per row)
  for (let row = 0; row < 11; row++) {
    const base = 3 + row * 8; // f_03, f_11, f_19, f_27, ...
    const pad = (n: number) => n.toString().padStart(2, "0");
    const t = (tableRow: string, field: string) =>
      pageHelper(`Table_Line1_Part${prefix === "1" ? "1" : "2"}[0].Row${tableRow}[0].${field}`);
    const rowNum = (row + 1).toString();
    rows.push({
      description: t(rowNum, `${prefix === "1" ? "f1" : "f2"}_${pad(base)}[0]`),
      dateAcquired: t(rowNum, `${prefix === "1" ? "f1" : "f2"}_${pad(base + 1)}[0]`),
      dateSold: t(rowNum, `${prefix === "1" ? "f1" : "f2"}_${pad(base + 2)}[0]`),
      proceeds: t(rowNum, `${prefix === "1" ? "f1" : "f2"}_${pad(base + 3)}[0]`),
      costBasis: t(rowNum, `${prefix === "1" ? "f1" : "f2"}_${pad(base + 4)}[0]`),
      code: t(rowNum, `${prefix === "1" ? "f1" : "f2"}_${pad(base + 5)}[0]`),
      adjustment: t(rowNum, `${prefix === "1" ? "f1" : "f2"}_${pad(base + 6)}[0]`),
      gainLoss: t(rowNum, `${prefix === "1" ? "f1" : "f2"}_${pad(base + 7)}[0]`),
    });
  }
  return rows;
}

const PAGE1_ROWS = makePageRows("1", p1);
const PAGE2_ROWS = makePageRows("2", p2);

// ─── Field Mapping ─────────────────────────────────────────────────────────

const FIELDS = {
  // ── Page 1 Header ──
  name1: p1("f1_01[0]"),
  ssn1: p1("f1_02[0]"),

  // Part I checkboxes (Short-Term)
  boxA: p1("c1_1[0]"),  // Basis reported to IRS (1099-B)
  boxB: p1("c1_1[1]"),  // Basis NOT reported to IRS (1099-B)
  boxC: p1("c1_1[2]"),  // Not reported on 1099-B
  boxG: p1("c1_1[3]"),  // 1099-DA basis reported
  boxH: p1("c1_1[4]"),  // 1099-DA basis NOT reported
  boxI: p1("c1_1[5]"),  // Digital asset not reported

  // Part I transaction rows
  page1Rows: PAGE1_ROWS,

  // Part I totals (Line 2)
  page1TotalProceeds: p1("f1_91[0]"),
  page1TotalCostBasis: p1("f1_92[0]"),
  page1TotalCode: p1("f1_93[0]"),
  page1TotalAdjustment: p1("f1_94[0]"),
  page1TotalGainLoss: p1("f1_95[0]"),

  // ── Page 2 Header ──
  name2: p2("f2_01[0]"),
  ssn2: p2("f2_02[0]"),

  // Part II checkboxes (Long-Term)
  boxD: p2("c2_1[0]"),  // Basis reported to IRS (1099-B)
  boxE: p2("c2_1[1]"),  // Basis NOT reported to IRS (1099-B)
  boxF: p2("c2_1[2]"),  // Not reported on 1099-B
  boxJ: p2("c2_1[3]"),  // 1099-DA basis reported
  boxK: p2("c2_1[4]"),  // 1099-DA basis NOT reported
  boxL: p2("c2_1[5]"),  // Digital asset not reported

  // Part II transaction rows
  page2Rows: PAGE2_ROWS,

  // Part II totals (Line 2)
  page2TotalProceeds: p2("f2_91[0]"),
  page2TotalCostBasis: p2("f2_92[0]"),
  page2TotalCode: p2("f2_93[0]"),
  page2TotalAdjustment: p2("f2_94[0]"),
  page2TotalGainLoss: p2("f2_95[0]"),
} as const;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Fill transaction rows on a page (up to 11 rows). */
function fillTransactionRows(
  form: ReturnType<PDFDocument["getForm"]>,
  rows: RowFields[],
  transactions: TransactionSummary[],
): void {
  if (transactions.length > rows.length) throw new Error("Form8949 page exceeds its transaction capacity");
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    const r = rows[i];
    setTextField(form, r.description, t.description);
    setTextField(form, r.dateAcquired, t.dateAcquired);
    setTextField(form, r.dateSold, t.dateSold);
    setCurrencyField(form, r.proceeds, t.proceeds);
    setCurrencyField(form, r.costBasis, t.costBasis);
    if (t.adjustmentCode) {
      setTextField(form, r.code, t.adjustmentCode);
    }
    setCurrencyField(form, r.adjustment, t.adjustment);
    setTextField(form, r.gainLoss, formatCurrency(t.gainLoss));
  }
}

interface CategoryPage { box: string; transactions: TransactionSummary[] }
function categoryPages(categories: Array<[string, CategoryTotals]>): CategoryPage[] {
  return categories.flatMap(([box, category]) => {
    const pages: CategoryPage[] = [];
    for (let offset = 0; offset < category.transactions.length; offset += 11) {
      pages.push({ box, transactions: category.transactions.slice(offset, offset + 11) });
    }
    return pages;
  });
}

function fillPart(form: ReturnType<PDFDocument["getForm"]>, part: 1 | 2, page?: CategoryPage): void {
  if (!page) return;
  const F = FIELDS;
  setCheckBox(form, page.box, true);
  fillTransactionRows(form, part === 1 ? F.page1Rows : F.page2Rows, page.transactions);
  const total = (key: 'proceeds' | 'costBasis' | 'adjustment' | 'gainLoss') =>
    page.transactions.reduce((amount, row) => amount.plus(row[key]), new Decimal(0));
  fillTotals(form, part === 1 ? {
    proceeds: F.page1TotalProceeds, costBasis: F.page1TotalCostBasis,
    adjustment: F.page1TotalAdjustment, gainLoss: F.page1TotalGainLoss,
  } : {
    proceeds: F.page2TotalProceeds, costBasis: F.page2TotalCostBasis,
    adjustment: F.page2TotalAdjustment, gainLoss: F.page2TotalGainLoss,
  }, { transactions: page.transactions, totalProceeds: total('proceeds'), totalCostBasis: total('costBasis'),
    totalAdjustments: total('adjustment'), totalGainLoss: total('gainLoss') });
}

/** One copier preserves shared field/widget/page references. copyPages alone
 * would omit the canonical AcroForm tree and leave orphaned widgets. */
async function appendInteractiveCopy(target: PDFDocument, source: PDFDocument, copy: number): Promise<void> {
  const sourceForm = source.getForm();
  const roots = sourceForm.acroForm.getFields();
  if (roots.length !== 1 || roots[0]?.[0].getPartialName() !== 'topmostSubform[0]') {
    throw new Error('Form8949 registered template has an unexpected field root');
  }
  sourceForm.updateFieldAppearances();
  roots[0][0].setPartialName(`topmostSubform[${copy}]`);
  await source.flush();
  const copier = PDFObjectCopier.for(source.context, target.context);
  for (const page of source.getPages()) {
    const ref = copier.copy(page.ref);
    const node = target.context.lookup(ref);
    if (!(node instanceof PDFPageLeaf)) throw new Error('Form8949 continuation page is missing');
    target.addPage(PDFPage.of(node, ref, target));
  }
  for (const [, ref] of roots) target.getForm().acroForm.addField(copier.copy(ref));
}

/** Fill totals row for a category. */
function fillTotals(
  form: ReturnType<PDFDocument["getForm"]>,
  totalFields: {
    proceeds: string;
    costBasis: string;
    adjustment: string;
    gainLoss: string;
  },
  category: CategoryTotals,
): void {
  setCurrencyField(form, totalFields.proceeds, category.totalProceeds);
  setCurrencyField(form, totalFields.costBasis, category.totalCostBasis);
  setCurrencyField(form, totalFields.adjustment, category.totalAdjustments);
  setCurrencyField(form, totalFields.gainLoss, category.totalGainLoss);
}

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 8949 PDF from input data.
 * Calculates Form 8949 directly from input (it's not on TaxReturnResult).
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm8949(
  input: TaxYearInput,
  blankPdfPath: string,
  prepared?: PreparedForm8949Review,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, input.taxpayer.taxYear);
  const result = form8949ReviewCalculation(input, prepared);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const F = FIELDS;
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  const short = categoryPages([[F.boxA, result.shortTermBoxA], [F.boxB, result.shortTermBoxB]]);
  const long = categoryPages([[F.boxD, result.longTermBoxD], [F.boxE, result.longTermBoxE], [F.boxF, result.longTermBoxF]]);
  for (let copy = 0; copy < Math.max(1, short.length, long.length); copy++) {
    const current = copy === 0 ? doc : await loadReviewTemplate(blankPdfPath, 2025);
    const form = current.getForm();
    for (const field of [F.name1, F.name2]) setTextField(form, field, name);
    for (const field of [F.ssn1, F.ssn2]) setTextField(form, field, input.taxpayer.primary.ssn.replace(/-/g, ''));
    fillPart(form, 1, short[copy]);
    fillPart(form, 2, long[copy]);
    if (copy > 0) await appendInteractiveCopy(doc, current, copy);
  }
  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_8949_FIELDS };
