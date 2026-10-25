/**
 * Schedule J — Income Averaging for Farmers and Fishermen
 * Spec: spec/federal/schedule-j.yaml
 *
 * IRC §1301 allows individuals engaged in a farming or fishing business to
 * elect to spread current-year farm/fishing income over the three prior base
 * years (2022, 2023, 2024 for a 2025 return). One-third of the elected farm
 * income is added to each base year's taxable income and tax is recomputed at
 * that year's rates and filing status. The result replaces Form 1040 Line 16.
 *
 * Income averaging does NOT apply to AMT — the engine exposes
 * `taxWithoutScheduleJ` so Form 6251 can use the regular tax.
 */

import Decimal from "decimal.js";
import type { FilingStatus, YearConstants, BaseYearTaxConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { getBaseYearConstants, TAX_CONSTANTS } from "@/models/constants.js";
import { calculateTaxFromBrackets, calculateRegularIncomeTax, calculateCapitalGainsTax } from "@/utils/tax-math.js";
import { d, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const THREE = new Decimal(3);

// ── Input Types ─────────────────────────────────────────────

export interface ScheduleJBaseYear {
  /** Taxable income for the base year (adjusted for prior Schedule J use if applicable).
   *  Can be negative if the base year was a loss year. */
  taxableIncome: string;
  /** Filing status used on the base year return */
  filingStatus: FilingStatus;
  /** Original tax from the base year return (Form 1040 Line 16, adjusted for prior Schedule J).
   *  Exclude Form 4972 and Form 8814 tax. */
  originalTax: string;
  /** Whether the base year return had qualified dividends or net capital gains.
   *  When true and the EFI does NOT include net capital gain, the QDCG-aware
   *  tax computation is used for the base year recomputation. */
  hadQualifiedDividendsOrCapitalGains?: boolean;
  /** Qualified dividends from the base year return (used for QDCG recomputation) */
  qualifiedDividends?: string;
  /** Net long-term capital gain from the base year return (used for QDCG recomputation) */
  netLongTermCapitalGain?: string;
}

export interface ScheduleJInput {
  /** Elected farm income — must not exceed taxableIncome. IRC §1301(b)(1) */
  electedFarmIncome: string;
  /** Net capital gain portion of elected farm income (Line 2b) */
  netCapitalGainFromFarming?: string;
  /** Unrecaptured §1250 gain portion of elected farm income (Line 2c) */
  unrecapturedSection1250GainFromFarming?: string;
  /** Base year 1 (3 years prior — 2022 for a 2025 return) */
  baseYear1: ScheduleJBaseYear;
  /** Base year 2 (2 years prior — 2023 for a 2025 return) */
  baseYear2: ScheduleJBaseYear;
  /** Base year 3 (1 year prior — 2024 for a 2025 return) */
  baseYear3: ScheduleJBaseYear;
}

// ── Output Types ─────────────────────────────────────────────

export interface ScheduleJResult {
  /** Line 1: current year taxable income */
  line1: Decimal;
  /** Line 2a: elected farm income */
  line2a: Decimal;
  /** Line 2b: net capital gain from EFI */
  line2b: Decimal;
  /** Line 2c: unrecaptured §1250 gain from EFI */
  line2c: Decimal;
  /** Line 3: non-farm taxable income */
  line3: Decimal;
  /** Line 4: tax on non-farm income at current year rates */
  line4: Decimal;
  /** Line 5: 2022 base year taxable income */
  line5: Decimal;
  /** Line 6: one-third of EFI allocated to 2022 */
  line6: Decimal;
  /** Line 7: 2022 income plus allocation */
  line7: Decimal;
  /** Line 8: tax at 2022 rates */
  line8: Decimal;
  /** Line 9: 2023 base year taxable income */
  line9: Decimal;
  /** Line 10: one-third of EFI allocated to 2023 */
  line10: Decimal;
  /** Line 11: 2023 income plus allocation */
  line11: Decimal;
  /** Line 12: tax at 2023 rates */
  line12: Decimal;
  /** Line 13: 2024 base year taxable income */
  line13: Decimal;
  /** Line 14: one-third of EFI allocated to 2024 */
  line14: Decimal;
  /** Line 15: 2024 income plus allocation */
  line15: Decimal;
  /** Line 16: tax at 2024 rates */
  line16: Decimal;
  /** Line 17/18: sum of Lines 4 + 8 + 12 + 16 */
  line17: Decimal;
  /** Line 19: 2022 original tax */
  line19: Decimal;
  /** Line 20: 2023 original tax */
  line20: Decimal;
  /** Line 21: 2024 original tax */
  line21: Decimal;
  /** Line 22: sum of base year original taxes */
  line22: Decimal;
  /** Line 23: averaged tax — replaces Form 1040 Line 16 */
  line23: Decimal;
  /** Whether income averaging produced a lower tax than the regular computation */
  isbeneficial: boolean;
  /** Audit trail lines */
  lines: CalculatedLine[];
}

/**
 * Compute Schedule J farm income averaging.
 *
 * @param input - Schedule J inputs including elected farm income and base year data
 * @param taxableIncome - Current year taxable income (Form 1040 Line 15)
 * @param regularTax - Current year regular tax WITHOUT Schedule J (Form 1040 Line 16)
 * @param filingStatus - Current year filing status
 * @param constants - Current year (2025) tax constants
 * @param currentYearQDCGOptions - If the current year has qualified dividends or LTCG,
 *   pass them so the non-farm portion tax (Line 4) can use preferential rates
 */
export function calculateScheduleJ(
  input: ScheduleJInput,
  taxableIncome: Decimal,
  regularTax: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants,
  currentYearQDCGOptions?: {
    qualifiedDividends: Decimal;
    netLongTermCapitalGain: Decimal;
    section1250Gain?: Decimal;
    collectiblesGain?: Decimal;
  }
): ScheduleJResult {
  const audit = new AuditTrail();

  // ── Part I: Taxable Income From Farming or Fishing ────────

  // Line 1: taxable income
  const line1 = roundDollar(taxableIncome);
  audit.record("Sch J", "1", "Taxable income", line1, "Form 1040 Line 15");

  // Line 2a: elected farm income, capped at taxable income
  const electedRaw = d(input.electedFarmIncome);
  const line2a = roundDollar(Decimal.min(electedRaw, line1));
  audit.record("Sch J", "2a", "Elected farm income", line2a,
    `min(${electedRaw}, taxable income ${line1})`);

  // Line 2b: net capital gain from farming
  const line2b = roundDollar(Decimal.min(
    d(input.netCapitalGainFromFarming),
    line2a
  ));
  audit.record("Sch J", "2b", "Net capital gain from EFI", line2b,
    `min(farming CG, EFI ${line2a})`);

  // Line 2c: unrecaptured §1250 gain from farming
  const line2c = roundDollar(Decimal.min(
    d(input.unrecapturedSection1250GainFromFarming),
    line2b
  ));
  audit.record("Sch J", "2c", "Unrecaptured §1250 gain from EFI", line2c,
    `min(farming §1250, Line 2b ${line2b})`);

  // Line 3: non-farm taxable income
  const line3 = roundDollar(line1.minus(line2a));
  audit.record("Sch J", "3", "Non-farm taxable income", line3,
    `${line1} - ${line2a}`);

  // One-third of elected farm income for allocation to each base year
  const oneThird = roundDollar(line2a.dividedBy(THREE));
  const oneThirdCapGain = roundDollar(line2b.dividedBy(THREE));
  const oneThirdSection1250 = roundDollar(line2c.dividedBy(THREE));

  // ── Line 4: Tax on non-farm income at 2025 rates ──────────
  let line4: Decimal;
  if (currentYearQDCGOptions) {
    // Reduce preferential amounts proportionally for the non-farm portion
    const farmRatio = line2a.isZero() ? ZERO : line2a.dividedBy(line1);
    const nonFarmQD = zeroFloor(currentYearQDCGOptions.qualifiedDividends.minus(
      currentYearQDCGOptions.qualifiedDividends.times(farmRatio)
    ));
    const nonFarmLTCG = zeroFloor(currentYearQDCGOptions.netLongTermCapitalGain.minus(
      currentYearQDCGOptions.netLongTermCapitalGain.times(farmRatio)
    ));
    const nonFarmS1250 = currentYearQDCGOptions.section1250Gain
      ? zeroFloor(currentYearQDCGOptions.section1250Gain.minus(
          currentYearQDCGOptions.section1250Gain.times(farmRatio)))
      : undefined;
    const nonFarmCollectibles = currentYearQDCGOptions.collectiblesGain
      ? zeroFloor(currentYearQDCGOptions.collectiblesGain.minus(
          currentYearQDCGOptions.collectiblesGain.times(farmRatio)))
      : undefined;

    const result = calculateCapitalGainsTax(
      line3, nonFarmQD, nonFarmLTCG, filingStatus, constants,
      { section1250Gain: nonFarmS1250, collectiblesGain: nonFarmCollectibles }
    );
    line4 = result.tax;
  } else {
    line4 = line3.greaterThan(0)
      ? calculateRegularIncomeTax(line3, filingStatus, constants)
      : ZERO;
  }
  audit.record("Sch J", "4", `Tax on non-farm income (${constants.taxYear} rates)`, line4,
    `Tax on Line 3 ($${line3}) at ${constants.taxYear} rates`);

  // ── Base year computations ─────────────────────────────────
  const baseYears = [
    { input: input.baseYear1, yearOffset: 3, linePrefix: { income: "5", alloc: "6", sum: "7", tax: "8" } },
    { input: input.baseYear2, yearOffset: 2, linePrefix: { income: "9", alloc: "10", sum: "11", tax: "12" } },
    { input: input.baseYear3, yearOffset: 1, linePrefix: { income: "13", alloc: "14", sum: "15", tax: "16" } },
  ];

  const baseYearResults: {
    income: Decimal; allocation: Decimal; combined: Decimal; tax: Decimal;
    originalTax: Decimal; year: number;
  }[] = [];

  for (const { input: byInput, yearOffset, linePrefix } of baseYears) {
    const year = constants.taxYear - yearOffset;
    const byConstants = year === 2025 ? TAX_CONSTANTS[2025] : getBaseYearConstants(year);
    const byFilingStatus = byInput.filingStatus;

    // Base year taxable income (can be negative)
    const income = roundDollar(d(byInput.taxableIncome));
    audit.record("Sch J", linePrefix.income,
      `${year} base year taxable income`, income, "Direct input (adjusted for prior Sch J)");

    // One-third allocation
    audit.record("Sch J", linePrefix.alloc,
      `One-third of EFI allocated to ${year}`, oneThird,
      `${line2a} / 3`);

    // Combined income
    const combined = roundDollar(income.plus(oneThird));
    // Line 7 (2022) is floored at zero; Lines 11/15 (2023/2024) can be negative
    const effectiveCombined = yearOffset === 3 ? zeroFloor(combined) : combined;
    audit.record("Sch J", linePrefix.sum,
      `${year} income with allocation`, effectiveCombined,
      `${income} + ${oneThird}${yearOffset === 3 ? " (floored at 0)" : ""}`);

    // Tax on combined income using base year rates
    let tax: Decimal;
    if (effectiveCombined.lessThanOrEqualTo(0)) {
      tax = ZERO;
    } else {
      tax = computeBaseYearTax(
        effectiveCombined, byInput, byConstants, byFilingStatus,
        line2b.greaterThan(0), oneThirdCapGain, oneThirdSection1250
      );
    }
    audit.record("Sch J", linePrefix.tax,
      `Tax at ${year} rates (${byFilingStatus})`, tax,
      `Tax on $${effectiveCombined} at ${year} ${byFilingStatus} rates`);

    // Original tax
    const originalTax = roundDollar(d(byInput.originalTax));

    baseYearResults.push({
      income, allocation: oneThird, combined: effectiveCombined,
      tax, originalTax, year,
    });
  }

  // ── Part III: Tax Computation ──────────────────────────────

  // Line 17/18: sum of Lines 4 + 8 + 12 + 16
  const line17 = roundDollar(
    line4
      .plus(baseYearResults[0].tax)
      .plus(baseYearResults[1].tax)
      .plus(baseYearResults[2].tax)
  );
  audit.record("Sch J", "17", "Sum of tax computations", line17,
    `${line4} + ${baseYearResults[0].tax} + ${baseYearResults[1].tax} + ${baseYearResults[2].tax}`);

  // Lines 19-21: original base year taxes
  const line19 = baseYearResults[0].originalTax;
  const line20 = baseYearResults[1].originalTax;
  const line21 = baseYearResults[2].originalTax;
  audit.record("Sch J", "19", `${constants.taxYear-3} original tax`, line19, `From ${constants.taxYear-3} return`);
  audit.record("Sch J", "20", `${constants.taxYear-2} original tax`, line20, `From ${constants.taxYear-2} return`);
  audit.record("Sch J", "21", `${constants.taxYear-1} original tax`, line21, `From ${constants.taxYear-1} return`);

  // Line 22: sum of original taxes
  const line22 = roundDollar(line19.plus(line20).plus(line21));
  audit.record("Sch J", "22", "Sum of base year original taxes", line22,
    `${line19} + ${line20} + ${line21}`);

  // Line 23: averaged tax
  const line23 = roundDollar(line17.minus(line22));
  const isBeneficial = line23.lessThan(regularTax);
  audit.record("Sch J", "23", "Averaged tax (replaces Form 1040 Line 16)", line23,
    `${line17} - ${line22}; ${isBeneficial ? "BENEFICIAL" : "NOT beneficial"} vs regular tax $${regularTax}`);

  return {
    line1,
    line2a,
    line2b,
    line2c,
    line3,
    line4,
    line5: baseYearResults[0].income,
    line6: oneThird,
    line7: baseYearResults[0].combined,
    line8: baseYearResults[0].tax,
    line9: baseYearResults[1].income,
    line10: oneThird,
    line11: baseYearResults[1].combined,
    line12: baseYearResults[1].tax,
    line13: baseYearResults[2].income,
    line14: oneThird,
    line15: baseYearResults[2].combined,
    line16: baseYearResults[2].tax,
    line17,
    line19,
    line20,
    line21,
    line22,
    line23,
    isbeneficial: isBeneficial,
    lines: audit.getLines(),
  };
}

/**
 * Compute tax for a base year with the allocated farm income added.
 * Uses QDCG-aware computation when the base year had qualified dividends
 * or capital gains AND the EFI does not include net capital gain, or when
 * the EFI includes net capital gain (allocating 1/3 to the base year).
 */
function computeBaseYearTax(
  combinedIncome: Decimal,
  byInput: ScheduleJBaseYear,
  byConstants: BaseYearTaxConstants,
  filingStatus: FilingStatus,
  efiHasCapitalGain: boolean,
  oneThirdCapGain: Decimal,
  oneThirdSection1250: Decimal
): Decimal {
  // If the base year had QD/CG or EFI has capital gain, use QDCG-aware rates
  if (byInput.hadQualifiedDividendsOrCapitalGains || efiHasCapitalGain) {
    const byQD = d(byInput.qualifiedDividends);
    const byLTCG = d(byInput.netLongTermCapitalGain);

    // When EFI has capital gain, add 1/3 to the base year's LTCG
    const totalLTCG = efiHasCapitalGain
      ? byLTCG.plus(oneThirdCapGain)
      : byLTCG;

    const totalSection1250 = efiHasCapitalGain
      ? oneThirdSection1250
      : ZERO;

    // If we have meaningful preferential income, use the QDCG approach
    if (byQD.greaterThan(0) || totalLTCG.greaterThan(0)) {
      // Build a minimal YearConstants-like object for calculateCapitalGainsTax
      const pseudoConstants = {
        taxYear: byConstants.taxYear,
        taxBrackets: byConstants.taxBrackets,
        capitalGainsRates: {
          ...byConstants.capitalGainsRates,
          twenty: {} as Record<string, never>,
        },
      } as YearConstants;

      const result = calculateCapitalGainsTax(
        combinedIncome, byQD, totalLTCG, filingStatus, pseudoConstants,
        { section1250Gain: totalSection1250, useTaxRateSchedules: true }
      );
      return result.tax;
    }
  }

  // Standard bracket computation
  return calculateTaxFromBrackets(combinedIncome, byConstants.taxBrackets[filingStatus]);
}
