/**
 * Schedule D — Capital Gains and Losses
 * Spec: spec/federal/schedule-d.yaml
 *
 * Aggregates capital transactions from Form 8949, K-1s, 1099-DIVs,
 * and prior year carryforwards. Computes net gain/loss and capital
 * loss deduction (limited to $3,000 / $1,500 MFS).
 */

import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { d, sum, zeroFloor, max, min } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateForm8949 } from "../forms/form-8949.js";
import { calculateForm4797, type Form4797Result } from "../forms/form-4797.js";
import { calculateHomeSales, type HomeSaleAggregateResult } from "../forms/home-sale-exclusion.js";
import { calculateForm6781, type Form6781Result } from "../forms/form-6781.js";
import { calculateForm6252, aggregateForm6252Results, type Form6252AggregateResult } from "../forms/form-6252.js";

export interface ScheduleDResult {
  netShortTerm: Decimal; // Line 7
  section1202Exclusion: Decimal; // Separate Form8949 adjustment; not Line13 distributions
  netLongTerm: Decimal; // Line 15
  netCapitalGainLoss: Decimal; // Line 16
  capitalLossDeduction: Decimal; // Line 21 (capped loss or full gain)
  carryforwardShortTerm: Decimal;
  carryforwardLongTerm: Decimal;
  homeSales?: HomeSaleAggregateResult;
  lines: CalculatedLine[];
}

export interface ScheduleDExtraInput {
  form8824CapitalGainLoss?: Decimal;
  /** Canonical actual Form8814 line10 transfers, before capital-loss netting. */
  childCapitalGainDistributions?: Decimal;
}

export function calculateScheduleD(
  input: TaxYearInput,
  filingStatus: FilingStatus,
  constants: YearConstants,
  precomputedForm4797?: Form4797Result,
  extra?: ScheduleDExtraInput
): ScheduleDResult {
  const audit = new AuditTrail();
  const form8824CapitalGainLoss = extra?.form8824CapitalGainLoss ?? new Decimal(0);
  const childCapitalGainDistributions = extra?.childCapitalGainDistributions ?? new Decimal(0);
  if (!childCapitalGainDistributions.isFinite() || childCapitalGainDistributions.lt(0)) throw new Error("ScheduleD child distributions must be finite and nonnegative");

  // ── Form 8949: Transaction detail ─────────────────────
  const form8949 = calculateForm8949(input);
  audit.merge(form8949.lines);
  const form4797 = precomputedForm4797 ?? calculateForm4797(input);
  if (precomputedForm4797 === undefined) {
    audit.merge(form4797.lines);
  }

  // ── Form 6781: Section 1256 contracts and straddles ──────
  let form6781: Form6781Result | undefined;
  if (input.form6781) {
    form6781 = calculateForm6781(input.form6781);
    audit.merge(form6781.lines);
  }
  const form6781ShortTerm = form6781?.scheduleDShortTerm ?? new Decimal(0);
  const form6781LongTerm = form6781?.scheduleDLongTerm ?? new Decimal(0);

  // ── Form 6252: Installment Sale Income ────────────────
  let form6252Agg: Form6252AggregateResult | undefined;
  if ((input.form6252 ?? []).length > 0) {
    const form6252Results = input.form6252.map((s) => calculateForm6252(s));
    for (const r of form6252Results) {
      audit.merge(r.lines);
    }
    form6252Agg = aggregateForm6252Results(form6252Results);
    audit.merge(form6252Agg.lines);
  }
  const form6252ShortTerm = form6252Agg?.shortTermCapitalGain ?? new Decimal(0);
  const form6252LongTerm = form6252Agg?.longTermCapitalGain ?? new Decimal(0);

  // ── Short-term (Line 7) ────────────────────────────────
  const k1ShortTerm = input.scheduleK1.reduce(
    (acc, k) => acc.plus(d(k.netShortTermCapitalGain)),
    new Decimal(0)
  );
  // K-1 Form 1041 Box 3: short-term capital gain from estates/trusts
  const k1Form1041ShortTerm = (input.scheduleK1Form1041 ?? []).reduce(
    (acc, k) => acc.plus(d(k.netShortTermCapitalGain)),
    new Decimal(0)
  );
  // K-1 Form 1041 Box 11 Code C: final year short-term capital loss carryover
  const k1Form1041FinalSTLoss = (input.scheduleK1Form1041 ?? []).reduce(
    (acc, k) => k.isFinalK1 ? acc.plus(d(k.finalYearShortTermCapitalLoss)) : acc,
    new Decimal(0)
  );
  const priorShortTermLoss = d(input.priorYear?.shortTermCapitalLoss);
  const netShortTerm = sum(form8949.totalShortTermGainLoss, k1ShortTerm, k1Form1041ShortTerm, k1Form1041FinalSTLoss, priorShortTermLoss, form6781ShortTerm, form6252ShortTerm);
  audit.record("Sched D", "7", "Net short-term capital gain/loss", netShortTerm,
    "Form 8949 Part I + K-1 Box 8 + K-1 1041 Box 3 + K-1 1041 Box 11C + prior ST carryforward + Form 6781 short-term + Form 6252 short-term", {
      "Form 8949 Part I": form8949.totalShortTermGainLoss,
      "K-1 Box 8": k1ShortTerm,
      "K-1 1041 Box 3": k1Form1041ShortTerm,
      "K-1 1041 Box 11 Code C": k1Form1041FinalSTLoss,
      "Prior year ST carryforward": priorShortTermLoss,
      "Form 6781 short-term": form6781ShortTerm,
      "Form 6252 short-term": form6252ShortTerm,
    });

  // ── Separate Section 1202 QSBS adjustment ────────────
  // IRC §1202: 100% exclusion for qualified small business stock held 5+ years
  // 1099-DIV Box 2c reports the §1202 gain eligible for exclusion
  // Per-issuer cap: greater of $10M or 10× adjusted basis (we apply $10M cap here)
  const qbsGainFromDiv = input.form1099Div.reduce(
    (acc, f) => acc.plus(d(f.section1202Gain)),
    new Decimal(0)
  );
  const QSBS_CAP = filingStatus === "married_filing_separately"
    ? new Decimal(5000000)
    : new Decimal(10000000);
  const section1202Exclusion = min(qbsGainFromDiv, QSBS_CAP);
  audit.record("Sched D", "1202-adjustment", "Section 1202 exclusion (QSBS)", section1202Exclusion,
    `min(${qbsGainFromDiv} eligible gain, $${QSBS_CAP} cap)`, {
      "1099-DIV Box 2c eligible gain": qbsGainFromDiv,
      "Section 1202 cap": QSBS_CAP,
    });

  // ── Home Sale Exclusion (IRC §121) ────────────────────
  const homeSales = (input.homeSales ?? []).length > 0
    ? calculateHomeSales(input.homeSales, filingStatus, constants.homeSaleExclusion)
    : undefined;
  if (homeSales) {
    audit.merge(homeSales.lines);
  }
  const homeSaleTaxableGain = homeSales?.totalTaxableGain ?? new Decimal(0);

  // ── Long-term (Line 15) ────────────────────────────────
  const k1LongTerm = input.scheduleK1.reduce(
    (acc, k) => acc.plus(d(k.netLongTermCapitalGain)),
    new Decimal(0)
  );
  // K-1 Form 1041 Box 4a: long-term capital gain from estates/trusts
  const k1Form1041LongTerm = (input.scheduleK1Form1041 ?? []).reduce(
    (acc, k) => acc.plus(d(k.netLongTermCapitalGain)),
    new Decimal(0)
  );
  // K-1 Form 1041 Box 11 Code D: final year long-term capital loss carryover
  const k1Form1041FinalLTLoss = (input.scheduleK1Form1041 ?? []).reduce(
    (acc, k) => k.isFinalK1 ? acc.plus(d(k.finalYearLongTermCapitalLoss)) : acc,
    new Decimal(0)
  );
  const form4797LongTermGain = form4797.line9;
  const capGainDistributions = input.form1099Div.reduce(
    (acc, f) => acc.plus(d(f.totalCapitalGainDistributions)),
    new Decimal(0)
  );
  audit.record("Sched D", "13", "Capital gain distributions", capGainDistributions.plus(childCapitalGainDistributions),
    "Parent1099DIVBox2a + childForm8814Line10; exclusions are separate adjustments", {
      "1099-DIV Box 2a": capGainDistributions,
      "Form8814 Line10": childCapitalGainDistributions,
    });
  const priorLongTermLoss = d(input.priorYear?.longTermCapitalLoss);
  const netLongTerm = sum(
    form8949.totalLongTermGainLoss, k1LongTerm, k1Form1041LongTerm, k1Form1041FinalLTLoss,
    form4797LongTermGain, capGainDistributions, childCapitalGainDistributions,
    priorLongTermLoss, section1202Exclusion.negated(), homeSaleTaxableGain, form6781LongTerm, form6252LongTerm,
    form8824CapitalGainLoss
  );
  const longTermFormula = form8824CapitalGainLoss.isZero()
    ? "Form 8949 Part II + K-1 Box 9a + K-1 1041 Box 4a + K-1 1041 Box 11D + Form 4797 Line 9 + 1099-DIV Box 2a + prior LT carryforward - §1202 exclusion + home sale gain + Form 6781 long-term + Form 6252 long-term"
    : "Form 8949 Part II + K-1 Box 9a + K-1 1041 Box 4a + K-1 1041 Box 11D + Form 4797 Line 9 + 1099-DIV Box 2a + prior LT carryforward - §1202 exclusion + home sale gain + Form 6781 long-term + Form 6252 long-term + capital-route Form 8824 recognized gain/loss";
  audit.record("Sched D", "15", "Net long-term capital gain/loss", netLongTerm,
    childCapitalGainDistributions.gt(0) ? `${longTermFormula} + Form8814 line10 distributions` : longTermFormula, {
      "Form 8949 Part II": form8949.totalLongTermGainLoss,
      "K-1 Box 9a": k1LongTerm,
      "K-1 1041 Box 4a": k1Form1041LongTerm,
      "K-1 1041 Box 11 Code D": k1Form1041FinalLTLoss,
      "Form 4797 Line 9": form4797LongTermGain,
      "1099-DIV Box 2a": capGainDistributions,
      "Form8814 Line10": childCapitalGainDistributions,
      "Prior year LT carryforward": priorLongTermLoss,
      "Section 1202 exclusion": section1202Exclusion,
      "Home sale taxable gain (IRC §121)": homeSaleTaxableGain,
      "Form 6781 long-term": form6781LongTerm,
      "Form 6252 long-term": form6252LongTerm,
      "Form 8824 capital-route recognized gain/loss": form8824CapitalGainLoss,
    });

  // ── Line 16: Net capital gain or loss ──────────────────
  const netCapitalGainLoss = netShortTerm.plus(netLongTerm);
  audit.record("Sched D", "16", "Net capital gain or loss", netCapitalGainLoss,
    "Line 7 + Line 15", {
      "Line 7": netShortTerm,
      "Line 15": netLongTerm,
    });

  // ── Line 21: Capital loss deduction ────────────────────
  // MFS: limited to $1,500; others: $3,000
  const lossLimit = filingStatus === "married_filing_separately"
    ? new Decimal(1500)
    : constants.capitalLossLimit;

  let capitalLossDeduction: Decimal;
  if (netCapitalGainLoss.isNegative()) {
    capitalLossDeduction = max(netCapitalGainLoss, lossLimit.negated());
  } else {
    capitalLossDeduction = netCapitalGainLoss;
  }
  audit.record("Sched D", "21", "Capital loss deduction", capitalLossDeduction,
    `Net gain/loss capped at -$${lossLimit}`, {
      "Line 16": netCapitalGainLoss,
      "Annual loss limit": lossLimit,
    });

  // ── Carryforward calculation (IRS Capital Loss Carryover Worksheet) ──
  // Per IRS Schedule D Instructions: gains in one category offset losses
  // in the other category, then the deduction is allocated ST-first.
  let carryforwardShortTerm = new Decimal(0);
  let carryforwardLongTerm = new Decimal(0);

  if (netCapitalGainLoss.isNegative()) {
    const totalExcess = netCapitalGainLoss.abs().minus(capitalLossDeduction.abs());

    if (totalExcess.greaterThan(0)) {
      const stLoss = netShortTerm.isNegative() ? netShortTerm.abs() : new Decimal(0);
      const ltLoss = netLongTerm.isNegative() ? netLongTerm.abs() : new Decimal(0);
      const stGain = zeroFloor(netShortTerm);
      const ltGain = zeroFloor(netLongTerm);

      // Cross-net: reduce each category's loss by opposite-category gains
      const effectiveSTLoss = zeroFloor(stLoss.minus(ltGain));
      const effectiveLTLoss = zeroFloor(ltLoss.minus(stGain));

      // Allocate deduction: ST losses first, then LT
      const deduction = capitalLossDeduction.abs();
      const stDeducted = min(effectiveSTLoss, deduction);
      const ltDeducted = min(effectiveLTLoss, deduction.minus(stDeducted));

      const stCarry = effectiveSTLoss.minus(stDeducted);
      const ltCarry = effectiveLTLoss.minus(ltDeducted);
      carryforwardShortTerm = stCarry.isZero() ? new Decimal(0) : stCarry.negated();
      carryforwardLongTerm = ltCarry.isZero() ? new Decimal(0) : ltCarry.negated();
    }
  }

  audit.record(
    "Sched D",
    "carryforward-short-term",
    "Short-term capital loss carryforward",
    carryforwardShortTerm,
    "Remaining short-term loss after annual netting and Line 21 deduction", {
      "Net short-term capital gain/loss": netShortTerm,
      "Net capital gain or loss": netCapitalGainLoss,
      "Capital loss deduction": capitalLossDeduction,
    }
  );
  audit.record(
    "Sched D",
    "carryforward-long-term",
    "Long-term capital loss carryforward",
    carryforwardLongTerm,
    "Remaining long-term loss after annual netting and Line 21 deduction", {
      "Net long-term capital gain/loss": netLongTerm,
      "Net capital gain or loss": netCapitalGainLoss,
      "Capital loss deduction": capitalLossDeduction,
    }
  );

  return {
    netShortTerm,
    section1202Exclusion,
    netLongTerm,
    netCapitalGainLoss,
    capitalLossDeduction,
    carryforwardShortTerm,
    carryforwardLongTerm,
    homeSales,
    lines: audit.getLines(),
  };
}

/**
 * Recompute capital loss carryforward using the full IRS Capital Loss Carryover
 * Worksheet, which accounts for whether the deduction actually reduced tax.
 *
 * Per IRS Schedule D Instructions (Capital Loss Carryover Worksheet Lines 1-4):
 * When taxable income (before zero-floor) is negative, some or all of the
 * capital loss deduction provided no tax benefit. The "effective deduction"
 * is only the portion that actually reduced taxable income below zero.
 *
 * This must be called AFTER taxable income is computed in the federal pipeline.
 *
 * @param result - The ScheduleDResult from calculateScheduleD
 * @param rawTaxableIncome - AGI minus total deductions (BEFORE zero-floor)
 */
export function recomputeCarryforward(
  result: ScheduleDResult,
  rawTaxableIncome: Decimal
): { carryforwardShortTerm: Decimal; carryforwardLongTerm: Decimal } {
  const { netShortTerm, netLongTerm, netCapitalGainLoss, capitalLossDeduction } = result;

  if (!netCapitalGainLoss.isNegative()) {
    return { carryforwardShortTerm: new Decimal(0), carryforwardLongTerm: new Decimal(0) };
  }

  const deductionAbs = capitalLossDeduction.abs();
  const totalExcess = netCapitalGainLoss.abs().minus(deductionAbs);

  if (!totalExcess.greaterThan(0)) {
    return { carryforwardShortTerm: new Decimal(0), carryforwardLongTerm: new Decimal(0) };
  }

  // IRS Worksheet Lines 1-4: Compute the effective deduction
  // Line 1: rawTaxableIncome (can be negative)
  // Line 2: deductionAbs (capital loss deduction as positive)
  // Line 3: rawTaxableIncome + deductionAbs (taxable income before the loss deduction)
  // Line 4: min(deductionAbs, Line 3) if Line 3 > 0, else 0
  const line3 = rawTaxableIncome.plus(deductionAbs);
  const effectiveDeduction = line3.isPositive()
    ? min(deductionAbs, line3)
    : new Decimal(0);

  const stLoss = netShortTerm.isNegative() ? netShortTerm.abs() : new Decimal(0);
  const ltLoss = netLongTerm.isNegative() ? netLongTerm.abs() : new Decimal(0);
  const stGain = zeroFloor(netShortTerm);
  const ltGain = zeroFloor(netLongTerm);

  // ST carryforward (Lines 7-8):
  // Line 7 = effectiveDeduction + ltGain
  // Line 8 = max(0, stLoss(Line5) - Line 7)
  const stReduction = effectiveDeduction.plus(ltGain);
  const stCarryAbs = zeroFloor(stLoss.minus(stReduction));

  // How much of effectiveDeduction was used on ST losses (for Line 11)
  const effectiveDeductionUsedOnST = min(effectiveDeduction, zeroFloor(stLoss.minus(ltGain)));
  const effectiveDeductionNotUsedOnST = effectiveDeduction.minus(effectiveDeductionUsedOnST);

  // LT carryforward (Lines 9-13):
  // Line 12 = stGain + effectiveDeductionNotUsedOnST (Line 11)
  // Line 13 = max(0, ltLoss(Line9) - Line 12)
  const ltReduction = stGain.plus(effectiveDeductionNotUsedOnST);
  const ltCarryAbs = zeroFloor(ltLoss.minus(ltReduction));

  return {
    carryforwardShortTerm: stCarryAbs.isZero() ? new Decimal(0) : stCarryAbs.negated(),
    carryforwardLongTerm: ltCarryAbs.isZero() ? new Decimal(0) : ltCarryAbs.negated(),
  };
}
