import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 4952 — Investment Interest Expense Deduction.
 *
 * Field names verified against 2025 Form 4952 fillable PDF field inspection.
 *
 * Every printed field copies its unique audited engine line. The 2026 source
 * has different field identifiers and is not registered for review or filing.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadReviewTemplate,
  setTextField,
  formatCurrency,
} from "../../pdf-utils.js";

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
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const f4952 = result.form4952;
  if (!f4952) throw new Error("Form4952 requires an audited calculation before creating a review PDF");
  if (f4952.taxYear !== result.taxYear) throw new Error("Form4952 audit year disagrees with the return year");
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FORM_4952_FIELDS;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  const fields = {
    "1": F.line1, "2": F.line2, "3": F.line3, "4a": F.line4a, "4b": F.line4b,
    "4c": F.line4c, "4d": F.line4d, "4e": F.line4e, "4f": F.line4f,
    "4g": F.line4g, "4h": F.line4h, "5": F.line5, "6": F.line6, "7": F.line7, "8": F.line8,
  } as const;
  const byLine = new Map<string, Decimal>();
  for (const line of f4952.lines) {
    if (line.form !== "Form 4952" || !Object.hasOwn(fields, line.line)) continue;
    if (byLine.has(line.line) || !Decimal.isDecimal(line.value) || !line.value.isFinite()
      || (!["4a", "4c", "4h"].includes(line.line) && line.value.isNegative())) {
      throw new Error(`Form4952 requires a unique finite valid audit for line${line.line}`);
    }
    byLine.set(line.line, line.value);
  }
  for (const [line, field] of Object.entries(fields)) {
    const value = byLine.get(line);
    const total = f4952[`line${line}` as keyof typeof f4952];
    if (!value || !Decimal.isDecimal(total) || !value.eq(total)) throw new Error(`Form4952 audit line${line} is missing or disagrees with its calculated total`);
    setTextField(form, field, value.isZero() ? "0" : formatCurrency(value));
  }
  if (!f4952.line7.eq(f4952.disallowedCarryforward) || !f4952.line8.eq(f4952.deductibleAmount)) throw new Error("Form4952 deduction or carryforward audit disagrees with the return");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.getPages()[0];
  if (!Decimal.isDecimal(f4952.electedNetCapitalGain) || !f4952.electedNetCapitalGain.isFinite() || f4952.electedNetCapitalGain.isNegative()
    || !Decimal.isDecimal(f4952.electedQualifiedDividends) || !f4952.electedQualifiedDividends.isFinite() || f4952.electedQualifiedDividends.isNegative()
    || f4952.electedNetCapitalGain.gt(f4952.line4e) || f4952.electedQualifiedDividends.gt(f4952.line4b)
    || !f4952.electedNetCapitalGain.plus(f4952.electedQualifiedDividends).eq(f4952.line4g)) throw new Error("Form4952 election allocations disagree with the printed audit");
  if (f4952.hasExplicitCapitalGainElection) {
    const electionAudit = f4952.lines.filter(line => line.form === "Form 4952 Election" && line.line === "capital_gain");
    if (electionAudit.length !== 1 || !electionAudit[0].value.eq(f4952.electedNetCapitalGain)) throw new Error("Form4952 Elec allocation disagrees with its audit");
    // Printed dotted space before the4e box; no IRS AcroForm control exists here.
    page.drawText(`Elec. ${formatCurrency(f4952.electedNetCapitalGain) || "0"}`, { x: 279, y: 518, size: 9, font });
  }
  page.drawText(f4952.sourceFactsVerified
    ? "REVIEW COPY: calculated from confirmed source records; filing qualification pending."
    : "REVIEW COPY: historical source facts unverified; gain and expense details require review.",
  { x: 36, y: 360, size: 9, font });
  await markReviewPdf(doc);
  return doc;
}
