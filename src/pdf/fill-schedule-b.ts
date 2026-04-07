/**
 * PDF filler for IRS Schedule B (Form 1040) — Interest and Ordinary Dividends.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Schedule B uses "topmostSubform[0]" as root.
 *
 * Part I: Interest payers (up to 14 rows), total, exclusion, taxable interest.
 * Part II: Dividend payers (up to 14 rows), total ordinary dividends.
 * Part III: Foreign accounts / trusts checkboxes.
 */

import { PDFDocument } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule B fillable PDF field inspection.
//
// Part I: Interest (14 payer rows × 2 fields each: name + amount)
//   Payer names: f1_03 through f1_16 (odd-indexed from ReadOrder, then sequential)
//   Payer amounts: f1_04 through f1_30 (even-indexed)
// Part II: Dividend (16 payer rows × 2 fields each: name + amount)
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
    p1("f1_64[0]"),
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
    p1("f1_64[0]"),  // Last row — may double as summary on some layouts
  ],

  // ── Part II Summary ──
  line6: p1("f1_65[0]"),  // Total ordinary dividends → 1040 Line 3b

  // ── Part III: Foreign Accounts ──
  // Line 7a: Yes/No for foreign accounts (radio pair)
  line7aYes: p1("TagcorrectingSubform[0].c1_1[0]"),
  line7aNo: p1("TagcorrectingSubform[0].c1_1[1]"),
  // Line 7b: Countries (text field)
  line7bCountries: p1("f1_66[0]"),
  // Line 8: Yes/No for foreign trust
  line8Yes: p1("c1_2[0]"),
  line8No: p1("c1_2[1]"),
} as const;

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
  const doc = await loadBlankPdf(blankPdfPath);
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
  const maxInterestRows = Math.min(sb.interestPayers.length, F.interestPayerName.length);
  for (let i = 0; i < maxInterestRows; i++) {
    const payer = sb.interestPayers[i];
    setTextField(form, F.interestPayerName[i], payer.name);
    setCurrencyField(form, F.interestPayerAmount[i], payer.amount);
  }
  setCurrencyField(form, F.line2, sb.totalInterest);
  setCurrencyField(form, F.line3, sb.savingsBondExclusion);
  setCurrencyField(form, F.line4, sb.taxableInterest);

  // ── Part II: Dividend Payers ──
  const maxDivRows = Math.min(sb.dividendPayers.length, F.dividendPayerName.length);
  for (let i = 0; i < maxDivRows; i++) {
    const payer = sb.dividendPayers[i];
    setTextField(form, F.dividendPayerName[i], payer.name);
    setCurrencyField(form, F.dividendPayerAmount[i], payer.amount);
  }
  setCurrencyField(form, F.line6, sb.totalOrdinaryDividends);

  // ── Part III: Foreign Accounts ──
  if (sb.hasForeignAccounts) {
    setCheckBox(form, F.line7aYes, true);
    if (sb.foreignAccountCountries.length > 0) {
      setTextField(form, F.line7bCountries, sb.foreignAccountCountries.join(", "));
    }
  } else {
    setCheckBox(form, F.line7aNo, true);
  }

  if (sb.hasForeignTrust) {
    setCheckBox(form, F.line8Yes, true);
  } else {
    setCheckBox(form, F.line8No, true);
  }

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_B_FIELDS };
