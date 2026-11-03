/**
 * Pennsylvania Form PA-40 — Personal Income Tax Return
 * Spec: spec/state/pa-40.yaml
 *
 * PA imposes a flat 3.07% income tax on 8 classes of taxable income.
 * PA does NOT start from federal AGI — it computes its own income independently.
 * Net losses in one class cannot offset income in another class.
 */

import Decimal from "decimal.js";
import {ordinarySourcePrecision,publicOrdinaryMoney,publicOrdinaryLines} from "./pa-ordinary-source-precision.js";
import { min, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { STATE_TAX_CONSTANTS } from "@/models/constants.js";

export const PA_CONSTANTS = Object.entries(STATE_TAX_CONSTANTS.pa).reduce(
  (acc, [taxYear, constants]) => {
    acc[Number(taxYear)] = {
      taxRate: constants.personalIncomeTaxRate,
    };
    return acc;
  },
  {} as Record<number, { taxRate: Decimal }>,
);

// ---------------------------------------------------------------------------
// Input / Output interfaces
// ---------------------------------------------------------------------------

/**
 * Pre-computed income amounts for each of PA's 8 income classes,
 * plus payment/credit amounts. The caller (orchestrator) maps from
 * TaxYearInput to this structure.
 */
export interface PA40Input {
  taxYear: number;

  // Part A — 8 Classes of Income
  /** Line 1a: Compensation (wages, salaries, tips, etc.) */
  compensation: Decimal;
  /** Line 1b: Unreimbursed employee business expenses (positive value, subtracted from 1a) */
  unreimbursedExpenses: Decimal;
  /** Line 2: Interest income */
  interest: Decimal;
  /** Line 3: Dividend income (all dividends — PA makes no qualified distinction) */
  dividends: Decimal;
  /** Line 4: Net income (loss) from business, profession, or farm (can be negative) */
  netBusinessIncome: Decimal;
  /** Line 5: Net gain (loss) from disposition of property (can be negative) */
  netGainOrLoss: Decimal;
  /** Line 6: Net income (loss) from rents, royalties, patents, copyrights (can be negative) */
  netRentalIncome: Decimal;
  /** Line 7: Estate or trust income */
  estateTrustIncome: Decimal;
  /** Line 8: Gambling and lottery winnings */
  gamblingIncome: Decimal;

  /** Line 10: Other deductions (IRC §529 contributions, etc.) */
  otherDeductions: Decimal;
  /** Line 20: Tax Forgiveness eligibility income carried from Schedule SP */
  taxForgivenessEligibilityIncome: Decimal;

  /** Line 25: Use tax on out-of-state purchases */
  useTax: Decimal;

  // Part B — Payments and Credits
  /** Line 13: Total PA state tax withheld (W-2, 1099, W-2G) */
  stateWithholding: Decimal;
  /** Line 14: Credit from prior year overpayment */
  creditFromPriorYear: Decimal;
  /** Line 15: Estimated tax payments */
  estimatedPayments: Decimal;
  /** Line 16: Extension payment */
  extensionPayment: Decimal;
  /** Line 17: Nonresident tax withheld from PA Schedule(s) NRK-1 */
  nonresidentTaxWithheld: Decimal;
  /** Line 18a: Automatic refundable credits not printed directly on PA-40 */
  refundableCredits: Decimal;
  /** Line 21: Tax forgiveness credit (from Schedule SP) */
  taxForgivenessCredit: Decimal;
  /** Line 22: Resident credit (from Schedule G-L) */
  residentCredit: Decimal;
  /** Line 23: Other credits (from Schedule OC, Schedule DC, and related PA credit schedules) */
  otherCredits: Decimal;
  /** Line 27a: Underpayment penalty component (from REV-1630) */
  underpaymentPenalty: Decimal;
  /** Line 27b: Late filing or payment penalty component */
  lateFilingOrPaymentPenalty: Decimal;
  /** Line 27c: Interest on late filing or payment */
  latePaymentInterest: Decimal;
}

export interface PA40Result {
  // Part A — Income
  /** Line 1a: Compensation */
  compensation: Decimal;
  /** Line 1b: Unreimbursed expenses */
  unreimbursedExpenses: Decimal;
  /** Net compensation (Line 1a - Line 1b, floor 0) */
  netCompensation: Decimal;
  /** Line 2: Interest */
  interest: Decimal;
  /** Line 3: Dividends */
  dividends: Decimal;
  /** Line 4: Net business income (can be negative, but clamped to 0 for total) */
  netBusinessIncome: Decimal;
  /** Line 5: Net gains/losses (can be negative, but clamped to 0 for total) */
  netGainOrLoss: Decimal;
  /** Line 6: Net rental income (can be negative, but clamped to 0 for total) */
  netRentalIncome: Decimal;
  /** Line 7: Estate/trust income */
  estateTrustIncome: Decimal;
  /** Line 8: Gambling income */
  gamblingIncome: Decimal;
  /** Line 9: Total PA taxable income (sum of positive classes) */
  totalPATaxableIncome: Decimal;
  /** Line 10: Other deductions */
  otherDeductions: Decimal;
  /** Line 11: Adjusted PA taxable income (Line 9 - Line 10, floor 0) */
  adjustedPATaxableIncome: Decimal;
  /** Line 20: Tax Forgiveness eligibility income from Schedule SP */
  taxForgivenessEligibilityIncome: Decimal;

  // Settlement helpers
  /** Line 25: Use tax */
  useTax: Decimal;
  /** Helper total PA tax (Line 12 + Line 25) */
  totalPATax: Decimal;

  // Part B — Tax, Payments, Refund
  /** Line 12: Tax liability (Line 11 × 3.07%) */
  taxLiability: Decimal;
  /** Line 13: State withholding */
  stateWithholding: Decimal;
  /** Line 14: Credit from prior year */
  creditFromPriorYear: Decimal;
  /** Line 15: Estimated payments */
  estimatedPayments: Decimal;
  /** Line 16: Extension payment */
  extensionPayment: Decimal;
  /** Line 17: Nonresident tax withheld from PA Schedule(s) NRK-1 */
  nonresidentTaxWithheld: Decimal;
  /** Line 18a: Automatic refundable credits not printed directly on PA-40 */
  refundableCredits: Decimal;
  /** Line 18: Total estimated payments and credits */
  totalEstimatedPaymentsAndCredits: Decimal;
  /** Legacy payment-side total before nonrefundable credits are added back */
  totalPayments: Decimal;
  /** Line 21: Tax forgiveness credit */
  taxForgivenessCredit: Decimal;
  /** Line 22: Resident credit (Schedule G-L) */
  residentCredit: Decimal;
  /** Line 23: Other credits (Schedule OC, Schedule DC, and related PA credit schedules) */
  otherCredits: Decimal;
  /** Line 22a: Engine helper total credits */
  totalCredits: Decimal;
  /** Line 23a: Engine helper net tax liability after credits */
  netTaxLiability: Decimal;
  /** Line 24: Total payments and credits on the printed PA-40 */
  totalPaymentsAndCredits: Decimal;
  /** Legacy overpayment before use tax and penalties are netted */
  overpayment: Decimal;
  /** Legacy amount owed before use tax and penalties are netted */
  amountOwed: Decimal;
  /** Line 26: Tax due including use tax, before penalties and interest */
  taxDue: Decimal;
  /** Line 27a: Underpayment penalty component */
  underpaymentPenalty: Decimal;
  /** Line 27b: Late filing or payment penalty component */
  lateFilingOrPaymentPenalty: Decimal;
  /** Line 27c: Interest on late filing or payment component */
  latePaymentInterest: Decimal;
  /** Line 27: Combined penalties and interest */
  penaltiesAndInterest: Decimal;
  /** Line 28: Total amount due */
  totalAmountDue: Decimal;
  /** Line 29: Printed overpayment after use tax and penalties are netted */
  netOverpayment: Decimal;

  /** Audit trail */
  lines: CalculatedLine[];
}

interface PA40AllowedOtherCreditsInput {
  taxLiability: Decimal;
  taxForgivenessCredit: Decimal;
  residentCredit: Decimal;
  otherCredits: Decimal;
}

export function calculatePA40AllowedOtherCredits(input: PA40AllowedOtherCreditsInput): Decimal {
  const remainingLiability = zeroFloor(
    input.taxLiability
      .minus(zeroFloor(input.taxForgivenessCredit))
      .minus(zeroFloor(input.residentCredit)),
  );

  return min(zeroFloor(input.otherCredits), remainingLiability);
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculatePA40(originalInput: PA40Input): PA40Result {
  const Money=Decimal.clone({precision:ordinarySourcePrecision(originalInput),rounding:Decimal.ROUND_HALF_UP});
  const sum=(...values:Decimal[]):Decimal=>values.reduce((total,value)=>total.plus(value),new Money(0));
  const zeroFloor=(value:Decimal):Decimal=>value.lt(0)?new Money(0):new Money(value);
  // Spec: printed-income-rounding/reported-payments. Aggregate exact originals
  // within each line first, then round that reported line once for arithmetic.
  // Actual 2024 and 2025 instructions use the same rule; 2026 remains draft.
  // Retain original cents, including unprinted late-payment components.
  const input: PA40Input = {
    ...originalInput,
    refundableCredits:new Money(originalInput.refundableCredits),
    underpaymentPenalty:new Money(originalInput.underpaymentPenalty ?? 0),lateFilingOrPaymentPenalty:new Money(originalInput.lateFilingOrPaymentPenalty ?? 0),latePaymentInterest:new Money(originalInput.latePaymentInterest ?? 0),
    compensation: roundDollar(new Money(originalInput.compensation)),
    unreimbursedExpenses: roundDollar(new Money(originalInput.unreimbursedExpenses)),
    interest: roundDollar(new Money(originalInput.interest)),
    dividends: roundDollar(new Money(originalInput.dividends)),
    netBusinessIncome: roundDollar(new Money(originalInput.netBusinessIncome)),
    netGainOrLoss: roundDollar(new Money(originalInput.netGainOrLoss)),
    netRentalIncome: roundDollar(new Money(originalInput.netRentalIncome)),
    estateTrustIncome: roundDollar(new Money(originalInput.estateTrustIncome)),
    gamblingIncome: roundDollar(new Money(originalInput.gamblingIncome)),
    otherDeductions: roundDollar(new Money(originalInput.otherDeductions)),
    stateWithholding: roundDollar(new Money(originalInput.stateWithholding)),
    creditFromPriorYear: roundDollar(new Money(originalInput.creditFromPriorYear)),
    estimatedPayments: roundDollar(new Money(originalInput.estimatedPayments)),
    extensionPayment: roundDollar(new Money(originalInput.extensionPayment)),
    nonresidentTaxWithheld: roundDollar(new Money(originalInput.nonresidentTaxWithheld)),
    taxForgivenessEligibilityIncome: roundDollar(new Money(originalInput.taxForgivenessEligibilityIncome)),
    taxForgivenessCredit: roundDollar(new Money(originalInput.taxForgivenessCredit)),
    residentCredit: roundDollar(new Money(originalInput.residentCredit)),
    otherCredits: roundDollar(new Money(originalInput.otherCredits)),
    useTax: roundDollar(new Money(originalInput.useTax)),
  };
  const constants = STATE_TAX_CONSTANTS.pa[input.taxYear];
  if (!constants) {
    throw new Error(`PA constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  // -----------------------------------------------------------------------
  // Part A — Income Classes
  // -----------------------------------------------------------------------

  // Line 1a: Compensation
  audit.record("PA-40", "1a", "Compensation", input.compensation, "W-2 wages/salaries/tips");

  // Line 1b: Unreimbursed employee business expenses
  audit.record("PA-40", "1b", "Unreimbursed employee business expenses", input.unreimbursedExpenses, "PA Schedule UE");

  // Net compensation = Line 1a - Line 1b, floor at 0
  const netCompensation = zeroFloor(input.compensation.minus(input.unreimbursedExpenses));
  audit.record("PA-40", "1c", "Net compensation", netCompensation, "Line 1a - Line 1b, floor at 0");

  // Line 2: Interest
  audit.record("PA-40", "2", "Interest income", input.interest, "1099-INT interest");

  // Line 3: Dividends
  audit.record("PA-40", "3", "Dividend income", input.dividends, "1099-DIV dividends (all taxed at 3.07%)");

  // Line 4: Net business income (loss)
  audit.record("PA-40", "4", "Net business/profession/farm income", input.netBusinessIncome, "PA Schedule C");

  // Line 5: Net gains/losses
  audit.record("PA-40", "5", "Net gain (loss) from disposition of property", input.netGainOrLoss, "PA Schedule D");

  // Line 6: Net rental income (loss)
  audit.record("PA-40", "6", "Net income (loss) from rents, royalties, patents, copyrights", input.netRentalIncome, "PA Schedule E");

  // Line 7: Estate or trust income
  audit.record("PA-40", "7", "Estate or trust income", input.estateTrustIncome, "PA Schedule J");

  // Line 8: Gambling and lottery winnings
  audit.record("PA-40", "8", "Gambling and lottery winnings", input.gamblingIncome, "PA Schedule T / W-2G");

  // -----------------------------------------------------------------------
  // Line 9: Total PA Taxable Income
  // Each class is clamped to 0 — net losses in one class cannot offset income
  // in another class. Interest, dividends, estate/trust, and gambling are
  // always non-negative by nature, but we clamp for safety.
  // -----------------------------------------------------------------------

  const totalPATaxableIncome = sum(
    netCompensation,
    zeroFloor(input.interest),
    zeroFloor(input.dividends),
    zeroFloor(input.netBusinessIncome),
    zeroFloor(input.netGainOrLoss),
    zeroFloor(input.netRentalIncome),
    zeroFloor(input.estateTrustIncome),
    zeroFloor(input.gamblingIncome),
  );
  audit.record("PA-40", "9", "Total PA taxable income", totalPATaxableIncome,
    "Sum of positive income classes (losses in one class cannot offset income in another)");

  // Line 10: Other deductions
  audit.record("PA-40", "10", "Other deductions", input.otherDeductions, "PA Schedule O and other supported PA-allowed deductions");

  // Line 11: Adjusted PA taxable income
  const adjustedPATaxableIncome = zeroFloor(totalPATaxableIncome.minus(input.otherDeductions));
  audit.record("PA-40", "11", "Adjusted PA taxable income", adjustedPATaxableIncome, "Line 9 - Line 10, floor at 0");

  // -----------------------------------------------------------------------
  // Part B — Tax Computation
  // -----------------------------------------------------------------------

  // Line 12: Tax liability = Line 11 × 3.07%
  const taxLiability = roundDollar(adjustedPATaxableIncome.times(constants.personalIncomeTaxRate));
  audit.record("PA-40", "12", "Tax liability", taxLiability,
    `Line 11 × ${constants.personalIncomeTaxRate.times(100)}%`);

  // Helper total PA tax = Line 12 + Line 25
  const totalPATax = taxLiability.plus(input.useTax);

  // -----------------------------------------------------------------------
  // Payments and Credits
  // -----------------------------------------------------------------------

  // Line 13: State withholding
  audit.record("PA-40", "13", "Total PA tax withheld", input.stateWithholding, "W-2/1099 state withholding");

  // Line 14: Credit from prior year
  audit.record("PA-40", "14", "Credit from prior year overpayment", input.creditFromPriorYear, "Prior year PA-40");

  // Line 15: Estimated payments
  audit.record("PA-40", "15", "Estimated payments", input.estimatedPayments, "PA-40 ES quarterly payments");

  // Line 16: Extension payment
  audit.record("PA-40", "16", "Extension payment", input.extensionPayment, "REV-276 extension payment");

  // Line 17: Nonresident tax withheld
  audit.record(
    "PA-40",
    "17",
    "Nonresident tax withheld from PA Schedule(s) NRK-1",
    input.nonresidentTaxWithheld,
    "PA Schedule NRK-1 Line 2 withholding claimed on PA-40 Line 17",
  );

  // Line 18a: Engine helper refundable credits
  audit.record(
    "PA-40",
    "18a",
    "Engine helper refundable credits",
    input.refundableCredits,
    "Refundable PA credits not printed directly on PA-40, such as the Working Pennsylvanians Tax Credit",
  );

  const totalEstimatedPaymentsAndCredits = sum(
    input.creditFromPriorYear,
    input.estimatedPayments,
    input.extensionPayment,
    input.nonresidentTaxWithheld,
  );
  audit.record(
    "PA-40",
    "18",
    "Total estimated payments and credits",
    totalEstimatedPaymentsAndCredits,
    "Line 14 + Line 15 + Line 16 + Line 17",
  );

  // Legacy payment-side total before nonrefundable credits are added back in
  const totalPayments = sum(
    input.stateWithholding,
    totalEstimatedPaymentsAndCredits,
    input.refundableCredits,
  );

  // -----------------------------------------------------------------------
  // Credits (Lines 19–22)
  // -----------------------------------------------------------------------

  // Line 20: Tax forgiveness eligibility income
  audit.record(
    "PA-40",
    "20",
    "Tax forgiveness eligibility income",
    input.taxForgivenessEligibilityIncome,
    "From PA Schedule SP Section III Line 11",
  );

  // Line 21: Tax forgiveness credit (Schedule SP)
  audit.record("PA-40", "21", "Tax forgiveness credit", input.taxForgivenessCredit, "From Schedule SP");

  // Line 22: Resident credit (Schedule G-L)
  audit.record("PA-40", "22", "Resident credit", input.residentCredit, "From Schedule G-L");

  // Line 23: Other credits (Schedule OC, Schedule DC, and related PA credit schedules)
  const otherCredits = zeroFloor(input.otherCredits);
  audit.record(
    "PA-40",
    "23",
    "Other credits",
    otherCredits,
    "Already-allowed Line 23 amount supplied by upstream schedules; may include refundable credits that exceed remaining liability",
  );

  // Line 22a: Total credits (engine helper)
  const totalCredits = sum(input.taxForgivenessCredit, input.residentCredit, otherCredits);
  audit.record("PA-40", "22a", "Total credits", totalCredits, "Line 21 + Line 22 + Line 23");

  // Line 23a: Net tax liability after credits (engine helper)
  const netTaxLiability = zeroFloor(taxLiability.minus(totalCredits));
  audit.record("PA-40", "23a", "Net tax liability after credits", netTaxLiability, "Line 12 - Line 22a, floor at 0");

  // Line 24: Total payments and credits on the printed PA-40
  const totalPaymentsAndCredits = sum(input.stateWithholding, totalEstimatedPaymentsAndCredits, totalCredits);
  audit.record(
    "PA-40",
    "24",
    "Total payments and credits",
    totalPaymentsAndCredits,
    "Line 13 + Line 18 + Line 21 + Line 22 + Line 23; excludes unprinted engine-only refundable helpers",
  );

  // -----------------------------------------------------------------------
  // Refund or Balance Due
  // -----------------------------------------------------------------------

  const netDue = netTaxLiability.minus(totalPayments);

  const overpayment = netDue.isNegative() ? roundDollar(netDue.abs()) : new Money(0);
  const amountOwed = netDue.isPositive() ? roundDollar(netDue) : new Money(0);

  audit.record("PA-40", "24-legacy", "Legacy overpayment helper", overpayment,
    "Legacy helper before use tax and penalties are applied");
  audit.record("PA-40", "26-legacy", "Legacy amount owed helper", amountOwed,
    "Legacy helper before use tax and penalties are applied");

  // -----------------------------------------------------------------------
  // Official settlement lines 25–29
  // -----------------------------------------------------------------------

  // Line 25: Use tax
  audit.record("PA-40", "25", "Use tax", input.useTax, "Self-reported use tax on out-of-state purchases");

  // Line 26: Tax due before penalties and interest
  const taxDueBase = totalPATax.minus(totalPaymentsAndCredits);
  const taxDue = taxDueBase.isPositive() ? roundDollar(taxDueBase) : new Money(0);
  audit.record("PA-40", "26", "Tax due", taxDue, "If Line 12 + Line 25 exceeds Line 24: the difference");

  // Line 27: Penalties and interest
  const underpaymentPenalty = input.underpaymentPenalty ?? new Money(0);
  const lateFilingOrPaymentPenalty = input.lateFilingOrPaymentPenalty ?? new Money(0);
  const latePaymentInterest = input.latePaymentInterest ?? new Money(0);
  audit.record("PA-40", "25a", "Underpayment penalty component", underpaymentPenalty, "From REV-1630 Line 16");
  audit.record("PA-40", "25b", "Late filing or payment penalty component", lateFilingOrPaymentPenalty, "Penalty for filing late and/or failing to pay tax by the due date");
  audit.record("PA-40", "25c", "Late payment interest component", latePaymentInterest, "Interest for late filing/payment");
  const penaltiesAndInterest = roundDollar(sum(
    underpaymentPenalty,
    lateFilingOrPaymentPenalty,
    latePaymentInterest,
  ));
  audit.record(
    "PA-40",
    "27",
    "Penalties and interest",
    penaltiesAndInterest,
    "Round the sum of reported REV-1630 interest and unprinted late penalty/interest once",
  );

  const settlementDifference = totalPaymentsAndCredits.minus(totalPATax).minus(penaltiesAndInterest);
  const totalAmountDue = settlementDifference.isNegative() ? roundDollar(settlementDifference.abs()) : new Money(0);
  const netOverpayment = settlementDifference.isPositive() ? roundDollar(settlementDifference) : new Money(0);
  audit.record("PA-40", "28", "Total amount due", totalAmountDue, "If Line 26 + Line 27 is greater than 0: the amount due");
  audit.record("PA-40", "29", "Overpayment", netOverpayment, "If Line 24 exceeds Line 12 + Line 25 + Line 27: the difference");

  return {
    // Part A
    compensation: publicOrdinaryMoney(input.compensation),
    unreimbursedExpenses: publicOrdinaryMoney(input.unreimbursedExpenses),
    netCompensation: publicOrdinaryMoney(netCompensation),
    interest: publicOrdinaryMoney(input.interest),
    dividends: publicOrdinaryMoney(input.dividends),
    netBusinessIncome: publicOrdinaryMoney(input.netBusinessIncome),
    netGainOrLoss: publicOrdinaryMoney(input.netGainOrLoss),
    netRentalIncome: publicOrdinaryMoney(input.netRentalIncome),
    estateTrustIncome: publicOrdinaryMoney(input.estateTrustIncome),
    gamblingIncome: publicOrdinaryMoney(input.gamblingIncome),
    totalPATaxableIncome: publicOrdinaryMoney(totalPATaxableIncome),
    otherDeductions: publicOrdinaryMoney(input.otherDeductions),
    adjustedPATaxableIncome: publicOrdinaryMoney(adjustedPATaxableIncome),
    taxForgivenessEligibilityIncome: publicOrdinaryMoney(input.taxForgivenessEligibilityIncome),

    // Settlement helpers
    useTax: publicOrdinaryMoney(input.useTax),
    totalPATax: publicOrdinaryMoney(totalPATax),

    // Part B
    taxLiability: publicOrdinaryMoney(taxLiability),
    stateWithholding: publicOrdinaryMoney(input.stateWithholding),
    creditFromPriorYear: publicOrdinaryMoney(input.creditFromPriorYear),
    estimatedPayments: publicOrdinaryMoney(input.estimatedPayments),
    extensionPayment: publicOrdinaryMoney(input.extensionPayment),
    nonresidentTaxWithheld: publicOrdinaryMoney(input.nonresidentTaxWithheld),
    refundableCredits: publicOrdinaryMoney(input.refundableCredits),
    totalEstimatedPaymentsAndCredits: publicOrdinaryMoney(totalEstimatedPaymentsAndCredits),
    totalPayments: publicOrdinaryMoney(totalPayments),
    taxForgivenessCredit: publicOrdinaryMoney(input.taxForgivenessCredit),
    residentCredit: publicOrdinaryMoney(input.residentCredit),
    otherCredits: publicOrdinaryMoney(otherCredits),
    totalCredits: publicOrdinaryMoney(totalCredits),
    netTaxLiability: publicOrdinaryMoney(netTaxLiability),
    totalPaymentsAndCredits: publicOrdinaryMoney(totalPaymentsAndCredits),
    overpayment: publicOrdinaryMoney(overpayment),
    amountOwed: publicOrdinaryMoney(amountOwed),
    taxDue: publicOrdinaryMoney(taxDue),
    underpaymentPenalty: publicOrdinaryMoney(underpaymentPenalty),
    lateFilingOrPaymentPenalty: publicOrdinaryMoney(lateFilingOrPaymentPenalty),
    latePaymentInterest: publicOrdinaryMoney(latePaymentInterest),
    penaltiesAndInterest: publicOrdinaryMoney(penaltiesAndInterest),
    totalAmountDue: publicOrdinaryMoney(totalAmountDue),
    netOverpayment: publicOrdinaryMoney(netOverpayment),

    lines: publicOrdinaryLines(audit.getLines()),
  };
}
