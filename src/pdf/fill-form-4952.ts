/**
 * PDF filler for IRS Form 4952 — Investment Interest Expense Deduction.
 *
 * Field names verified against 2025 Form 4952 fillable PDF field inspection.
 *
 * Note: The 2025 form has lines 4a–4h, 5, 6, 7, 8. The engine result uses a
 * simplified numbering (4a–4g, deductibleAmount, disallowedCarryforward).
 * This filler maps engine values to the correct 2025 PDF fields.
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p1r = (n: string) => `topmostSubform[0].Page1[0].Line4a_ReadOrder[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 4952 fillable PDF debug labels.

export const FORM_4952_FIELDS = {
  // ── Header ──
  name: p1("f1_01[0]"),
  ssn: p1("f1_02[0]"),

  // ── Part I: Total Investment Interest Expense ──
  line1: p1("f1_03[0]"),   // Investment interest expense paid or accrued
  line2: p1("f1_04[0]"),   // Disallowed from prior year
  line3: p1("f1_05[0]"),   // Total (Line 1 + Line 2)

  // ── Part II: Net Investment Income ──
  line4a: p1r("f1_06[0]"), // Gross income from property held for investment
  line4b: p1("f1_07[0]"),  // Qualified dividends included on Line 4a
  line4c: p1("f1_08[0]"),  // Subtract Line 4b from Line 4a
  line4d: p1("f1_09[0]"),  // Net gain from disposition of investment property
  line4e: p1("f1_10[0]"),  // Smaller of 4d or net capital gain
  line4f: p1("f1_11[0]"),  // Subtract Line 4e from Line 4d
  line4g: p1("f1_12[0]"),  // Elected preferential income from 4b and 4e
  line4h: p1("f1_13[0]"),  // Investment income (4c + 4f + 4g)
  line5: p1("f1_14[0]"),   // Investment expenses
  line6: p1("f1_15[0]"),   // Net investment income (4h - 5)

  // ── Part III: Investment Interest Expense Deduction ──
  line7: p1("f1_16[0]"),   // Disallowed carryforward to next year
  line8: p1("f1_17[0]"),   // Deduction (smaller of Line 3 or Line 6)
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 4952 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm4952(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = FORM_4952_FIELDS;
  const f4952 = result.form4952;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f4952) return doc;

  // ── Part I: Total Investment Interest Expense ──
  setCurrencyField(form, F.line1, f4952.line1);
  setCurrencyField(form, F.line2, f4952.line2);
  setCurrencyField(form, F.line3, f4952.line3);

  // ── Part II: Net Investment Income ──
  setCurrencyField(form, F.line4a, f4952.line4a);
  setCurrencyField(form, F.line4b, f4952.line4b);
  setCurrencyField(form, F.line4c, f4952.line4c);
  setCurrencyField(form, F.line4d, f4952.line4d);

  // 2025 form lines 4e/4f split net gain into preferential vs non-preferential.
  // The engine doesn't track this decomposition separately, so:
  // - PDF 4e: leave blank (engine doesn't separate net capital gain from net gain)
  // - PDF 4f: = line4d (since 4e=0, the full net gain flows through)
  setCurrencyField(form, F.line4f, f4952.line4d);

  // PDF 4g = engine's elected preferential income (engine line4e)
  setCurrencyField(form, F.line4g, f4952.line4e);

  // PDF 4h = investment income = 4c + 4f + 4g = line4c + line4d + engine.line4e
  const line4h = f4952.line4c.plus(f4952.line4d).plus(f4952.line4e);
  setCurrencyField(form, F.line4h, line4h);

  // PDF Line 5 = investment expenses (engine line4f)
  setCurrencyField(form, F.line5, f4952.line4f);

  // PDF Line 6 = net investment income (engine line4g)
  setCurrencyField(form, F.line6, f4952.line4g);

  // ── Part III: Investment Interest Expense Deduction ──
  setCurrencyField(form, F.line7, f4952.disallowedCarryforward);
  setCurrencyField(form, F.line8, f4952.deductibleAmount);

  return doc;
}
