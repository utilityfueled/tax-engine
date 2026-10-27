import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { charitableReviewOriginalSourceInput, type PreparedCharitableReview } from "../../charitable-review-context.js";
/**
 * PDF filler for IRS Form 8582 — Passive Activity Loss Limitations.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Fills Parts I–III (summary and computation lines) and
 * Parts IV/V (per-activity worksheets for rental and other passive).
 */

import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";
import { calculateScheduleE } from "@/engine/schedules/schedule-e.js";
import { calculateK1PassiveDistributionSources } from "@/engine/forms/k1-passive-distribution-sources.js";
import { calculateK1PassiveCapitalSources, type K1PassiveCapitalResult } from "@/engine/forms/k1-passive-capital-sources.js";
import { calculateForm8582, type Form8582ActivityRow, type Form8582Result, type PassiveActivity } from "@/engine/forms/form-8582.js";
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

type Allocation = Form8582Result["activityAllocations"][number];

function sameSource(expected: unknown, retained: unknown): boolean {
  if (Decimal.isDecimal(expected)) return Decimal.isDecimal(retained) && retained.isFinite() && expected.eq(retained);
  if (Array.isArray(expected)) return Array.isArray(retained) && expected.length === retained.length
    && expected.every((value, index) => sameSource(value, retained[index]));
  if (expected && typeof expected === "object") return !!retained && typeof retained === "object"
    && Object.entries(expected).every(([key, value]) => sameSource(value, (retained as Record<string, unknown>)[key]));
  return expected === retained;
}

/** Recalculate only to validate actual activity sources; render the retained audits. */
export function assertForm8582ReviewSource(input: TaxYearInput, result: TaxReturnResult, charitableReview?: PreparedCharitableReview): Form8582Result | undefined {
  return form8582ReviewSource(input, result, charitableReview)?.retained;
}
function form8582ReviewSource(input: TaxYearInput, result: TaxReturnResult, charitableReview?: PreparedCharitableReview) {
  const original = charitableReviewOriginalSourceInput(input, result, charitableReview);
  const retained = result.form8582;
  if (!retained) return undefined;
  if (!Decimal.isDecimal(retained.modifiedAgi) || !retained.modifiedAgi.isFinite()) throw new Error("Form8582 actual modified AGI source is missing");
  const schedule = calculateScheduleE(original);
  const capital = calculateK1PassiveCapitalSources(original, schedule);
  if (capital) {
    const expected = { ...capital.passive, modifiedAgi: retained.modifiedAgi };
    if (!sameSource(expected, retained)) throw new Error("Form8582 original capital activities, allocation and retained audit do not reconcile");
    return { retained, capital };
  }
  const distribution = calculateK1PassiveDistributionSources(original, schedule);
  const activities: PassiveActivity[] = schedule.partnerships.flatMap((row, k1Index) => row.isPassive ? [{
    name: row.name, reportingFormAndLine: "Schedule E, line 28",
    income: row.passiveIncome.plus(distribution.rows.find(source => source.k1Index === k1Index)?.gain ?? 0), loss: row.passiveLoss,
    isRentalRealEstate: row.isRentalRealEstate, isActiveParticipant: row.isRentalRealEstate,
    isPubliclyTradedPartnership: row.isPubliclyTradedPartnership,
    ptpFullyDisposedInTaxableTransaction: row.ptpFullyDisposedInTaxableTransaction,
    ptpDispositionGainOrLoss: row.ptpDispositionGainOrLoss,
  }] : []);
  for (const row of schedule.rentalProperties) activities.push({ name: row.description,
    reportingFormAndLine: "Schedule E, line 22", income: zeroFloor(row.netRentalIncome),
    loss: Decimal.min(0, row.netRentalIncome), isRentalRealEstate: true, isActiveParticipant: row.isActiveParticipant });
  const expected = calculateForm8582({ activities, agi: retained.modifiedAgi, filingStatus: input.taxpayer.filingStatus,
    mfsLivedApartFromSpouseAllYear: input.taxpayer.filingStatus === "married_filing_separately"
      && input.taxpayer.livedWithSpouseAtAnyTimeDuringYear === false,
    priorYearSuspendedLosses: input.priorYear?.suspendedPassiveLosses?.map(row => ({ name: row.partnershipName, amount: d(row.amount) })),
    priorYearPTPSuspendedLosses: input.priorYear?.suspendedPTPLosses?.map(row => ({ name: row.partnershipName, amount: d(row.amount) })),
  });
  if (!sameSource(expected, retained)) throw new Error("Form8582 source activities, allocation and retained audit do not reconcile");
  return { retained, capital };
}

/** Printed ratio precision only; retain exact core ratios and dollar allocations.
 * Largest remainders keep the displayed column total at the required 1.00.
 */
function printedRatios(rows: Allocation[], read: (row: Allocation) => Decimal): string[] {
  const units = new Decimal(1000000), exact = rows.map(row => read(row).times(units));
  const rounded = exact.map(value => value.floor());
  let remainder = units.minus(sum(...rounded));
  for (const { index } of exact.map((value, index) => ({ index, fraction: value.minus(rounded[index]) }))
    .sort((a, b) => b.fraction.comparedTo(a.fraction) || a.index - b.index)) {
    if (remainder.isZero()) break;
    rounded[index] = rounded[index].plus(1); remainder = remainder.minus(1);
  }
  if (!remainder.isZero()) throw new Error("Form8582 printed ratio audit does not reconcile");
  return rounded.map(value => value.div(units).toFixed(6));
}

async function appendSourceRows(doc: PDFDocument, result: Form8582Result, capital?: K1PassiveCapitalResult): Promise<void> {
  if (!result.activityRows.length) return;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page: PDFPage, y = 0;
  const newPage = () => {
    page = doc.addPage([612, 792]); y = 730;
    page.drawText("Form 8582 activity source and allocation continuation", { x: 42, y, size: 12, font }); y -= 24;
  };
  const line = (text: string) => {
    if (y < 50) newPage();
    page.drawText(text, { x: 42, y, size: 9, font }); y -= 14;
  };
  const wrapped = (text: string) => {
    let current = "";
    for (const word of text.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, 9) <= 528) { current = candidate; continue; }
      if (current) line(current);
      current = "";
      for (const character of word) {
        if (font.widthOfTextAtSize(current + character, 9) > 528) { line(current); current = ""; }
        current += character;
      }
    }
    if (current) line(current);
  };
  newPage();
  wrapped("All sources appear below. Rows beyond the five spaces are included in the printed form totals.");
  wrapped("Original source cents are retained. Each destination line is rounded only after aggregation. Displayed ratios are reconciled separately; no carry or tax character is changed to absorb a printed-dollar difference.");
  const specialRows = result.rentalAllowance.gt(0) ? result.activityAllocations.filter(row => row.isActiveRental && row.overallLoss.gt(0)) : [];
  const unallowedRows = result.suspendedLoss.gt(0) ? result.activityAllocations.filter(row => row.remainingLoss.gt(0)) : [];
  const specialRatios = specialRows.length ? printedRatios(specialRows, row => row.specialAllowanceRatio) : [];
  const unallowedRatios = unallowedRows.length ? printedRatios(unallowedRows, row => row.unallowedRatio) : [];
  for (const [index, row] of result.activityRows.entries()) {
    y -= 9;
    wrapped(`${index + 1}. ${row.name} | ${row.isActiveRental ? "Part IV" : "Part V"} | ${row.reportingFormAndLine ?? "Reporting form/line unknown: source review required"}`);
    wrapped(`Source income ${row.sourceCurrentIncome.toFixed()} | current loss ${row.sourceCurrentLoss.toFixed()} | prior unallowed loss ${row.sourcePriorYearSuspendedLoss.toFixed()}`);
    wrapped(`Form income ${row.currentIncome.toFixed()} | current loss ${row.currentLoss.toFixed()} | prior loss ${row.priorYearSuspendedLoss.toFixed()} | overall net ${row.overallNet.toFixed()}`);
    const allocation = result.activityAllocations.find(item => item.sourceIndex === row.sourceIndex && item.name === row.name);
    if (allocation) {
      wrapped(`Total loss ${allocation.totalLoss.abs().toFixed()} | special allowance ${allocation.specialAllowance.toFixed()} | unallowed ${allocation.suspendedLoss.toFixed()} | allowed ${allocation.allowedLoss.toFixed()}`);
      const specialIndex = specialRows.indexOf(allocation), unallowedIndex = unallowedRows.indexOf(allocation);
      if (specialIndex >= 0) wrapped(`Part VI: overall loss ${allocation.overallLoss.toFixed()} | ratio ${specialRatios[specialIndex]} | remaining loss ${allocation.remainingLoss.toFixed()}`);
      if (unallowedIndex >= 0) wrapped(`Part VII: remaining loss ${allocation.remainingLoss.toFixed()} | ratio ${unallowedRatios[unallowedIndex]}`);
    }
  }
  for (const row of capital?.rows.filter(item => item.hasCapitalSource || item.distributionGain) ?? []) {
    y -= 12;
    wrapped(`Form 8582 Part IX - original K1 activity ${row.k1Index + 1}`);
    wrapped("Part V retains separate reporting-form nets. Part IX retains each separately reportable ordinary and capital group. The allowed net amount on line 11 is not a substitution for these character deductions.");
    for (const group of row.byCharacter.groups) {
      const label = group.character === 'ordinary' ? 'Ordinary: Schedule E'
        : group.character === 'short_term_capital' ? 'Short-term capital: Schedule D Part I' : 'Long-term capital: Schedule D Part II';
      wrapped(label);
      wrapped(`Current deduction $${group.currentDeduction.toFixed()}; prior deduction $${group.priorDeduction.toFixed()}; Current income $${group.currentIncome.toFixed()}`);
      wrapped(`Net loss allocation weight $${group.netLoss.toFixed()}; unallowed deduction $${group.suspendedDeduction.toFixed()}`);
      wrapped(`Allowed deduction $${group.allowedDeduction.toFixed()}`);
    }
  }
  await markReviewPdf(doc);
}

export async function fillForm8582(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string, charitableReview?: PreparedCharitableReview): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const source = form8582ReviewSource(input, result, charitableReview), retained = source?.retained, capital = source?.capital;
  const doc = await loadReviewTemplate(blankPdfPath, 2025), form = doc.getForm();
  setTextField(form, FIELDS.name, input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`);
  setTextField(form, FIELDS.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));
  if (!retained || !retained.activityRows.length) return doc;
  const summaryIds = ["1a", "1b", "1c", "1d", "2a", "2b", "2c", "2d", "3", "4", "5", "6", "7", "8", "9", "10", "11"] as const;
  for (const id of summaryIds) {
    const audit = retained.lines.find(row => row.form === "Form 8582" && row.line === id);
    if (!audit) continue; // Official stop/skip branch, already validated above.
    const value = ["1b", "1c", "2b", "2c"].includes(id) ? audit.value.abs() : audit.value;
    // Applicable zeros are actual values; a skipped line is left blank.
    if (value.isZero()) setTextField(form, FIELDS[`line${id}`], "0");
    else setCurrencyField(form, FIELDS[`line${id}`], value);
  }
  const fillActivityRows = (fields: typeof FIELDS.part4 | typeof FIELDS.part5, rows: Form8582ActivityRow[]) => {
    const values = (row: Form8582ActivityRow) => ({ a: row.currentIncome, b: row.currentLoss.abs(),
      c: row.priorYearSuspendedLoss, d: zeroFloor(row.overallNet), e: zeroFloor(row.overallNet.negated()) });
    for (const [index, row] of rows.slice(0, 5).entries()) {
      setTextField(form, fields.rows[index].name, row.name);
      for (const [key, value] of Object.entries(values(row))) setCurrencyField(form, fields.rows[index][key as "a" | "b" | "c" | "d" | "e"], value);
    }
    if (rows.length) for (const key of ["a", "b", "c", "d", "e"] as const) setCurrencyField(form, fields.total[key], sum(...rows.map(row => values(row)[key])));
  };
  fillActivityRows(FIELDS.part4, retained.activityRows.filter(row => row.isActiveRental));
  fillActivityRows(FIELDS.part5, retained.activityRows.filter(row => !row.isActiveRental));
  if (retained.rentalAllowance.gt(0)) {
    const rows = retained.activityAllocations.filter(row => row.isActiveRental && row.overallLoss.gt(0));
    const ratios = printedRatios(rows, row => row.specialAllowanceRatio);
    for (const [index, row] of rows.slice(0, 5).entries()) {
      const fields = FIELDS.part6.rows[index];
      setTextField(form, fields.name, row.name); setTextField(form, fields.form, row.reportingFormAndLine ?? "");
      setCurrencyField(form, fields.a, row.overallLoss); setTextField(form, fields.b, ratios[index]);
      setCurrencyField(form, fields.c, row.specialAllowance); setCurrencyField(form, fields.d, row.remainingLoss);
    }
    setCurrencyField(form, FIELDS.part6.totalA, sum(...rows.map(row => row.overallLoss)));
    setCurrencyField(form, FIELDS.part6.totalC, sum(...rows.map(row => row.specialAllowance)));
    setCurrencyField(form, FIELDS.part6.totalD, sum(...rows.map(row => row.remainingLoss)));
  }
  if (retained.suspendedLoss.gt(0)) {
    const rows = retained.activityAllocations.filter(row => row.remainingLoss.gt(0));
    const ratios = printedRatios(rows, row => row.unallowedRatio);
    for (const [index, row] of rows.slice(0, 5).entries()) {
      const fields = FIELDS.part7.rows[index];
      setTextField(form, fields.name, row.name); setTextField(form, fields.form, row.reportingFormAndLine ?? "");
      setCurrencyField(form, fields.a, row.remainingLoss); setTextField(form, fields.b, ratios[index]); setCurrencyField(form, fields.c, row.suspendedLoss);
    }
    setCurrencyField(form, FIELDS.part7.totalA, sum(...rows.map(row => row.remainingLoss)));
    setCurrencyField(form, FIELDS.part7.totalC, sum(...rows.map(row => row.suspendedLoss)));
    const separateCharacters = new Set(capital?.rows.filter(row => row.hasCapitalSource || row.distributionGain).map(row => row.passiveIndex) ?? []);
    const singleFormRows = rows.filter(row => row.sourceIndex === undefined || !separateCharacters.has(row.sourceIndex));
    for (const [index, row] of singleFormRows.slice(0, 5).entries()) {
      const allowed = FIELDS.part8.rows[index];
      setTextField(form, allowed.name, row.name); setTextField(form, allowed.form, row.reportingFormAndLine ?? "");
      setCurrencyField(form, allowed.a, row.totalLoss.abs()); setCurrencyField(form, allowed.b, row.suspendedLoss); setCurrencyField(form, allowed.c, row.allowedLoss);
    }
    if (singleFormRows.length) {
      setCurrencyField(form, FIELDS.part8.totalA, sum(...singleFormRows.map(row => row.totalLoss.abs())));
      setCurrencyField(form, FIELDS.part8.totalB, sum(...singleFormRows.map(row => row.suspendedLoss)));
      setCurrencyField(form, FIELDS.part8.totalC, sum(...singleFormRows.map(row => row.allowedLoss)));
    }
  }
  await appendSourceRows(doc, retained, capital);
  return doc;
}
export { FIELDS as FORM_8582_FIELDS };
