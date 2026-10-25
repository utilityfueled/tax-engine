/**
 * Core tax math functions used across multiple forms and schedules.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "./audit.js";
import type { TaxBracket, FilingStatus, YearConstants } from "@/models/constants.js";
import { d, zeroFloor, min, roundDollar } from "./decimal.js";

/**
 * Calculate progressive tax from brackets.
 * Spec: Used by Form 1040 Line 16, Schedule D Tax Worksheet, QDCG Worksheet
 */
export function calculateTaxFromBrackets(
  taxableIncome: Decimal,
  brackets: TaxBracket[]
): Decimal {
  let tax = new Decimal(0);
  for (const bracket of brackets) {
    if (taxableIncome.lessThanOrEqualTo(bracket.min)) break;
    const upper = bracket.max ? min(taxableIncome, bracket.max) : taxableIncome;
    const taxableInBracket = upper.minus(bracket.min);
    tax = tax.plus(taxableInBracket.times(bracket.rate));
  }
  return roundDollar(tax);
}

type OrdinaryTaxConstants = Pick<YearConstants, "taxYear" | "taxBrackets">;
export type RegularIncomeTaxSource = "final-year-tax-table" | "statutory-rate-preview";

/** A published table and an indexed-rate preview have different source status. */
export function regularIncomeTaxSource(constants: OrdinaryTaxConstants): RegularIncomeTaxSource {
  if ([2022, 2023, 2024, 2025].includes(constants.taxYear)) return "final-year-tax-table";
  if (constants.taxYear === 2026) return "statutory-rate-preview";
  throw new Error(`Federal tax table is unavailable for year ${constants.taxYear}`);
}

/**
 * Form1040 line16 and ordinary-tax worksheet steps. Final2022–25 interval
 * arithmetic is checked against every independently extracted published cell.
 * 2026 remains a statutory-rate preview until its final table is available.
 * Spec: spec/federal/tax-table.yaml.
 */
export function calculateRegularIncomeTax(
  taxableIncome: Decimal,
  filingStatus: FilingStatus,
  constants: OrdinaryTaxConstants,
): Decimal {
  if (!taxableIncome.isFinite()) throw new Error("Taxable income must be finite");
  const source = regularIncomeTaxSource(constants);
  const income = roundDollar(zeroFloor(taxableIncome));
  const brackets = constants.taxBrackets[filingStatus];
  if (source === "statutory-rate-preview" || income.gte("100000")) {
    return calculateTaxFromBrackets(income, brackets);
  }
  let midpoint: Decimal;
  if (income.lt(5)) midpoint = d("2.5");
  else if (income.lt(15)) midpoint = d("10");
  else if (income.lt(25)) midpoint = d("20");
  else {
    const width = income.lt(3000) ? d("25") : d("50");
    midpoint = income.div(width).floor().times(width).plus(width.div(2));
  }
  return calculateTaxFromBrackets(midpoint, brackets);
}

/** Actual worksheet source amounts, after the ScheduleD gain/loss worksheets. */
export interface CapitalGainsTaxOptions {
  section1250Gain?: Decimal;
  collectiblesGain?: Decimal;
  /** Actual Form4952line4g, not that form's net investment income. */
  investmentIncomeElection?: Decimal;
  /** Actual Form4952line4e or the applicable smaller dotted-line amount. */
  electionCapitalGainAmount?: Decimal;
  /** Actual FEI worksheet capital gain excess, applied to post-election worksheet9 then6. */
  foreignCapitalGainExcess?: Decimal;
  /** ScheduleJ base years explicitly require rate schedules instead of tax tables. */
  useTaxRateSchedules?: boolean;
}
export interface CapitalGainsTaxResult {
  tax: Decimal;
  ordinaryTax: Decimal;
  preferentialTax: Decimal;
  method: "ordinary" | "qualified-dividends" | "schedule-d";
  regularTaxSource: RegularIncomeTaxSource;
  lines: CalculatedLine[];
}
type CapitalTaxConstants = Pick<YearConstants, "taxYear" | "taxBrackets" | "capitalGainsRates">;

/** Official QDCG1–25 or ScheduleD Tax Worksheet1–47; specs name every line. */
export function calculateCapitalGainsTax(
  taxableIncome: Decimal,
  qualifiedDividends: Decimal,
  netLongTermCapitalGain: Decimal,
  filingStatus: FilingStatus,
  constants: CapitalTaxConstants,
  options?: CapitalGainsTaxOptions,
): CapitalGainsTaxResult {
  for (const amount of [taxableIncome, qualifiedDividends, netLongTermCapitalGain, options?.section1250Gain, options?.collectiblesGain, options?.investmentIncomeElection, options?.electionCapitalGainAmount, options?.foreignCapitalGainExcess]) {
    if (amount !== undefined && !amount.isFinite()) throw new Error("Capital-gain worksheet amounts must be finite");
  }
  if (qualifiedDividends.lt(0) || [options?.section1250Gain, options?.collectiblesGain, options?.investmentIncomeElection, options?.electionCapitalGainAmount, options?.foreignCapitalGainExcess].some(value => value?.lt(0))) {
    throw new Error("Capital-gain worksheet dividend and special source amounts must be nonnegative");
  }
  const income = roundDollar(zeroFloor(taxableIncome));
  const qd = roundDollar(qualifiedDividends);
  const gain = roundDollar(zeroFloor(netLongTermCapitalGain));
  const s1250 = roundDollar(options?.section1250Gain ?? d("0"));
  const collectibles = roundDollar(options?.collectiblesGain ?? d("0"));
  const election = roundDollar(options?.investmentIncomeElection ?? d("0"));
  if (election.gt(0) && options?.electionCapitalGainAmount === undefined) {
    throw new Error("Actual Form4952 capital-gain election source is required");
  }
  const electionGain = roundDollar(options?.electionCapitalGainAmount ?? d("0"));
  const foreignExcess = roundDollar(options?.foreignCapitalGainExcess ?? d("0"));
  const gainAfterElection = zeroFloor(gain.minus(Decimal.min(election, electionGain)));
  const dividendsAfterElection = zeroFloor(qd.minus(zeroFloor(election.minus(electionGain))));
  if (foreignExcess.gt(gainAfterElection.plus(dividendsAfterElection))) throw new Error("Foreign capital gain excess exceeds post-election preferential income");
  const regularTaxSource = regularIncomeTaxSource(constants);
  const regular = (amount: Decimal) => options?.useTaxRateSchedules
    ? calculateTaxFromBrackets(amount, constants.taxBrackets[filingStatus])
    : calculateRegularIncomeTax(amount, filingStatus, constants);
  const allOrdinary = regular(income);
  if (income.isZero() || qd.plus(gain).isZero()) {
    return {tax: allOrdinary, ordinaryTax: allOrdinary, preferentialTax: d("0"), method: "ordinary", regularTaxSource, lines: []};
  }
  const special = (gain.gt(0) && s1250.plus(collectibles).gt(0)) || election.gt(0);
  const form = special ? "Sched D Tax WS" : "QDCG WS";
  const audit = new AuditTrail();
  const l: Record<number, Decimal> = {};
  const set = (number: number, amount: Decimal, formula: string): Decimal => {
    l[number] = amount;
    audit.record(form, String(number), `Official worksheet line${number}`, amount, formula);
    return amount;
  };
  const zeroThreshold = constants.capitalGainsRates.zero.threshold[filingStatus];
  const fifteenThreshold = constants.capitalGainsRates.fifteen.threshold[filingStatus];
  set(1, income, "Actual taxable income or FEI stacked income");
  set(2, special ? qd : zeroFloor(qd.minus(zeroFloor(foreignExcess.minus(gain)))), "Actual qualified dividends, with applicable QDCG foreign-excess adjustment");
  let ordinaryTax: Decimal;
  let computedTax: Decimal;
  let tax: Decimal;
  if (!special) {
    set(3, zeroFloor(gain.minus(foreignExcess)), "max(0,min(ScheduleD15,16)-foreignExcess)");
    set(4, l[2].plus(l[3]), "2+3");
    set(5, zeroFloor(l[1].minus(l[4])), "max(0,1-4)");
    set(6, zeroThreshold, "Actual year zero-rate threshold");
    set(7, min(l[1], l[6]), "min(1,6)");
    set(8, min(l[5], l[7]), "min(5,7)");
    set(9, l[7].minus(l[8]), "7-8");
    set(10, min(l[1], l[4]), "min(1,4)");
    set(11, l[9], "9");
    set(12, l[10].minus(l[11]), "10-11");
    set(13, fifteenThreshold, "Actual year fifteen-percent threshold");
    set(14, min(l[1], l[13]), "min(1,13)");
    set(15, l[5].plus(l[9]), "5+9");
    set(16, zeroFloor(l[14].minus(l[15])), "max(0,14-15)");
    set(17, min(l[12], l[16]), "min(12,16)");
    set(18, roundDollar(l[17].times("0.15")), "roundDollar(17*0.15)");
    set(19, l[9].plus(l[17]), "9+17");
    set(20, l[10].minus(l[19]), "10-19");
    set(21, roundDollar(l[20].times("0.20")), "roundDollar(20*0.20)");
    ordinaryTax = set(22, regular(l[5]), "Actual-year TaxTable/TaxComputationWorksheet on5");
    computedTax = set(23, l[18].plus(l[21]).plus(l[22]), "18+21+22");
    set(24, allOrdinary, "Actual-year TaxTable/TaxComputationWorksheet on1");
    tax = set(25, min(l[23], l[24]), "min(23,24)");
  } else {
    const bracket24 = constants.taxBrackets[filingStatus].find(bracket => bracket.rate.eq("0.24"));
    if (!bracket24?.max) throw new Error("Actual year24percent bracket ceiling is unavailable");
    set(3, election, "Actual Form4952line4g election");
    set(4, electionGain, "Actual Form4952line4e or smaller applicable amount");
    set(5, zeroFloor(l[3].minus(l[4])), "max(0,3-4)");
    set(6, zeroFloor(l[2].minus(l[5]).minus(zeroFloor(foreignExcess.minus(gainAfterElection)))), "max(0,2-5-unusedForeignExcessAfterLine9)");
    set(7, gain, "max(0,min(ScheduleD15,16))");
    set(8, min(l[3], l[4]), "min(3,4)");
    set(9, zeroFloor(l[7].minus(l[8]).minus(foreignExcess)), "max(0,7-8-foreignExcess)");
    set(10, l[6].plus(l[9]), "6+9");
    set(11, s1250.plus(collectibles), "Actual ScheduleD18+19");
    set(12, min(l[9], l[11]), "min(9,11)");
    set(13, l[10].minus(l[12]), "10-12");
    set(14, zeroFloor(l[1].minus(l[13])), "max(0,1-13)");
    set(15, zeroThreshold, "Actual year zero-rate threshold");
    set(16, min(l[1], l[15]), "min(1,15)");
    set(17, min(l[14], l[16]), "min(14,16)");
    set(18, zeroFloor(l[1].minus(l[10])), "max(0,1-10)");
    set(19, min(l[1], bracket24.max), "min(1,actual24percent bracket ceiling)");
    set(20, min(l[14], l[19]), "min(14,19)");
    set(21, Decimal.max(l[18], l[20]), "max(18,20)");
    set(22, l[16].minus(l[17]), "16-17");
    // Skipped physical fields contribute zero to the later totals.
    const skip23 = l[1].eq(l[16]);
    set(23, skip23 ? d("0") : min(l[1], l[13]), "min(1,13), or skipped");
    set(24, skip23 ? d("0") : l[22], "22, or skipped");
    set(25, skip23 ? d("0") : zeroFloor(l[23].minus(l[24])), "max(0,23-24), or skipped");
    set(26, skip23 ? d("0") : fifteenThreshold, "Actual year fifteen-percent threshold, or skipped");
    set(27, skip23 ? d("0") : min(l[1], l[26]), "min(1,26), or skipped");
    set(28, skip23 ? d("0") : l[21].plus(l[22]), "21+22, or skipped");
    set(29, skip23 ? d("0") : zeroFloor(l[27].minus(l[28])), "max(0,27-28), or skipped");
    set(30, skip23 ? d("0") : min(l[25], l[29]), "min(25,29), or skipped");
    set(31, roundDollar(l[30].times("0.15")), "roundDollar(30*0.15)");
    set(32, skip23 ? d("0") : l[24].plus(l[30]), "24+30, or skipped");
    const skip33 = skip23 || l[1].eq(l[32]);
    set(33, skip33 ? d("0") : l[23].minus(l[32]), "23-32, or skipped");
    set(34, roundDollar(l[33].times("0.20")), "roundDollar(33*0.20)");
    const skip35 = skip33 || s1250.isZero();
    set(35, skip35 ? d("0") : min(l[9], s1250), "min(9,ScheduleD19), or skipped");
    set(36, skip35 ? d("0") : l[10].plus(l[21]), "10+21, or skipped");
    set(37, skip35 ? d("0") : l[1], "1, or skipped");
    set(38, skip35 ? d("0") : zeroFloor(l[36].minus(l[37])), "max(0,36-37), or skipped");
    set(39, skip35 ? d("0") : zeroFloor(l[35].minus(l[38])), "max(0,35-38), or skipped");
    set(40, roundDollar(l[39].times("0.25")), "roundDollar(39*0.25)");
    const skip41 = skip33 || collectibles.isZero();
    set(41, skip41 ? d("0") : l[21].plus(l[22]).plus(l[30]).plus(l[33]).plus(l[39]), "21+22+30+33+39, or skipped");
    set(42, skip41 ? d("0") : l[1].minus(l[41]), "1-41, or skipped");
    set(43, roundDollar(l[42].times("0.28")), "roundDollar(42*0.28)");
    ordinaryTax = set(44, regular(l[21]), "Actual-year TaxTable/TaxComputationWorksheet on21");
    computedTax = set(45, l[31].plus(l[34]).plus(l[40]).plus(l[43]).plus(l[44]), "31+34+40+43+44");
    set(46, allOrdinary, "Actual-year TaxTable/TaxComputationWorksheet on1");
    tax = set(47, min(l[45], l[46]), "min(45,46)");
  }
  if (allOrdinary.lt(computedTax)) ordinaryTax = allOrdinary;
  return {tax, ordinaryTax, preferentialTax: tax.minus(ordinaryTax), method: special ? "schedule-d" : "qualified-dividends", regularTaxSource, lines: audit.getLines()};
}

/**
 * Calculate self-employment tax (Schedule SE).
 * Spec: Schedule SE Lines 4-12
 */
export function calculateSelfEmploymentTax(
  netSEEarnings: Decimal,
  w2SocialSecurityWages: Decimal,
  constants: YearConstants
): { tax: Decimal; deductibleHalf: Decimal; socialSecurityPortion: Decimal; medicarePortion: Decimal } {
  const se = constants.selfEmploymentTax;
  const taxableEarnings = roundDollar(netSEEarnings.times(se.earningsMultiplier));

  // IRC §1402(b)(2): SE tax only applies when post-multiplier earnings ≥ $400
  if (taxableEarnings.lt(new Decimal(400))) {
    return {
      tax: new Decimal(0),
      deductibleHalf: new Decimal(0),
      socialSecurityPortion: new Decimal(0),
      medicarePortion: new Decimal(0),
    };
  }

  // Social Security portion (capped at wage base minus W-2 wages)
  const ssRemaining = zeroFloor(se.socialSecurityWageBase.minus(w2SocialSecurityWages));
  const ssTaxable = min(taxableEarnings, ssRemaining);
  const socialSecurityPortion = roundDollar(ssTaxable.times(se.socialSecurityRate));

  // Medicare portion (no cap)
  const medicarePortion = roundDollar(taxableEarnings.times(se.medicareRate));

  const tax = socialSecurityPortion.plus(medicarePortion);
  const deductibleHalf = roundDollar(tax.times(se.deductiblePortion));

  return { tax, deductibleHalf, socialSecurityPortion, medicarePortion };
}

/**
 * Calculate Net Investment Income Tax (Form 8960).
 * Spec: Form 8960 Lines 1-17
 */
export function calculateNIIT(
  investmentIncome: Decimal,
  magi: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants
): Decimal {
  const threshold = constants.niit.threshold[filingStatus];
  const excess = zeroFloor(magi.minus(threshold));
  if (excess.isZero()) return new Decimal(0);
  const taxableBase = min(investmentIncome, excess);
  return roundDollar(taxableBase.times(constants.niit.rate));
}

/**
 * Calculate Additional Medicare Tax (Form 8959).
 * Spec: Form 8959 Lines 1-18
 */
export function calculateAdditionalMedicareTax(
  totalMedicareWages: Decimal,
  selfEmploymentEarnings: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants
): Decimal {
  const threshold = constants.additionalMedicareTax.threshold[filingStatus];
  const totalEarnings = totalMedicareWages.plus(selfEmploymentEarnings);
  const excess = zeroFloor(totalEarnings.minus(threshold));
  return roundDollar(excess.times(constants.additionalMedicareTax.rate));
}

/**
 * Calculate Child Tax Credit.
 * Spec: CTC Worksheet in Form 1040 Instructions
 */
export interface ChildTaxCreditResult {
  ctc: Decimal;         // Child Tax Credit (qualifying children under 17)
  odc: Decimal;         // Other Dependent Credit ($500/dependent)
  total: Decimal;       // Combined CTC + ODC after phase-out
}

export function calculateChildTaxCredit(
  qualifyingChildren: number,
  otherDependents: number,
  agi: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants
): ChildTaxCreditResult {
  const ctc = constants.childTaxCredit;
  const maxCTC = ctc.perChild.times(qualifyingChildren);
  const maxODC = ctc.otherDependentCredit.times(otherDependents);
  const maxTotal = maxCTC.plus(maxODC);
  if (maxTotal.isZero()) return { ctc: new Decimal(0), odc: new Decimal(0), total: new Decimal(0) };

  const threshold = ctc.phaseOutThreshold[filingStatus];
  const excess = zeroFloor(agi.minus(threshold));
  // Round up to next $1000
  const thousandsOver = excess.dividedBy(1000).ceil();
  const reduction = thousandsOver.times(ctc.phaseOutRate);

  const totalCredit = zeroFloor(maxTotal.minus(reduction));
  // Phase-out reduces CTC first, then ODC
  const ctcAfterPhaseout = zeroFloor(maxCTC.minus(reduction));
  const remainingReduction = zeroFloor(reduction.minus(maxCTC));
  const odcAfterPhaseout = zeroFloor(maxODC.minus(remainingReduction));

  return {
    ctc: ctcAfterPhaseout,
    odc: odcAfterPhaseout,
    total: totalCredit,
  };
}

/**
 * Calculate deductible mortgage interest (limited by debt cap).
 * Spec: Schedule A Line 8a, Pub 936
 *
 * Pre-12/16/2017 acquisition debt: $1,000,000 limit ($500,000 MFS)
 * Post-12/15/2017 acquisition debt: $750,000 limit ($375,000 MFS) — IRC §163(h)(3)(B)(ii)
 */
const GRANDFATHERED_DEBT_LIMIT = new Decimal(1000000);
const TCJA_CUTOFF = "2017-12-16";

export function calculateDeductibleMortgageInterest(
  interestPaid: Decimal,
  outstandingPrincipal: Decimal,
  constants: YearConstants,
  originationDate?: string,
  filingStatus?: FilingStatus
): Decimal {
  // Single-loan compatibility helper. Actual multi-loan sources use Pub936 Table1.
  if (originationDate !== undefined && originationDate <= "1987-10-13") return interestPaid;
  const isGrandfathered = originationDate !== undefined && originationDate < TCJA_CUTOFF;
  const baseLimit = isGrandfathered ? GRANDFATHERED_DEBT_LIMIT : constants.mortgageInterest.debtLimit;
  // MFS filers get half the debt limit per IRC §163(h)(3)(B)(ii)
  const limit = filingStatus === "married_filing_separately" ? baseLimit.dividedBy(2) : baseLimit;
  if (outstandingPrincipal.lessThanOrEqualTo(limit)) return interestPaid;
  const ratio = limit.dividedBy(outstandingPrincipal).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  return roundDollar(interestPaid.times(ratio));
}

/**
 * Spec: spec/federal/schedule-a.yaml line 5e, 2025 worksheet lines 5-10.
 * MFS halves line 9 AFTER the phase-down and minimum cap are applied.
 */
export function calculateSALTLimit(
  magi: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants,
): Decimal {
  const divisor = filingStatus === "married_filing_separately" ? 2 : 1;
  const threshold = constants.saltPhaseDown.magiThreshold.dividedBy(divisor);
  const reduction = roundDollar(zeroFloor(magi.minus(threshold)).times(constants.saltPhaseDown.rate));
  return Decimal.max(constants.saltPhaseDown.minimumCap, constants.saltCap.minus(reduction)).dividedBy(divisor);
}

export function calculateSALTDeduction(
  stateLocalTaxes: Decimal,
  propertyTaxes: Decimal,
  constants: YearConstants,
  magi: Decimal,
  filingStatus: FilingStatus,
): Decimal {
  const total = stateLocalTaxes.plus(propertyTaxes);
  return roundDollar(min(zeroFloor(total), calculateSALTLimit(magi, filingStatus, constants)));
}
