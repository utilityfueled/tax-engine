import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8582 — Passive Activity Loss Limitations.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Fills Parts I–III (summary and computation lines) and
 * Parts IV/V (per-activity worksheets for rental and other passive).
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p1t4 = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].Table_Part4[0].${row}.${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;
const p2t5 = (row: string, n: string) =>
  `topmostSubform[0].Page2[0].Table_Part5[0].${row}.${n}`;
const p2t6 = (row: string, n: string) =>
  `topmostSubform[0].Page2[0].Table_Part6[0].${row}.${n}`;
const p2t7 = (row: string, n: string) =>
  `topmostSubform[0].Page2[0].Table_Part7[0].${row}.${n}`;
const p2t8 = (row: string, n: string) =>
  `topmostSubform[0].Page2[0].Table_PartVIII[0].${row}.${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 8582 fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_01[0]"),
  ssn: p1("f1_02[0]"),

  // ── Part I: 2025 Passive Activity Loss ──
  // Rental Real Estate Activities With Active Participation
  line1a: p1("f1_03[0]"), // Net income (from Part IV col a)
  line1b: p1("f1_04[0]"), // Net loss (from Part IV col b)
  line1c: p1("f1_05[0]"), // Prior years' unallowed losses (Part IV col c)
  line1d: p1("f1_06[0]"), // Combine lines 1a, 1b, and 1c

  // All Other Passive Activities
  line2a: p1("f1_07[0]"), // Net income (from Part V col a)
  line2b: p1("f1_08[0]"), // Net loss (from Part V col b)
  line2c: p1("f1_09[0]"), // Prior years' unallowed losses (Part V col c)
  line2d: p1("f1_10[0]"), // Combine lines 2a, 2b, and 2c

  line3: p1("f1_11[0]"),  // Combine lines 1d and 2d

  // ── Part II: Special Allowance for Rental RE With Active Participation ──
  line4: p1("f1_12[0]"),  // Smaller of loss on line 1d or line 3
  line5: p1("f1_13[0]"),  // $150,000 (or per instructions)
  line6: p1("f1_14[0]"),  // Modified AGI
  line7: p1("f1_15[0]"),  // Subtract line 6 from line 5
  line8: p1("f1_16[0]"),  // Line 7 × 50%
  line9: p1("f1_17[0]"),  // Smaller of line 4 or line 8 (rental allowance)

  // ── Part III: Total Losses Allowed ──
  line10: p1("f1_18[0]"), // Income on lines 1a and 2a
  line11: p1("f1_19[0]"), // Total allowed losses

  // ── Part IV: Rental RE activities worksheet (5 rows + total) ──
  // Columns: name, (a) net income, (b) net loss, (c) prior years, (d) gain, (e) loss
  part4: {
    rows: [
      {
        name: p1t4("Row1[0]", "f1_20[0]"),
        a: p1t4("Row1[0]", "f1_21[0]"),
        b: p1t4("Row1[0]", "f1_22[0]"),
        c: p1t4("Row1[0]", "f1_23[0]"),
        d: p1t4("Row1[0]", "f1_24[0]"),
        e: p1t4("Row1[0]", "f1_25[0]"),
      },
      {
        name: p1t4("Row2[0]", "f1_26[0]"),
        a: p1t4("Row2[0]", "f1_27[0]"),
        b: p1t4("Row2[0]", "f1_28[0]"),
        c: p1t4("Row2[0]", "f1_29[0]"),
        d: p1t4("Row2[0]", "f1_30[0]"),
        e: p1t4("Row2[0]", "f1_31[0]"),
      },
      {
        name: p1t4("Row3[0]", "f1_32[0]"),
        a: p1t4("Row3[0]", "f1_33[0]"),
        b: p1t4("Row3[0]", "f1_34[0]"),
        c: p1t4("Row3[0]", "f1_35[0]"),
        d: p1t4("Row3[0]", "f1_36[0]"),
        e: p1t4("Row3[0]", "f1_37[0]"),
      },
      {
        name: p1t4("Row4[0]", "f1_38[0]"),
        a: p1t4("Row4[0]", "f1_39[0]"),
        b: p1t4("Row4[0]", "f1_40[0]"),
        c: p1t4("Row4[0]", "f1_41[0]"),
        d: p1t4("Row4[0]", "f1_42[0]"),
        e: p1t4("Row4[0]", "f1_43[0]"),
      },
      {
        name: p1t4("Row5[0]", "f1_44[0]"),
        a: p1t4("Row5[0]", "f1_45[0]"),
        b: p1t4("Row5[0]", "f1_46[0]"),
        c: p1t4("Row5[0]", "f1_47[0]"),
        d: p1t4("Row5[0]", "f1_48[0]"),
        e: p1t4("Row5[0]", "f1_49[0]"),
      },
    ],
    total: {
      a: p1t4("Row6[0]", "f1_50[0]"),
      b: p1t4("Row6[0]", "f1_51[0]"),
      c: p1t4("Row6[0]", "f1_52[0]"),
      d: p1t4("Row6[0]", "f1_53[0]"),
      e: p1t4("Row6[0]", "f1_54[0]"),
    },
  },

  // ── Part V: Other passive activities worksheet (5 rows + total) ──
  part5: {
    rows: [
      {
        name: p2t5("Row1[0]", "f2_01[0]"),
        a: p2t5("Row1[0]", "f2_02[0]"),
        b: p2t5("Row1[0]", "f2_03[0]"),
        c: p2t5("Row1[0]", "f2_04[0]"),
        d: p2t5("Row1[0]", "f2_05[0]"),
        e: p2t5("Row1[0]", "f2_06[0]"),
      },
      {
        name: p2t5("Row2[0]", "f2_07[0]"),
        a: p2t5("Row2[0]", "f2_08[0]"),
        b: p2t5("Row2[0]", "f2_09[0]"),
        c: p2t5("Row2[0]", "f2_10[0]"),
        d: p2t5("Row2[0]", "f2_11[0]"),
        e: p2t5("Row2[0]", "f2_12[0]"),
      },
      {
        name: p2t5("Row3[0]", "f2_13[0]"),
        a: p2t5("Row3[0]", "f2_14[0]"),
        b: p2t5("Row3[0]", "f2_15[0]"),
        c: p2t5("Row3[0]", "f2_16[0]"),
        d: p2t5("Row3[0]", "f2_17[0]"),
        e: p2t5("Row3[0]", "f2_18[0]"),
      },
      {
        name: p2t5("Row4[0]", "f2_19[0]"),
        a: p2t5("Row4[0]", "f2_20[0]"),
        b: p2t5("Row4[0]", "f2_21[0]"),
        c: p2t5("Row4[0]", "f2_22[0]"),
        d: p2t5("Row4[0]", "f2_23[0]"),
        e: p2t5("Row4[0]", "f2_24[0]"),
      },
      {
        name: p2t5("Row5[0]", "f2_25[0]"),
        a: p2t5("Row5[0]", "f2_26[0]"),
        b: p2t5("Row5[0]", "f2_27[0]"),
        c: p2t5("Row5[0]", "f2_28[0]"),
        d: p2t5("Row5[0]", "f2_29[0]"),
        e: p2t5("Row5[0]", "f2_30[0]"),
      },
    ],
    total: {
      a: p2t5("Total[0]", "f2_31[0]"),
      b: p2t5("Total[0]", "f2_32[0]"),
      c: p2t5("Total[0]", "f2_33[0]"),
      d: p2t5("Total[0]", "f2_34[0]"),
      e: p2t5("Total[0]", "f2_35[0]"),
    },
  },

  // ── Part VI: Special allowance allocation (5 rows + total) ──
  // Columns: name, form/schedule, (a) loss, (b) ratio, (c) special allowance, (d) subtract c from a
  part6: {
    rows: [
      { name: p2t6("Row1[0]", "f2_36[0]"), form: p2t6("Row1[0]", "f2_37[0]"), a: p2t6("Row1[0]", "f2_38[0]"), b: p2t6("Row1[0]", "f2_39[0]"), c: p2t6("Row1[0]", "f2_40[0]"), d: p2t6("Row1[0]", "f2_41[0]") },
      { name: p2t6("Row2[0]", "f2_42[0]"), form: p2t6("Row2[0]", "f2_43[0]"), a: p2t6("Row2[0]", "f2_44[0]"), b: p2t6("Row2[0]", "f2_45[0]"), c: p2t6("Row2[0]", "f2_46[0]"), d: p2t6("Row2[0]", "f2_47[0]") },
      { name: p2t6("Row3[0]", "f2_48[0]"), form: p2t6("Row3[0]", "f2_49[0]"), a: p2t6("Row3[0]", "f2_50[0]"), b: p2t6("Row3[0]", "f2_51[0]"), c: p2t6("Row3[0]", "f2_52[0]"), d: p2t6("Row3[0]", "f2_53[0]") },
      { name: p2t6("Row4[0]", "f2_54[0]"), form: p2t6("Row4[0]", "f2_55[0]"), a: p2t6("Row4[0]", "f2_56[0]"), b: p2t6("Row4[0]", "f2_57[0]"), c: p2t6("Row4[0]", "f2_58[0]"), d: p2t6("Row4[0]", "f2_59[0]") },
      { name: p2t6("Row5[0]", "f2_60[0]"), form: p2t6("Row5[0]", "f2_61[0]"), a: p2t6("Row5[0]", "f2_62[0]"), b: p2t6("Row5[0]", "f2_63[0]"), c: p2t6("Row5[0]", "f2_64[0]"), d: p2t6("Row5[0]", "f2_65[0]") },
    ],
    totalA: p2("f2_66[0]"),
    totalC: p2("f2_68[0]"),
    totalD: p2("f2_69[0]"),
  },

  // ── Part VII: Allocation of unallowed losses (5 rows + total) ──
  // Columns: name, form/schedule, (a) loss, (b) ratio, (c) unallowed loss
  part7: {
    rows: [
      { name: p2t7("Row1[0]", "f2_70[0]"), form: p2t7("Row1[0]", "f2_71[0]"), a: p2t7("Row1[0]", "f2_72[0]"), b: p2t7("Row1[0]", "f2_73[0]"), c: p2t7("Row1[0]", "f2_74[0]") },
      { name: p2t7("Row2[0]", "f2_75[0]"), form: p2t7("Row2[0]", "f2_76[0]"), a: p2t7("Row2[0]", "f2_77[0]"), b: p2t7("Row2[0]", "f2_78[0]"), c: p2t7("Row2[0]", "f2_79[0]") },
      { name: p2t7("Row3[0]", "f2_80[0]"), form: p2t7("Row3[0]", "f2_81[0]"), a: p2t7("Row3[0]", "f2_82[0]"), b: p2t7("Row3[0]", "f2_83[0]"), c: p2t7("Row3[0]", "f2_84[0]") },
      { name: p2t7("Row4[0]", "f2_85[0]"), form: p2t7("Row4[0]", "f2_86[0]"), a: p2t7("Row4[0]", "f2_87[0]"), b: p2t7("Row4[0]", "f2_88[0]"), c: p2t7("Row4[0]", "f2_89[0]") },
      { name: p2t7("Row5[0]", "f2_90[0]"), form: p2t7("Row5[0]", "f2_91[0]"), a: p2t7("Row5[0]", "f2_92[0]"), b: p2t7("Row5[0]", "f2_93[0]"), c: p2t7("Row5[0]", "f2_94[0]") },
    ],
    totalA: p2("f2_95[0]"),
    totalC: p2("f2_97[0]"),
  },

  // ── Part VIII: Allowed losses (5 rows + total) ──
  // Columns: name, form/schedule, (a) loss, (b) unallowed loss, (c) allowed loss
  part8: {
    rows: [
      { name: p2t8("Row1[0]", "f2_98[0]"), form: p2t8("Row1[0]", "f2_99[0]"), a: p2t8("Row1[0]", "f2_100[0]"), b: p2t8("Row1[0]", "f2_101[0]"), c: p2t8("Row1[0]", "f2_102[0]") },
      { name: p2t8("Row2[0]", "f2_103[0]"), form: p2t8("Row2[0]", "f2_104[0]"), a: p2t8("Row2[0]", "f2_105[0]"), b: p2t8("Row2[0]", "f2_106[0]"), c: p2t8("Row2[0]", "f2_107[0]") },
      { name: p2t8("Row3[0]", "f2_108[0]"), form: p2t8("Row3[0]", "f2_109[0]"), a: p2t8("Row3[0]", "f2_110[0]"), b: p2t8("Row3[0]", "f2_111[0]"), c: p2t8("Row3[0]", "f2_112[0]") },
      { name: p2t8("Row4[0]", "f2_113[0]"), form: p2t8("Row4[0]", "f2_114[0]"), a: p2t8("Row4[0]", "f2_115[0]"), b: p2t8("Row4[0]", "f2_116[0]"), c: p2t8("Row4[0]", "f2_117[0]") },
      { name: p2t8("Row5[0]", "f2_118[0]"), form: p2t8("Row5[0]", "f2_119[0]"), a: p2t8("Row5[0]", "f2_120[0]"), b: p2t8("Row5[0]", "f2_121[0]"), c: p2t8("Row5[0]", "f2_122[0]") },
    ],
    totalA: p2("f2_123[0]"),
    totalB: p2("f2_124[0]"),
    totalC: p2("f2_125[0]"),
  },
} as const;

// ─── Constants ─────────────────────────────────────────────────────────────

const ZERO = new Decimal(0);

// Phase-out thresholds as shown on the IRS form (Line 5)
const STANDARD_THRESHOLD = new Decimal(150000);
const STANDARD_MAX_ALLOWANCE = new Decimal(25000);
const MFS_LIVED_APART_THRESHOLD = new Decimal(75000);
const MFS_LIVED_APART_MAX_ALLOWANCE = new Decimal(12500);
const PHASE_OUT_RATE = new Decimal("0.5");

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 8582 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm8582(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const f8582 = result.form8582;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f8582) return doc;

  // ── Part I: Passive Activity Loss ──

  // Lines 1a–1d: Rental real estate with active participation
  setCurrencyField(form, F.line1a, f8582.rentalIncome);
  setCurrencyField(form, F.line1b, f8582.rentalLoss);
  // Line 1c: prior year unallowed — not separately tracked in engine result, leave blank
  setCurrencyField(form, F.line1d, f8582.netRental);

  // Lines 2a–2d: All other passive activities
  setCurrencyField(form, F.line2a, f8582.passiveIncome);
  setCurrencyField(form, F.line2b, f8582.passiveLoss);
  // Line 2c: prior year unallowed — not separately tracked in engine result, leave blank
  setCurrencyField(form, F.line2d, f8582.netPassive);

  // Line 3: Combine 1d and 2d
  const line3 = f8582.netRental.plus(f8582.netPassive);
  setCurrencyField(form, F.line3, line3);

  // ── Part II: Special Allowance ──
  // Only fill if there's a net loss and rental losses exist
  if (line3.isNegative() && f8582.netRental.isNegative()) {
    const isMFS = result.filingStatus === "married_filing_separately";

    // Line 4: Smaller of loss on 1d or line 3 (as positive amount)
    const line4 = min(f8582.netRental.abs(), line3.abs());
    setCurrencyField(form, F.line4, line4);

    if (!isMFS || f8582.rentalAllowance.gt(0)) {
      // Standard filer or MFS who lived apart (has an allowance)
      const isMFSLivedApart = isMFS && f8582.rentalAllowance.gt(0);
      const threshold = isMFSLivedApart
        ? MFS_LIVED_APART_THRESHOLD
        : STANDARD_THRESHOLD;
      const maxAllowance = isMFSLivedApart
        ? MFS_LIVED_APART_MAX_ALLOWANCE
        : STANDARD_MAX_ALLOWANCE;

      // Line 5: Threshold
      setCurrencyField(form, F.line5, threshold);

      // Line 6: MAGI (use AGI)
      const magi = zeroFloor(result.agi);
      setCurrencyField(form, F.line6, magi);

      // Line 7: Subtract line 6 from line 5
      const line7 = zeroFloor(threshold.minus(magi));
      setCurrencyField(form, F.line7, line7);

      // Line 8: Line 7 × 50%, capped at max allowance
      const line8 = min(roundDollar(line7.times(PHASE_OUT_RATE)), maxAllowance);
      setCurrencyField(form, F.line8, line8);

      // Line 9: Smaller of line 4 or line 8 (= rental allowance)
      setCurrencyField(form, F.line9, f8582.rentalAllowance);
    }
    // If MFS who lived with spouse: Part II is skipped (line 9 = 0)
  }

  // ── Part III: Total Losses Allowed ──

  // Line 10: Add income on lines 1a and 2a
  const line10 = f8582.rentalIncome.plus(f8582.passiveIncome);
  setCurrencyField(form, F.line10, line10);

  // Line 11: Total allowed losses (lines 9 + 10)
  setCurrencyField(form, F.line11, f8582.allowedLoss);

  // ── Parts IV/V: Per-activity worksheets ──
  // Fill rental activities in Part IV, other passive in Part V
  // using the activity allocations from the engine result.
  fillActivityWorksheets(form, f8582, input);

  // ── Parts VII/VIII: Allocation of unallowed/allowed losses ──
  fillAllocationWorksheets(form, f8582);

  return doc;
}

/**
 * Fill Parts IV and V per-activity worksheets.
 * Part IV = rental RE with active participation.
 * Part V = all other passive activities.
 */
function fillActivityWorksheets(
  form: import("pdf-lib").PDFForm,
  f8582: NonNullable<TaxReturnResult["form8582"]>,
  input: TaxYearInput,
): void {
  // Build a set of rental property names for classification
  const rentalNames = new Set<string>();
  for (const rp of input.rentalProperties ?? []) {
    rentalNames.add(rp.description);
  }

  // Classify allocations into rental (Part IV) and other (Part V)
  const rentalActivities: typeof f8582.activityAllocations = [];
  const otherActivities: typeof f8582.activityAllocations = [];

  for (const alloc of f8582.activityAllocations) {
    if (rentalNames.has(alloc.name)) {
      rentalActivities.push(alloc);
    } else {
      otherActivities.push(alloc);
    }
  }

  const F = FIELDS;

  // Part IV: Rental activities (up to 5 rows)
  let totalP4a = ZERO;
  let totalP4b = ZERO;
  let totalP4d = ZERO;
  let totalP4e = ZERO;
  const rentalSlice = rentalActivities.slice(0, 5);
  for (let i = 0; i < rentalSlice.length; i++) {
    const alloc = rentalSlice[i];
    const row = F.part4.rows[i];
    setTextField(form, row.name, alloc.name);

    const overall = alloc.totalLoss; // negative
    if (overall.isNegative()) {
      const loss = overall.abs();
      setCurrencyField(form, row.b, overall); // negative
      totalP4b = totalP4b.plus(overall);
      // Column (e): overall loss
      setCurrencyField(form, row.e, overall);
      totalP4e = totalP4e.plus(loss);
    } else if (overall.isPositive()) {
      setCurrencyField(form, row.a, overall);
      totalP4a = totalP4a.plus(overall);
      setCurrencyField(form, row.d, overall);
      totalP4d = totalP4d.plus(overall);
    }
  }

  // Part IV totals
  if (!totalP4a.isZero()) setCurrencyField(form, F.part4.total.a, totalP4a);
  if (!totalP4b.isZero()) setCurrencyField(form, F.part4.total.b, totalP4b);
  if (!totalP4d.isZero()) setCurrencyField(form, F.part4.total.d, totalP4d);
  if (!totalP4e.isZero()) setCurrencyField(form, F.part4.total.e, f8582.netRental.isNegative() ? f8582.netRental : ZERO);

  // Part V: Other passive activities (up to 5 rows)
  let totalP5a = ZERO;
  let totalP5b = ZERO;
  let totalP5d = ZERO;
  let totalP5e = ZERO;
  const otherSlice = otherActivities.slice(0, 5);
  for (let i = 0; i < otherSlice.length; i++) {
    const alloc = otherSlice[i];
    const row = F.part5.rows[i];
    setTextField(form, row.name, alloc.name);

    const overall = alloc.totalLoss;
    if (overall.isNegative()) {
      setCurrencyField(form, row.b, overall);
      totalP5b = totalP5b.plus(overall);
      setCurrencyField(form, row.e, overall);
      totalP5e = totalP5e.plus(overall.abs());
    } else if (overall.isPositive()) {
      setCurrencyField(form, row.a, overall);
      totalP5a = totalP5a.plus(overall);
      setCurrencyField(form, row.d, overall);
      totalP5d = totalP5d.plus(overall);
    }
  }

  // Part V totals
  if (!totalP5a.isZero()) setCurrencyField(form, F.part5.total.a, totalP5a);
  if (!totalP5b.isZero()) setCurrencyField(form, F.part5.total.b, totalP5b);
  if (!totalP5d.isZero()) setCurrencyField(form, F.part5.total.d, totalP5d);
  if (!totalP5e.isZero()) setCurrencyField(form, F.part5.total.e, f8582.netPassive.isNegative() ? f8582.netPassive : ZERO);
}

/**
 * Fill Parts VII and VIII with per-activity allocation of
 * unallowed and allowed losses.
 */
function fillAllocationWorksheets(
  form: import("pdf-lib").PDFForm,
  f8582: NonNullable<TaxReturnResult["form8582"]>,
): void {
  const F = FIELDS;
  const allocations = f8582.activityAllocations;
  if (allocations.length === 0) return;

  // Total loss across all activities (for ratio computation)
  const totalLoss = allocations.reduce(
    (acc, a) => acc.plus(a.totalLoss.abs()),
    ZERO,
  );
  if (totalLoss.isZero()) return;

  // Part VII: Allocation of unallowed losses
  let totalP7a = ZERO;
  let totalP7c = ZERO;
  const lossAllocations = allocations.filter((a) => a.totalLoss.isNegative());
  const sliceP7 = lossAllocations.slice(0, 5);
  for (let i = 0; i < sliceP7.length; i++) {
    const alloc = sliceP7[i];
    const row = F.part7.rows[i];
    setTextField(form, row.name, alloc.name);
    setTextField(form, row.form, "Sch E");

    const loss = alloc.totalLoss.abs();
    setCurrencyField(form, row.a, loss);
    totalP7a = totalP7a.plus(loss);

    // Ratio: this activity's loss / total loss
    const ratio = totalLoss.isZero()
      ? ZERO
      : loss.dividedBy(totalLoss);
    setTextField(form, row.b, ratio.toDecimalPlaces(2).toFixed(2));

    setCurrencyField(form, row.c, alloc.suspendedLoss);
    totalP7c = totalP7c.plus(alloc.suspendedLoss);
  }
  if (!totalP7a.isZero()) setCurrencyField(form, F.part7.totalA, totalP7a);
  if (!totalP7c.isZero()) setCurrencyField(form, F.part7.totalC, totalP7c);

  // Part VIII: Allowed losses
  let totalP8a = ZERO;
  let totalP8b = ZERO;
  let totalP8c = ZERO;
  const sliceP8 = lossAllocations.slice(0, 5);
  for (let i = 0; i < sliceP8.length; i++) {
    const alloc = sliceP8[i];
    const row = F.part8.rows[i];
    setTextField(form, row.name, alloc.name);
    setTextField(form, row.form, "Sch E");

    const loss = alloc.totalLoss.abs();
    setCurrencyField(form, row.a, loss);
    totalP8a = totalP8a.plus(loss);

    setCurrencyField(form, row.b, alloc.suspendedLoss);
    totalP8b = totalP8b.plus(alloc.suspendedLoss);

    setCurrencyField(form, row.c, alloc.allowedLoss);
    totalP8c = totalP8c.plus(alloc.allowedLoss);
  }
  if (!totalP8a.isZero()) setCurrencyField(form, F.part8.totalA, totalP8a);
  if (!totalP8b.isZero()) setCurrencyField(form, F.part8.totalB, totalP8b);
  if (!totalP8c.isZero()) setCurrencyField(form, F.part8.totalC, totalP8c);
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_8582_FIELDS };
