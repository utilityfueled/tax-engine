/**
 * Form 6252 — Installment Sale Income
 * Spec: spec/federal/form-6252.yaml
 *
 * Implements IRC §453 installment method for property sales where at
 * least one payment is received after the tax year of the disposition.
 * Computes the gross profit percentage, installment sale income, and
 * the ordinary/capital gain split. Handles related party acceleration
 * under IRC §453(e).
 *
 * One Form 6252 is computed per installment sale. The caller aggregates
 * results for all sales and routes them to Schedule D or Form 4797.
 */

import Decimal from "decimal.js";
import type { Form6252Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, min, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);

export interface Form6252Result {
  // Part I: Gross Profit and Contract Price
  line5: Decimal;   // Selling price
  line6: Decimal;   // Assumed liabilities
  line7: Decimal;   // Payment portion (Line 5 - Line 6)
  line10: Decimal;  // Adjusted basis
  line11: Decimal;  // Selling expenses
  line12: Decimal;  // Depreciation recapture (§1245/§1250)
  line13: Decimal;  // Installment sale basis
  line14: Decimal;  // Gross gain before exclusion
  line15: Decimal;  // Section 121 exclusion
  line16: Decimal;  // Gross profit
  line17: Decimal;  // Excess liabilities over basis
  line18: Decimal;  // Contract price

  // Part II: Installment Sale Income
  line19: Decimal;  // Gross profit percentage
  line20: Decimal;  // Year-of-sale mortgage excess
  line21: Decimal;  // Payments received
  line22: Decimal;  // Total current-year payments
  line23: Decimal;  // Prior year payments
  line24: Decimal;  // Installment sale income
  line25: Decimal;  // Ordinary income (§1252/§1254/§1255 recapture)
  line26: Decimal;  // Capital gain / Section 1231 gain

  // Part III: Related Party (if applicable)
  line34: Decimal;  // Accelerated amount
  line35: Decimal;  // Accelerated installment income
  line36: Decimal;  // Accelerated ordinary income
  line37: Decimal;  // Accelerated capital gain

  // Routing helpers
  /** Gain character for Schedule D / Form 4797 routing */
  gainCharacter: Form6252Input["gainCharacter"];
  /** Remaining §§1252/1254/1255 recapture after this year (carries forward) */
  remainingOrdinaryRecapture: Decimal;

  // Combined totals flowing to downstream forms
  /** Total ordinary income this year (Line 25 + Line 36) */
  totalOrdinaryIncome: Decimal;
  /** Total capital/§1231 gain this year (Line 26 + Line 37) */
  totalCapitalGain: Decimal;

  lines: CalculatedLine[];
}

export function calculateForm6252(input: Form6252Input): Form6252Result {
  const audit = new AuditTrail();

  // ═══════════════════════════════════════════════════════════
  // Part I: Gross Profit and Contract Price
  // ═══════════════════════════════════════════════════════════

  // Line 5: Selling price
  const line5 = d(input.sellingPrice);
  audit.record("Form 6252", "5", "Selling price", line5,
    "Total consideration including mortgages and other debts");

  // Line 6: Assumed liabilities
  const line6 = d(input.assumedLiabilities);
  audit.record("Form 6252", "6", "Mortgages and debts buyer assumed", line6,
    "Pre-existing debts assumed by buyer");

  // Line 7: Payment portion
  const line7 = line5.minus(line6);
  audit.record("Form 6252", "7", "Payment portion of selling price", line7,
    "Line 5 - Line 6", { "Line 5": line5, "Line 6": line6 });

  // Line 8-9-10: Adjusted basis
  const costBasis = d(input.costBasis);
  const depreciation = d(input.depreciation);
  const line10 = costBasis.minus(depreciation);
  audit.record("Form 6252", "10", "Adjusted basis", line10,
    "Cost basis - depreciation", {
      "Line 8 (cost basis)": costBasis,
      "Line 9 (depreciation)": depreciation,
    });

  // Line 11: Selling expenses
  const line11 = d(input.sellingExpenses);
  audit.record("Form 6252", "11", "Commissions and other expenses of sale", line11,
    "Selling expenses");

  // Line 12: Depreciation recapture (§1245/§1250) — full recognition in year of sale
  const line12 = d(input.depreciationRecapture);
  audit.record("Form 6252", "12", "Income recapture from Form 4797 Part III", line12,
    "Section 1245/1250 ordinary income recapture recognized in year of sale");

  // Line 13: Installment sale basis
  const line13 = line10.plus(line11).plus(line12);
  audit.record("Form 6252", "13", "Installment sale basis", line13,
    "Line 10 + Line 11 + Line 12", {
      "Line 10": line10,
      "Line 11": line11,
      "Line 12": line12,
    });

  // Line 14: Gross gain before exclusion
  const line14 = line5.minus(line13);
  audit.record("Form 6252", "14", "Gross gain before exclusion", line14,
    "Line 5 - Line 13", { "Line 5": line5, "Line 13": line13 });

  // Line 15: Section 121 main home exclusion
  const line15 = min(d(input.section121Exclusion), zeroFloor(line14));
  audit.record("Form 6252", "15", "Section 121 main home exclusion", line15,
    "min(exclusion amount, gross gain)", {
      "Exclusion claimed": d(input.section121Exclusion),
      "Gross gain": line14,
    });

  // Line 16: Gross profit
  const line16 = zeroFloor(line14.minus(line15));
  audit.record("Form 6252", "16", "Gross profit", line16,
    "max(0, Line 14 - Line 15)", {
      "Line 14": line14,
      "Line 15": line15,
    });

  // Line 17: Excess of liabilities over installment sale basis
  const line17 = zeroFloor(line6.minus(line13));
  audit.record("Form 6252", "17", "Excess of liabilities over basis", line17,
    "max(0, Line 6 - Line 13)", {
      "Line 6": line6,
      "Line 13": line13,
    });

  // Line 18: Contract price
  const line18 = line7.plus(line17);
  audit.record("Form 6252", "18", "Contract price", line18,
    "Line 7 + Line 17", { "Line 7": line7, "Line 17": line17 });

  // ═══════════════════════════════════════════════════════════
  // Part II: Installment Sale Income
  // ═══════════════════════════════════════════════════════════

  // Line 19: Gross profit percentage
  const line19 = line18.isZero()
    ? ZERO
    : min(line16.dividedBy(line18), new Decimal(1));
  audit.record("Form 6252", "19", "Gross profit percentage", line19,
    line18.isZero()
      ? "Contract price is zero; no installment income"
      : `Line 16 / Line 18 = ${line16} / ${line18}`, {
      "Line 16 (gross profit)": line16,
      "Line 18 (contract price)": line18,
    });

  // Line 20: Year-of-sale mortgage excess (deemed payment)
  const line20 = input.isYearOfSale ? line17 : ZERO;
  audit.record("Form 6252", "20", "Deemed payment from excess liabilities", line20,
    input.isYearOfSale
      ? "Year of sale: Line 17 excess liabilities"
      : "Not year of sale: $0");

  // Line 21: Payments received during year
  const line21 = d(input.paymentsReceived);
  audit.record("Form 6252", "21", "Payments received during year", line21,
    "Cash and FMV of property received (excluding interest)");

  // Line 22: Total current-year payments
  const line22 = line20.plus(line21);
  audit.record("Form 6252", "22", "Total current-year payments", line22,
    "Line 20 + Line 21", { "Line 20": line20, "Line 21": line21 });

  // Line 23: Prior year payments
  const line23 = d(input.priorYearPayments);
  audit.record("Form 6252", "23", "Payments received in prior years", line23,
    "Cumulative prior-year payments");

  // Line 24: Installment sale income
  const line24 = zeroFloor(line22.times(line19)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  audit.record("Form 6252", "24", "Installment sale income", line24,
    "round(Line 22 × Line 19)", {
      "Line 22": line22,
      "Line 19 (gross profit %)": line19,
    });

  // Line 25: Ordinary income under §§1252/1254/1255 recapture
  const remainingRecaptureBefore = d(input.remainingOrdinaryRecapture);
  const line25 = min(remainingRecaptureBefore, line24);
  const remainingRecaptureAfter = remainingRecaptureBefore.minus(line25);
  audit.record("Form 6252", "25", "Ordinary income under recapture rules", line25,
    "min(remaining recapture, Line 24)", {
      "Remaining recapture entering year": remainingRecaptureBefore,
      "Line 24": line24,
      "Remaining recapture after this year": remainingRecaptureAfter,
    });

  // Line 26: Capital gain / Section 1231 gain
  const line26 = line24.minus(line25);
  audit.record("Form 6252", "26", "Capital gain or Section 1231 gain", line26,
    "Line 24 - Line 25", { "Line 24": line24, "Line 25": line25 });

  // ═══════════════════════════════════════════════════════════
  // Part III: Related Party Installment Sale Income
  // ═══════════════════════════════════════════════════════════

  let line34 = ZERO;
  let line35 = ZERO;
  let line36 = ZERO;
  let line37 = ZERO;

  const rp = input.relatedParty;
  if (rp && !rp.exceptionApplies) {
    // Line 30: Related party's selling price
    const line30 = d(rp.secondDispositionPrice);
    audit.record("Form 6252", "30", "Related party second disposition price", line30,
      "Amount realized by related party on second disposition");

    // Line 31: Contract price from year of first sale
    const line31 = line18;
    audit.record("Form 6252", "31", "Original contract price", line31,
      "Line 18 from year of first sale");

    // Line 32: Lesser of lines 30 and 31
    const line32 = min(line30, line31);
    audit.record("Form 6252", "32", "Lesser of related party price or contract price", line32,
      `min(Line 30, Line 31) = min(${line30}, ${line31})`);

    // Line 33: Total payments received by end of this year
    const line33 = line22.plus(line23);
    audit.record("Form 6252", "33", "Total payments received through this year", line33,
      "Line 22 + Line 23", { "Line 22": line22, "Line 23": line23 });

    // Line 34: Accelerated amount
    line34 = zeroFloor(line32.minus(line33));
    audit.record("Form 6252", "34", "Accelerated amount", line34,
      "max(0, Line 32 - Line 33)", { "Line 32": line32, "Line 33": line33 });

    // Line 35: Accelerated installment income
    line35 = zeroFloor(line34.times(line19)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    audit.record("Form 6252", "35", "Accelerated installment income", line35,
      "round(Line 34 × Line 19)", { "Line 34": line34, "Line 19": line19 });

    // Line 36: Ordinary income from accelerated amount
    const remainingRecaptureForAcceleration = remainingRecaptureAfter;
    line36 = min(remainingRecaptureForAcceleration, line35);
    audit.record("Form 6252", "36", "Ordinary income portion of accelerated amount", line36,
      "min(remaining recapture after Part II, Line 35)", {
        "Remaining recapture": remainingRecaptureForAcceleration,
        "Line 35": line35,
      });

    // Line 37: Capital gain portion
    line37 = line35.minus(line36);
    audit.record("Form 6252", "37", "Capital gain portion of accelerated amount", line37,
      "Line 35 - Line 36", { "Line 35": line35, "Line 36": line36 });
  }

  // ═══════════════════════════════════════════════════════════
  // Combined totals
  // ═══════════════════════════════════════════════════════════

  const totalOrdinaryIncome = line25.plus(line36);
  const totalCapitalGain = line26.plus(line37);
  const finalRemainingRecapture = remainingRecaptureAfter.minus(line36);

  audit.record("Form 6252", "total_ordinary", "Total ordinary income this year", totalOrdinaryIncome,
    "Line 25 + Line 36", { "Line 25": line25, "Line 36": line36 });
  audit.record("Form 6252", "total_capital", "Total capital/Section 1231 gain this year", totalCapitalGain,
    "Line 26 + Line 37", { "Line 26": line26, "Line 37": line37 });

  return {
    line5, line6, line7, line10, line11, line12, line13, line14, line15,
    line16, line17, line18,
    line19, line20, line21, line22, line23, line24, line25, line26,
    line34, line35, line36, line37,
    gainCharacter: input.gainCharacter,
    remainingOrdinaryRecapture: zeroFloor(finalRemainingRecapture),
    totalOrdinaryIncome,
    totalCapitalGain,
    lines: audit.getLines(),
  };
}

/**
 * Aggregate multiple Form 6252 results by gain character for Schedule D and Form 4797 routing.
 */
export interface Form6252AggregateResult {
  shortTermCapitalGain: Decimal;
  longTermCapitalGain: Decimal;
  section1231Gain: Decimal;
  totalOrdinaryIncome: Decimal;
  /** Year-of-sale depreciation recapture (§1245/§1250) — already recognized as ordinary income */
  totalDepreciationRecapture: Decimal;
  lines: CalculatedLine[];
}

export function aggregateForm6252Results(results: Form6252Result[]): Form6252AggregateResult {
  const audit = new AuditTrail();
  let shortTermCapitalGain = ZERO;
  let longTermCapitalGain = ZERO;
  let section1231Gain = ZERO;
  let totalOrdinaryIncome = ZERO;
  let totalDepreciationRecapture = ZERO;

  for (const r of results) {
    totalOrdinaryIncome = totalOrdinaryIncome.plus(r.totalOrdinaryIncome);
    totalDepreciationRecapture = totalDepreciationRecapture.plus(r.line12);

    switch (r.gainCharacter) {
      case "short_term_capital":
        shortTermCapitalGain = shortTermCapitalGain.plus(r.totalCapitalGain);
        break;
      case "long_term_capital":
        longTermCapitalGain = longTermCapitalGain.plus(r.totalCapitalGain);
        break;
      case "section_1231":
        section1231Gain = section1231Gain.plus(r.totalCapitalGain);
        break;
    }
  }

  audit.record("Form 6252", "agg_st", "Aggregate short-term capital gain from installment sales",
    shortTermCapitalGain, `${results.length} installment sale(s)`);
  audit.record("Form 6252", "agg_lt", "Aggregate long-term capital gain from installment sales",
    longTermCapitalGain, `${results.length} installment sale(s)`);
  audit.record("Form 6252", "agg_1231", "Aggregate Section 1231 gain from installment sales",
    section1231Gain, `${results.length} installment sale(s)`);
  audit.record("Form 6252", "agg_ordinary", "Aggregate ordinary income from installment sale recapture",
    totalOrdinaryIncome, `${results.length} installment sale(s)`);
  audit.record("Form 6252", "agg_recapture", "Aggregate year-of-sale depreciation recapture",
    totalDepreciationRecapture, `${results.length} installment sale(s)`);

  return {
    shortTermCapitalGain,
    longTermCapitalGain,
    section1231Gain,
    totalOrdinaryIncome,
    totalDepreciationRecapture,
    lines: audit.getLines(),
  };
}
