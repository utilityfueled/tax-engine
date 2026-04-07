/**
 * Illinois Schedule NR — Nonresident and Part-Year Resident Computation
 * Spec: spec/state/il-schedule-nr.yaml
 *
 * Determines the portion of a nonresident or part-year resident's income
 * that is taxable by Illinois using a two-column approach:
 *   Column A — Federal amounts (total income from all sources)
 *   Column B — Illinois amounts (IL-source or while IL resident)
 *
 * Key output: allocation decimal (Line 48) = IL base income / total base income.
 * This decimal allocates exemptions, EITC, and Child Tax Credit.
 */

import Decimal from "decimal.js";
import { sum, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const TAX_RATE = new Decimal("0.0495");

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type ResidencyType = "nonresident" | "part_year";

/**
 * Dual-column income entry: Column A (federal) and Column B (IL-source).
 * Column A is typically auto-populated from the federal return.
 * Column B is provided by the filer (IL wages from W-2, IL business income, etc.).
 */
export interface DualColumnAmount {
  columnA: Decimal;
  columnB: Decimal;
}

/**
 * Income categories on Schedule NR (Lines 5-19).
 * Each entry has a federal total (Column A) and an IL-source amount (Column B).
 */
export interface ScheduleNRIncomeLines {
  /** Line 5: Wages, salaries, tips */
  wages: DualColumnAmount;
  /** Line 6: Taxable interest */
  interest: DualColumnAmount;
  /** Line 7: Ordinary dividends */
  dividends: DualColumnAmount;
  /** Line 8: Taxable refunds, credits, or offsets */
  taxableRefunds: DualColumnAmount;
  /** Line 9: Alimony received (nonresidents = $0 in Column B) */
  alimony: DualColumnAmount;
  /** Line 10: Business income or loss */
  businessIncome: DualColumnAmount;
  /** Line 11: Capital gain or loss */
  capitalGains: DualColumnAmount;
  /** Line 12: Other gains or losses (Form 4797) */
  otherGains: DualColumnAmount;
  /** Line 13: Taxable IRA distributions (nonresidents = $0) */
  iraDistributions: DualColumnAmount;
  /** Line 14: Taxable pensions and annuities (nonresidents = $0) */
  pensions: DualColumnAmount;
  /** Line 15: Rental real estate, royalties, partnerships, S corps, trusts */
  rentalAndPartnership: DualColumnAmount;
  /** Line 16: Farm income or loss */
  farmIncome: DualColumnAmount;
  /** Line 17: Unemployment compensation */
  unemployment: DualColumnAmount;
  /** Line 18: Taxable Social Security (nonresidents = $0) */
  socialSecurity: DualColumnAmount;
  /** Line 19: Other income (lottery, gambling, NOL, etc.) */
  otherIncome: DualColumnAmount;
}

/**
 * Adjustment categories on Schedule NR (Lines 22-35).
 * Items not listed individually are combined into 'otherAdjustments'.
 */
export interface ScheduleNRAdjustmentLines {
  /** Line 22: Educator expenses */
  educatorExpenses: DualColumnAmount;
  /** Line 23: Certain business expenses (reservists, performers) */
  certainBusinessExpenses: DualColumnAmount;
  /** Line 24: Health savings account deduction (Column B = Column A) */
  hsaDeduction: DualColumnAmount;
  /** Line 25: Moving expenses for Armed Forces */
  movingExpenses: DualColumnAmount;
  /** Line 26: Deductible part of self-employment tax (computed via ISE decimal) */
  seTaxDeduction: DualColumnAmount;
  /** Line 27: Self-employed SEP, SIMPLE, qualified plans (computed via ISE decimal) */
  sepSimpleDeduction: DualColumnAmount;
  /** Line 28: Self-employed health insurance (computed via ISE decimal) */
  seHealthInsurance: DualColumnAmount;
  /** Line 29: Penalty on early withdrawal of savings */
  earlyWithdrawalPenalty: DualColumnAmount;
  /** Line 30: Alimony paid (Column B = Column A) */
  alimonyPaid: DualColumnAmount;
  /** Line 31: IRA deduction */
  iraDeduction: DualColumnAmount;
  /** Line 32: Student loan interest (Column B = Column A) */
  studentLoanInterest: DualColumnAmount;
  /** Line 34: Archer MSA deduction (Column B = Column A) */
  archerMSA: DualColumnAmount;
  /** Line 35: Other adjustments */
  otherAdjustments: DualColumnAmount;
}

/**
 * Addition and subtraction categories on Schedule NR (Lines 39-44).
 */
export interface ScheduleNRAdditionSubtractionLines {
  /** Line 39: Federally tax-exempt interest/dividends */
  taxExemptInterest: DualColumnAmount;
  /** Line 40: Other additions (from Schedule M) */
  otherAdditions: DualColumnAmount;
  /** Line 42: Social Security and retirement income subtraction */
  retirementSubtraction: DualColumnAmount;
  /** Line 43: Illinois Income Tax overpayment */
  ilRefundSubtraction: DualColumnAmount;
  /** Line 44: Other subtractions (from Schedule M) */
  otherSubtractions: DualColumnAmount;
}

export interface ScheduleNRInput {
  taxYear: number;
  residencyType: ResidencyType;

  /** Income lines (Lines 5-19) */
  income: ScheduleNRIncomeLines;

  /** Adjustment lines (Lines 22-35) */
  adjustments: ScheduleNRAdjustmentLines;

  /** Addition and subtraction lines (Lines 39-44) */
  additionsSubtractions: ScheduleNRAdditionSubtractionLines;

  /** IL-1040 Line 9: Full base income (computed as if full-year resident) */
  fullBaseIncome: Decimal;

  /** IL-1040 Line 10: Total exemptions (computed as if full-year resident) */
  totalExemptions: Decimal;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ScheduleNRResult {
  /** Line 20: Total income (Column A and B) */
  totalIncomeA: Decimal;
  totalIncomeB: Decimal;

  /** Line 36: Total adjustments (Column A and B) */
  totalAdjustmentsA: Decimal;
  totalAdjustmentsB: Decimal;

  /** Line 38: Federal AGI (Column A and B) */
  agiA: Decimal;
  agiB: Decimal;

  /** Line 41: Total income plus additions (Column A and B) */
  totalWithAdditionsA: Decimal;
  totalWithAdditionsB: Decimal;

  /** Line 45: Total subtractions (Column A and B) */
  totalSubtractionsA: Decimal;
  totalSubtractionsB: Decimal;

  /** Line 46: Illinois base income (Column B, floor at 0) */
  ilBaseIncome: Decimal;

  /** Line 47: Full base income from IL-1040 Line 9 */
  fullBaseIncome: Decimal;

  /** Line 48: Allocation decimal (3 decimal places, 0-1.000) */
  allocationDecimal: Decimal;

  /** Line 49: Total exemptions from IL-1040 Line 10 */
  totalExemptions: Decimal;

  /** Line 50: Allocated exemptions */
  allocatedExemptions: Decimal;

  /** Line 51: Illinois net income */
  ilNetIncome: Decimal;

  /** Line 52: Illinois income tax */
  ilTax: Decimal;

  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateScheduleNR(input: ScheduleNRInput): ScheduleNRResult {
  const audit = new AuditTrail();
  const FORM = "Schedule NR";

  // ---- Step 3: Income (Lines 5-19) ----
  const incomeItems = [
    { line: "5", desc: "Wages, salaries, tips", val: input.income.wages },
    { line: "6", desc: "Taxable interest", val: input.income.interest },
    { line: "7", desc: "Ordinary dividends", val: input.income.dividends },
    { line: "8", desc: "Taxable refunds, credits, offsets", val: input.income.taxableRefunds },
    { line: "9", desc: "Alimony received", val: input.income.alimony },
    { line: "10", desc: "Business income or loss", val: input.income.businessIncome },
    { line: "11", desc: "Capital gain or loss", val: input.income.capitalGains },
    { line: "12", desc: "Other gains or losses", val: input.income.otherGains },
    { line: "13", desc: "Taxable IRA distributions", val: input.income.iraDistributions },
    { line: "14", desc: "Taxable pensions and annuities", val: input.income.pensions },
    { line: "15", desc: "Rental, royalties, partnerships, S corps, trusts", val: input.income.rentalAndPartnership },
    { line: "16", desc: "Farm income or loss", val: input.income.farmIncome },
    { line: "17", desc: "Unemployment compensation", val: input.income.unemployment },
    { line: "18", desc: "Taxable Social Security benefits", val: input.income.socialSecurity },
    { line: "19", desc: "Other income", val: input.income.otherIncome },
  ];

  let totalIncomeA = ZERO;
  let totalIncomeB = ZERO;
  for (const item of incomeItems) {
    audit.record(FORM, `${item.line}A`, `${item.desc} (Column A)`, item.val.columnA, "Federal amount", { columnA: item.val.columnA });
    audit.record(FORM, `${item.line}B`, `${item.desc} (Column B)`, item.val.columnB, "IL-source amount", { columnB: item.val.columnB });
    totalIncomeA = totalIncomeA.plus(item.val.columnA);
    totalIncomeB = totalIncomeB.plus(item.val.columnB);
  }

  // Line 20: Total income
  audit.record(FORM, "20A", "Total income (Column A)", totalIncomeA, "Sum of Lines 5-19 Column A", { totalIncomeA });
  audit.record(FORM, "20B", "Total income (Column B)", totalIncomeB, "Sum of Lines 5-19 Column B", { totalIncomeB });

  // ---- Step 3: Adjustments (Lines 22-35) ----
  const adjustmentItems = [
    { line: "22", desc: "Educator expenses", val: input.adjustments.educatorExpenses },
    { line: "23", desc: "Certain business expenses", val: input.adjustments.certainBusinessExpenses },
    { line: "24", desc: "Health savings account deduction", val: input.adjustments.hsaDeduction },
    { line: "25", desc: "Moving expenses (Armed Forces)", val: input.adjustments.movingExpenses },
    { line: "26", desc: "Deductible self-employment tax", val: input.adjustments.seTaxDeduction },
    { line: "27", desc: "Self-employed SEP/SIMPLE/qualified plans", val: input.adjustments.sepSimpleDeduction },
    { line: "28", desc: "Self-employed health insurance", val: input.adjustments.seHealthInsurance },
    { line: "29", desc: "Penalty on early withdrawal", val: input.adjustments.earlyWithdrawalPenalty },
    { line: "30", desc: "Alimony paid", val: input.adjustments.alimonyPaid },
    { line: "31", desc: "IRA deduction", val: input.adjustments.iraDeduction },
    { line: "32", desc: "Student loan interest", val: input.adjustments.studentLoanInterest },
    { line: "34", desc: "Archer MSA deduction", val: input.adjustments.archerMSA },
    { line: "35", desc: "Other adjustments", val: input.adjustments.otherAdjustments },
  ];

  let totalAdjustmentsA = ZERO;
  let totalAdjustmentsB = ZERO;
  for (const item of adjustmentItems) {
    audit.record(FORM, `${item.line}A`, `${item.desc} (Column A)`, item.val.columnA, "Federal amount", { columnA: item.val.columnA });
    audit.record(FORM, `${item.line}B`, `${item.desc} (Column B)`, item.val.columnB, "IL-source amount", { columnB: item.val.columnB });
    totalAdjustmentsA = totalAdjustmentsA.plus(item.val.columnA);
    totalAdjustmentsB = totalAdjustmentsB.plus(item.val.columnB);
  }

  // Line 36: Total adjustments
  audit.record(FORM, "36A", "Total adjustments (Column A)", totalAdjustmentsA, "Sum of Lines 22-35 Column A", { totalAdjustmentsA });
  audit.record(FORM, "36B", "Total adjustments (Column B)", totalAdjustmentsB, "Sum of Lines 22-35 Column B", { totalAdjustmentsB });

  // Line 37: Income minus adjustments
  const line37A = totalIncomeA.minus(totalAdjustmentsA);
  const line37B = totalIncomeB.minus(totalAdjustmentsB);
  audit.record(FORM, "37A", "Subtotal (Column A)", line37A, "Line 20A - Line 36A", { totalIncomeA, totalAdjustmentsA });
  audit.record(FORM, "37B", "Subtotal (Column B)", line37B, "Line 20B - Line 36B", { totalIncomeB, totalAdjustmentsB });

  // Line 38: AGI (should match federal AGI for Column A)
  const agiA = line37A;
  const agiB = line37B;
  audit.record(FORM, "38A", "Federal AGI (Column A)", agiA, "Line 37A", { line37A });
  audit.record(FORM, "38B", "IL-source AGI (Column B)", agiB, "Line 37B", { line37B });

  // ---- Step 4: Additions (Lines 39-40) ----
  const addSub = input.additionsSubtractions;

  const line39A = addSub.taxExemptInterest.columnA;
  const line39B = addSub.taxExemptInterest.columnB;
  audit.record(FORM, "39A", "Tax-exempt interest (Column A)", line39A, "Federal Form 1040, Line 2a", { columnA: line39A });
  audit.record(FORM, "39B", "Tax-exempt interest (Column B)", line39B, "IL-source tax-exempt interest", { columnB: line39B });

  const line40A = addSub.otherAdditions.columnA;
  const line40B = addSub.otherAdditions.columnB;
  audit.record(FORM, "40A", "Other additions (Column A)", line40A, "Schedule M Line 12", { columnA: line40A });
  audit.record(FORM, "40B", "Other additions (Column B)", line40B, "IL-source additions", { columnB: line40B });

  // Line 41: Total income plus additions
  const totalWithAdditionsA = agiA.plus(line39A).plus(line40A);
  const totalWithAdditionsB = agiB.plus(line39B).plus(line40B);
  audit.record(FORM, "41A", "Total income plus additions (Column A)", totalWithAdditionsA, "Line 38A + Line 39A + Line 40A", { agiA, line39A, line40A });
  audit.record(FORM, "41B", "Total income plus additions (Column B)", totalWithAdditionsB, "Line 38B + Line 39B + Line 40B", { agiB, line39B, line40B });

  // ---- Step 4: Subtractions (Lines 42-44) ----
  const line42A = addSub.retirementSubtraction.columnA;
  const line42B = addSub.retirementSubtraction.columnB;
  audit.record(FORM, "42A", "Retirement income subtraction (Column A)", line42A, "IL-1040 Line 5", { columnA: line42A });
  audit.record(FORM, "42B", "Retirement income subtraction (Column B)", line42B, "IL-source retirement", { columnB: line42B });

  const line43A = addSub.ilRefundSubtraction.columnA;
  const line43B = addSub.ilRefundSubtraction.columnB;
  audit.record(FORM, "43A", "IL refund subtraction (Column A)", line43A, "IL-1040 Line 6", { columnA: line43A });
  audit.record(FORM, "43B", "IL refund subtraction (Column B)", line43B, "IL refund in Column B Line 8", { columnB: line43B });

  const line44A = addSub.otherSubtractions.columnA;
  const line44B = addSub.otherSubtractions.columnB;
  audit.record(FORM, "44A", "Other subtractions (Column A)", line44A, "Schedule M Line 42", { columnA: line44A });
  audit.record(FORM, "44B", "Other subtractions (Column B)", line44B, "IL-source subtractions", { columnB: line44B });

  // Line 45: Total subtractions
  const totalSubtractionsA = sum(line42A, line43A, line44A);
  const totalSubtractionsB = sum(line42B, line43B, line44B);
  audit.record(FORM, "45A", "Total subtractions (Column A)", totalSubtractionsA, "Line 42A + Line 43A + Line 44A", { line42A, line43A, line44A });
  audit.record(FORM, "45B", "Total subtractions (Column B)", totalSubtractionsB, "Line 42B + Line 43B + Line 44B", { line42B, line43B, line44B });

  // ---- Step 5: Illinois Income and Tax (Lines 46-52) ----

  // Line 46: Illinois base income (Column B)
  const ilBaseIncome = zeroFloor(totalWithAdditionsB.minus(totalSubtractionsB));
  audit.record(FORM, "46", "Illinois base income", ilBaseIncome, "max(Line 41B - Line 45B, 0)", { totalWithAdditionsB, totalSubtractionsB });

  // Line 47: Full base income from IL-1040 Line 9
  const fullBaseIncome = input.fullBaseIncome;
  audit.record(FORM, "47", "Base income from IL-1040, Line 9", fullBaseIncome, "IL-1040 Line 9", { fullBaseIncome });

  // Line 48: Allocation decimal
  let allocationDecimal: Decimal;
  if (fullBaseIncome.isZero() || fullBaseIncome.isNegative()) {
    allocationDecimal = ZERO;
  } else if (ilBaseIncome.greaterThanOrEqualTo(fullBaseIncome)) {
    allocationDecimal = ONE;
  } else {
    // Round to 3 decimal places
    allocationDecimal = ilBaseIncome.dividedBy(fullBaseIncome).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  }
  audit.record(FORM, "48", "Allocation decimal", allocationDecimal, "Line 46 / Line 47, rounded to 3 decimals, cap 1.000", { ilBaseIncome, fullBaseIncome });

  // Line 49: Total exemptions from IL-1040 Line 10
  const totalExemptions = input.totalExemptions;
  audit.record(FORM, "49", "Exemption allowance from IL-1040, Line 10", totalExemptions, "IL-1040 Line 10", { totalExemptions });

  // Line 50: Allocated exemptions
  const allocatedExemptions = roundDollar(totalExemptions.times(allocationDecimal));
  audit.record(FORM, "50", "Allocated exemption allowance", allocatedExemptions, "Line 49 × Line 48", { totalExemptions, allocationDecimal });

  // Line 51: Illinois net income
  const ilNetIncome = zeroFloor(ilBaseIncome.minus(allocatedExemptions));
  audit.record(FORM, "51", "Illinois net income", ilNetIncome, "max(Line 46 - Line 50, 0)", { ilBaseIncome, allocatedExemptions });

  // Line 52: Illinois income tax
  const ilTax = roundDollar(ilNetIncome.times(TAX_RATE));
  audit.record(FORM, "52", "Illinois income tax", ilTax, "Line 51 × 4.95%", { ilNetIncome, rate: TAX_RATE });

  return {
    totalIncomeA,
    totalIncomeB,
    totalAdjustmentsA,
    totalAdjustmentsB,
    agiA,
    agiB,
    totalWithAdditionsA,
    totalWithAdditionsB,
    totalSubtractionsA,
    totalSubtractionsB,
    ilBaseIncome,
    fullBaseIncome,
    allocationDecimal,
    totalExemptions,
    allocatedExemptions,
    ilNetIncome,
    ilTax,
    lines: audit.getLines(),
  };
}

// ---------------------------------------------------------------------------
// Helper — Compute ISE Decimal
// ---------------------------------------------------------------------------

/**
 * Compute the Illinois Self-Employment (ISE) decimal.
 * Used to allocate SE-related deductions (Lines 26-28) to Column B.
 *
 * ISE = SE income in Column B / federal Schedule SE (Line 3 + 5a)
 * Capped at 1.0, floored at 0.
 */
export function computeISEDecimal(
  seIncomeColumnB: Decimal,
  federalSEIncome: Decimal,
): Decimal {
  if (federalSEIncome.isZero() || federalSEIncome.isNegative()) {
    return ZERO;
  }
  const raw = seIncomeColumnB.dividedBy(federalSEIncome);
  if (raw.lessThanOrEqualTo(ZERO)) return ZERO;
  if (raw.greaterThanOrEqualTo(ONE)) return ONE;
  return raw.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Compute the IRA deduction allocation decimal.
 * IL earned income / total earned income from all sources.
 */
export function computeIRAAllocationDecimal(
  ilEarnedIncome: Decimal,
  totalEarnedIncome: Decimal,
): Decimal {
  if (totalEarnedIncome.isZero() || totalEarnedIncome.isNegative()) {
    return ZERO;
  }
  const raw = ilEarnedIncome.dividedBy(totalEarnedIncome);
  if (raw.lessThanOrEqualTo(ZERO)) return ZERO;
  if (raw.greaterThanOrEqualTo(ONE)) return ONE;
  return raw.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}
