import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
/**
 * PDF filler for IRS Schedule B (Form 1040) — Interest and Ordinary Dividends.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Schedule B uses "topmostSubform[0]" as root.
 *
 * Part I: Interest payers (up to 14 rows), total, exclusion, taxable interest.
 * Part II: Dividend payers (up to 15 rows), total ordinary dividends.
 * Part III: Foreign accounts / trusts checkboxes.
 */

import { breakTextIntoLines, StandardFonts, type PDFDocument, type PDFFont, type PDFForm } from "pdf-lib";
import type { InterestPayer } from "@/engine/schedules/schedule-b.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  formatCurrency,
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule B fillable PDF field inspection.
//
// Part I: Interest (14 payer rows × 2 fields each: name + amount)
//   Payer names: f1_03 through f1_16 (odd-indexed from ReadOrder, then sequential)
//   Payer amounts: f1_04 through f1_30 (even-indexed)
// Part II: Dividend (15 payer rows × 2 fields each: name + amount)
// Part III: Foreign accounts

const FIELDS = {
  // ── Header ──
  name: p1("f1_01[0]"),
  ssn: p1("f1_02[0]"),

  // ── Part I: Interest Payers ──
  // Row layout: name field, then amount field
  // 14 rows of interest payers
  interestPayerName: [
    p1("Line1_ReadOrder[0].f1_03[0]"), // Row 1 name
    p1("f1_05[0]"),
    p1("f1_07[0]"),
    p1("f1_09[0]"),
    p1("f1_11[0]"),
    p1("f1_13[0]"),
    p1("f1_15[0]"),
    p1("f1_17[0]"),
    p1("f1_19[0]"),
    p1("f1_21[0]"),
    p1("f1_23[0]"),
    p1("f1_25[0]"),
    p1("f1_27[0]"),
    p1("f1_29[0]"),
  ],
  interestPayerAmount: [
    p1("f1_04[0]"),  // Row 1 amount
    p1("f1_06[0]"),
    p1("f1_08[0]"),
    p1("f1_10[0]"),
    p1("f1_12[0]"),
    p1("f1_14[0]"),
    p1("f1_16[0]"),
    p1("f1_18[0]"),
    p1("f1_20[0]"),
    p1("f1_22[0]"),
    p1("f1_24[0]"),
    p1("f1_26[0]"),
    p1("f1_28[0]"),
    p1("f1_30[0]"),
  ],

  // ── Part I Summary ──
  line2: p1("f1_31[0]"),  // Total interest (add rows above)
  line3: p1("f1_32[0]"),  // Excludable interest on Series EE/I bonds
  line4: p1("f1_33[0]"),  // Taxable interest (Line 2 minus Line 3) → 1040 Line 2b

  // ── Part II: Dividend Payers ──
  dividendPayerName: [
    p1("ReadOrderControl[0].f1_34[0]"), // Row 1 name
    p1("f1_36[0]"),
    p1("f1_38[0]"),
    p1("f1_40[0]"),
    p1("f1_42[0]"),
    p1("f1_44[0]"),
    p1("f1_46[0]"),
    p1("f1_48[0]"),
    p1("f1_50[0]"),
    p1("f1_52[0]"),
    p1("f1_54[0]"),
    p1("f1_56[0]"),
    p1("f1_58[0]"),
    p1("f1_60[0]"),
    p1("f1_62[0]"),
  ],
  dividendPayerAmount: [
    p1("f1_35[0]"),  // Row 1 amount
    p1("f1_37[0]"),
    p1("f1_39[0]"),
    p1("f1_41[0]"),
    p1("f1_43[0]"),
    p1("f1_45[0]"),
    p1("f1_47[0]"),
    p1("f1_49[0]"),
    p1("f1_51[0]"),
    p1("f1_53[0]"),
    p1("f1_55[0]"),
    p1("f1_57[0]"),
    p1("f1_59[0]"),
    p1("f1_61[0]"),
    p1("f1_63[0]"),
  ],

  // ── Part II Summary ──
  line6: p1("f1_64[0]"),  // Total ordinary dividends → 1040 Line 3b

  // ── Part III: Foreign Accounts and Trusts ──
  // Line 7a, first row: financial interest or signature authority.
  line7aYes: p1("TagcorrectingSubform[0].c1_1[0]"),
  line7aNo: p1("TagcorrectingSubform[0].c1_1[1]"),
  // Line 7a, second row: whether FinCEN Form 114 is required.
  line7aFbarYes: p1("c1_2[0]"),
  line7aFbarNo: p1("c1_2[1]"),
  line7bCountries: p1("f1_65[0]"),
  line7bCountriesContinuation: p1("f1_66[0]"),
  // Line 8: distributions from, or grantor or transferor to, a foreign trust.
  line8Yes: p1("c1_3[0]"),
  line8No: p1("c1_3[1]"),
} as const;

const interestPayerCapacity = FIELDS.interestPayerName.length;
const dividendPayerCapacity = FIELDS.dividendPayerName.length;

export function assertScheduleBReviewCapacity(result: TaxReturnResult): void {
  const sb = result.scheduleB;
  if (sb && sb.dividendPayers.length > dividendPayerCapacity && result.form8814?.totalQualifiedDividends.gt(0)) {
    throw new Error(`Schedule B review PDF cannot include Form 8814 with more than ${dividendPayerCapacity} dividend payer rows.`);
  }
}

function fillForeignAccountCountries(form: PDFForm, countries: readonly string[]) {
  const { line7bCountries, line7bCountriesContinuation } = FIELDS;
  const font = form.getDefaultFont();
  const fontSize = 8; // Default appearance size for both country fields in the pinned template.
  const supportedCharacters = new Set(font.getCharacterSet());
  const printableCountries = countries.filter(country =>
    Array.from(country).every(character => supportedCharacters.has(character.codePointAt(0) ?? -1)),
  );
  const usableWidth = (name: string): number => {
    const [widget] = form.getTextField(name).acroField.getWidgets();
    return widget.getRectangle().width - 2 * (1 + (widget.getBorderStyle()?.getWidth() ?? 0));
  };
  const firstWidth = usableWidth(line7bCountries);
  let firstLine = "";
  let firstCount = 0;
  for (const country of printableCountries) {
    const next = firstLine ? `${firstLine}, ${country}` : country;
    if (font.widthOfTextAtSize(next, fontSize) > firstWidth) break;
    firstLine = next;
    firstCount++;
  }
  if (firstLine) setTextField(form, line7bCountries, firstLine);
  const remaining = printableCountries.slice(firstCount);
  const secondLine = remaining.join(", ");
  const omittedCountryCount = countries.length - printableCountries.length;
  if (omittedCountryCount === 0 && font.widthOfTextAtSize(secondLine, fontSize) <= usableWidth(line7bCountriesContinuation)) {
    if (secondLine) setTextField(form, line7bCountriesContinuation, secondLine);
    return;
  }
  setTextField(form, firstLine ? line7bCountriesContinuation : line7bCountries, "See attached statement");
  return { remaining, omittedCountryCount };
}

function appendCountryStatement(doc: PDFDocument, font: PDFFont, countries: readonly string[], omittedCountryCount: number): void {
  const left = 40;
  const width = 532;
  const size = 10;
  const lines = countries.flatMap(country => breakTextIntoLines(country, [""], width, text => font.widthOfTextAtSize(text, size)));
  const rowsPerPage = 43;
  for (let start = 0; start < Math.max(lines.length, 1); start += rowsPerPage) {
    const page = doc.addPage([612, 792]);
    page.drawText("2025 Schedule B - Line 7b Foreign Account Countries", { x: left, y: 750, size: 14, font });
    if (omittedCountryCount > 0) {
      const label = omittedCountryCount === 1 ? "country name" : "country names";
      page.drawText(`Provide printable English spellings for ${omittedCountryCount} ${label} on this review PDF.`, { x: left, y: 726, size, font });
    }
    lines.slice(start, start + rowsPerPage).forEach((line, index) => {
      page.drawText(line, { x: left, y: 690 - index * 15, size, font });
    });
  }
}

/** 2025 Schedule B Lines 1 and 5 use separate payer/amount statements. */
function appendPayerStatement(
  doc: PDFDocument,
  font: PDFFont,
  returnName: string,
  title: string,
  payers: readonly InterestPayer[],
): void {
  if (!payers.length) return;

  const left = 40;
  const right = 572;
  const rowStart = 690;
  const rowHeight = 15;
  const fontSize = 10;
  const amountWidth = 126;
  const textWidth = (text: string) => font.widthOfTextAtSize(text, fontSize);
  const fittingSize = (text: string, width: number) => Math.min(fontSize, width / font.widthOfTextAtSize(text, 1));
  const displayName = returnName.replace(/\s+/g, " ");
  const nameSize = fittingSize(displayName, right - left);
  const addPage = () => {
    const page = doc.addPage([612, 792]);
    page.drawText(title, { x: left, y: 750, size: 14, font });
    page.drawText(displayName, { x: left, y: 726, size: nameSize, font });
    page.drawText("Payer name", { x: left, y: 708, size: fontSize, font });
    page.drawText("Amount", { x: right - textWidth("Amount"), y: 708, size: fontSize, font });
    return page;
  };
  let page = addPage();
  let y = rowStart;

  for (const payer of payers) {
    const amount = formatCurrency(payer.amount) || "0";
    const amountSize = fittingSize(amount, amountWidth);
    const amountX = right - font.widthOfTextAtSize(amount, amountSize);
    // Break at character boundaries so even an unbroken source name fits.
    const lines = breakTextIntoLines(payer.name, [""], right - left - amountWidth - 16, textWidth);
    for (const [index, line] of (lines.length ? lines : [""]).entries()) {
      if (y < 48) {
        page = addPage();
        y = rowStart;
      }
      page.drawText(line, { x: left, y, size: fontSize, font });
      if (index === 0) page.drawText(amount, { x: amountX, y, size: amountSize, font });
      y -= rowHeight;
    }
  }
}

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule B PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleB(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  assertScheduleBReviewCapacity(result);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const sb = result.scheduleB;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!sb) return doc;

  // ── Part I: Interest Payers ──
  const interestRows = sb.interestReportingRows ?? sb.interestPayers;
  const maxInterestRows = Math.min(interestRows.length, interestPayerCapacity);
  for (let i = 0; i < maxInterestRows; i++) {
    const payer = interestRows[i];
    setTextField(form, F.interestPayerName[i], payer.name);
    const amountField = F.interestPayerAmount[i];
    if (sb.interestReportingRows && payer.amount.isZero()) setTextField(form, amountField, "0");
    else setCurrencyField(form, amountField, payer.amount);
  }
  setCurrencyField(form, F.line2, sb.totalInterest);
  setCurrencyField(form, F.line3, sb.savingsBondExclusion);
  setCurrencyField(form, F.line4, sb.taxableInterest);

  // ── Part II: Dividend Payers ──
  const maxDivRows = Math.min(sb.dividendPayers.length, dividendPayerCapacity);
  for (let i = 0; i < maxDivRows; i++) {
    const payer = sb.dividendPayers[i];
    setTextField(form, F.dividendPayerName[i], payer.name);
    setCurrencyField(form, F.dividendPayerAmount[i], payer.amount);
  }
  setCurrencyField(form, F.line6, sb.totalOrdinaryDividends);

  // ── Part III: Foreign Accounts and Trusts ──
  for (const [answer, yes, no] of [
    [sb.hasForeignAccounts, F.line7aYes, F.line7aNo],
    [sb.fbarRequired, F.line7aFbarYes, F.line7aFbarNo],
    [sb.hasForeignTrust, F.line8Yes, F.line8No],
  ] as const) {
    if (typeof answer === "boolean") setCheckBox(form, answer ? yes : no, true);
  }
  const countryStatement = sb.fbarRequired === true && sb.foreignAccountCountries.length > 0
    ? fillForeignAccountCountries(form, sb.foreignAccountCountries)
    : undefined;

  const additionalInterest = interestRows.slice(interestPayerCapacity);
  const additionalDividends = sb.dividendPayers.slice(dividendPayerCapacity);
  const payerStatementNeeded = additionalInterest.length > 0 || additionalDividends.length > 0;
  if (payerStatementNeeded || countryStatement) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    if (payerStatementNeeded) {
      doc.getPage(0).drawText("Additional Schedule B payer rows on the following pages.", { x: 36, y: 768, size: 10, font });
      appendPayerStatement(doc, font, name, "2025 Schedule B - Line 1 Interest Payer Continuation", additionalInterest);
      appendPayerStatement(doc, font, name, "2025 Schedule B - Line 5 Ordinary Dividend Payer Continuation", additionalDividends);
    }
    if (countryStatement) {
      appendCountryStatement(doc, font, countryStatement.remaining, countryStatement.omittedCountryCount);
    }
    await markReviewPdf(doc);
  }

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_B_FIELDS };
