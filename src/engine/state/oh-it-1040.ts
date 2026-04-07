/**
 * Ohio IT 1040 — Individual Income Tax Return (core resident computation).
 * Spec: spec/state/oh-it-1040.yaml
 *
 * Implements lines 1–8c for full-year Ohio residents. Covers the common case
 * of taxpayers with only nonbusiness income (W-2 wage earners). Business
 * income split and Schedule of Credits are handled by separate modules.
 */

import Decimal from "decimal.js";
import {
  OHIO_TAX_CONSTANTS,
  type FilingStatus,
  type OhioExemptionTier,
  type OhioIT1040YearConstants,
  type OhioTaxBracket,
} from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { clamp, d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

export const OH_IT_1040_CONSTANTS: Record<number, OhioIT1040YearConstants> = {
  2024: OHIO_TAX_CONSTANTS[2024].it1040,
  2025: OHIO_TAX_CONSTANTS[2025].it1040,
};

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface OhioIT1040Input {
  taxYear: number;
  filingStatus: FilingStatus;
  federalAgi: Decimal | string | number;
  /** Ohio Schedule of Adjustments additions (line 12). Default 0. */
  additions?: Decimal | string | number;
  /** Ohio Schedule of Adjustments deductions (line 47). Default 0. */
  deductions?: Decimal | string | number;
  /** Number of personal + dependent exemptions. */
  exemptions: number;
  /** Business income deduction from Schedule of Adjustments line 13. Default 0. Used for MAGI. */
  businessIncomeDeduction?: Decimal | string | number;
  /** Taxable business income from Schedule of Business Income. Default 0. */
  taxableBusinessIncome?: Decimal | string | number;

  // --- Lines 9-26: Credits, payments, refund/balance due ---

  /** Line 9: Nonrefundable credits from Schedule of Credits line 40. Default 0. */
  nonrefundableCredits?: Decimal | string | number;
  /** Line 11: Interest penalty on underpayment of estimated tax (IT/SD 2210). Default 0. */
  underpaymentPenalty?: Decimal | string | number;
  /** Line 12: Unpaid use (sales) tax. Default 0. */
  useTax?: Decimal | string | number;
  /** Line 14: Ohio income tax withheld (W-2 box 17, etc.). Default 0. */
  ohioWithholding?: Decimal | string | number;
  /** Line 15: Estimated/extension payments + prior year credit carryforward. Default 0. */
  estimatedPayments?: Decimal | string | number;
  /** Line 16: Refundable credits from Schedule of Credits line 47. Default 0. */
  refundableCredits?: Decimal | string | number;
  /** Line 18: Amended return prior overpayment. Default 0. */
  amendedPriorOverpayment?: Decimal | string | number;
  /** Line 21: Interest due on late payment. Default 0. */
  latePaymentInterest?: Decimal | string | number;
  /** Line 24: Elected credit carryforward to next year. Default 0. */
  creditCarryforward?: Decimal | string | number;
  /** Line 25: Charitable donations from overpayment. Default 0. */
  donations?: Decimal | string | number;
}

export interface OhioIT1040Result {
  line1_federalAgi: Decimal;
  line2a_additions: Decimal;
  line2b_deductions: Decimal;
  line3_ohioAgi: Decimal;
  magi: Decimal;
  line4_exemptions: Decimal;
  exemptionAmountPerPerson: Decimal;
  line5_ohioTaxableIncome: Decimal;
  line6_taxableBusinessIncome: Decimal;
  line7_taxableNonbusinessIncome: Decimal;
  line8a_nonbusinessTax: Decimal;
  line8b_businessTax: Decimal;
  line8c_totalTax: Decimal;
  line9_nonrefundableCredits: Decimal;
  line10_taxAfterCredits: Decimal;
  line11_underpaymentPenalty: Decimal;
  line12_useTax: Decimal;
  line13_totalLiability: Decimal;
  line14_ohioWithholding: Decimal;
  line15_estimatedPayments: Decimal;
  line16_refundableCredits: Decimal;
  line17_totalPayments: Decimal;
  line18_amendedPriorOverpayment: Decimal;
  line19_netPayments: Decimal;
  line20_taxDue: Decimal;
  line21_latePaymentInterest: Decimal;
  line22_totalAmountDue: Decimal;
  line23_overpayment: Decimal;
  line24_creditCarryforward: Decimal;
  line25_donations: Decimal;
  line26_refund: Decimal;
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExemptionAmount(magi: Decimal, tiers: OhioExemptionTier[]): Decimal {
  for (const tier of tiers) {
    if (tier.maxMagi === null || magi.lessThanOrEqualTo(tier.maxMagi)) {
      return tier.amount;
    }
  }
  return new Decimal(0);
}

function computeNonbusinessTax(
  taxableNonbusinessIncome: Decimal,
  brackets: OhioTaxBracket[]
): Decimal {
  if (taxableNonbusinessIncome.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }

  // Find the applicable bracket (last bracket whose lowerBound is < income)
  let selected = brackets[0]!;
  for (const bracket of brackets) {
    if (taxableNonbusinessIncome.greaterThan(bracket.lowerBound)) {
      selected = bracket;
    }
  }

  // First bracket (0% up to $26,050): tax is $0
  if (selected.rate.isZero()) {
    return new Decimal(0);
  }

  const excess = taxableNonbusinessIncome.minus(selected.lowerBound);
  const tax = selected.baseTax.plus(excess.times(selected.rate));
  return roundDollar(tax);
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateOhioIT1040(input: OhioIT1040Input): OhioIT1040Result {
  const constants = OH_IT_1040_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`Ohio IT 1040 constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  // Line 1 — Federal AGI
  const line1 = d(input.federalAgi);
  audit.record("OH-IT-1040", "1", "Federal adjusted gross income", line1, "Federal 1040, line 11a");

  // Line 2a — Additions
  const line2a = d(input.additions);
  audit.record(
    "OH-IT-1040", "2a",
    "Ohio Schedule of Adjustments — Additions",
    line2a,
    "Schedule of Adjustments, line 12"
  );

  // Line 2b — Deductions
  const line2b = d(input.deductions);
  audit.record(
    "OH-IT-1040", "2b",
    "Ohio Schedule of Adjustments — Deductions",
    line2b,
    "Schedule of Adjustments, line 47"
  );

  // Line 3 — Ohio AGI
  const line3 = line1.plus(line2a).minus(line2b);
  audit.record(
    "OH-IT-1040", "3",
    "Ohio adjusted gross income",
    line3,
    "Line 1 + Line 2a - Line 2b",
    { "Line 1": line1, "Line 2a": line2a, "Line 2b": line2b }
  );

  // MAGI — Ohio AGI + business income deduction
  const businessIncomeDeductionAmount = d(input.businessIncomeDeduction);
  const magi = line3.plus(businessIncomeDeductionAmount);

  // Line 4 — Exemptions
  const exemptionAmountPerPerson = getExemptionAmount(magi, constants.exemptionTiers);
  const line4 = exemptionAmountPerPerson.times(input.exemptions);
  audit.record(
    "OH-IT-1040", "4",
    "Personal and dependent exemptions",
    line4,
    "Number of exemptions × exemption amount (based on MAGI table)",
    {
      "MAGI": magi,
      "Exemption amount per person": exemptionAmountPerPerson,
      "Number of exemptions": input.exemptions.toString(),
    }
  );

  // Line 5 — Ohio taxable income
  const line5 = zeroFloor(line3.minus(line4));
  audit.record(
    "OH-IT-1040", "5",
    "Ohio taxable income",
    line5,
    "max(0, Line 3 - Line 4)",
    { "Line 3": line3, "Line 4": line4 }
  );

  // Line 6 — Taxable business income
  const line6 = clamp(d(input.taxableBusinessIncome), new Decimal(0), line5);
  audit.record(
    "OH-IT-1040", "6",
    "Taxable business income",
    line6,
    "min(Line 5, taxable business income from Ohio Schedule of Business Income)",
    { "Requested taxable business income": d(input.taxableBusinessIncome), "Line 5": line5 }
  );

  // Line 7 — Taxable nonbusiness income
  const line7 = zeroFloor(line5.minus(line6));
  audit.record(
    "OH-IT-1040", "7",
    "Taxable nonbusiness income",
    line7,
    "max(0, Line 5 - Line 6)",
    { "Line 5": line5, "Line 6": line6 }
  );

  // Line 8a — Nonbusiness income tax
  const line8a = computeNonbusinessTax(line7, constants.nonbusinessBrackets);
  audit.record(
    "OH-IT-1040", "8a",
    "Nonbusiness income tax",
    line8a,
    "2025 Ohio income tax brackets applied to Line 7",
    { "Line 7": line7 }
  );

  // Line 8b — Business income tax
  const line8b = line6.greaterThan(0)
    ? roundDollar(line6.times(constants.businessTaxRate))
    : new Decimal(0);
  audit.record(
    "OH-IT-1040", "8b",
    "Business income tax",
    line8b,
    "Line 6 × 3%",
    { "Line 6": line6 }
  );

  // Line 8c — Total tax before credits
  const line8c = line8a.plus(line8b);
  audit.record(
    "OH-IT-1040", "8c",
    "Total Ohio income tax before credits",
    line8c,
    "Line 8a + Line 8b",
    { "Line 8a": line8a, "Line 8b": line8b }
  );

  // =========================================================================
  // Lines 9–26: Credits, payments, refund / balance due
  // =========================================================================

  // Line 9 — Nonrefundable credits (from Schedule of Credits line 40)
  const line9 = d(input.nonrefundableCredits);
  audit.record("OH-IT-1040", "9", "Ohio nonrefundable credits", line9, "Schedule of Credits, line 40");

  // Line 10 — Tax after nonrefundable credits
  const line10 = zeroFloor(line8c.minus(line9));
  audit.record(
    "OH-IT-1040", "10",
    "Tax liability after nonrefundable credits",
    line10,
    "max(0, Line 8c - Line 9)",
    { "Line 8c": line8c, "Line 9": line9 }
  );

  // Line 11 — Underpayment penalty (pass-through)
  const line11 = d(input.underpaymentPenalty);
  audit.record("OH-IT-1040", "11", "Interest penalty on underpayment of estimated tax", line11, "IT/SD 2210");

  // Line 12 — Unpaid use tax (pass-through)
  const line12 = d(input.useTax);
  audit.record("OH-IT-1040", "12", "Unpaid use tax", line12, "Use Tax Worksheet");

  // Line 13 — Total liability before payments
  const line13 = line10.plus(line11).plus(line12);
  audit.record(
    "OH-IT-1040", "13",
    "Total Ohio tax liability before payments",
    line13,
    "Line 10 + Line 11 + Line 12",
    { "Line 10": line10, "Line 11": line11, "Line 12": line12 }
  );

  // Line 14 — Ohio withholding
  const line14 = d(input.ohioWithholding);
  audit.record("OH-IT-1040", "14", "Ohio income tax withheld", line14, "Schedule of Ohio Withholding, Part A, line 1");

  // Line 15 — Estimated/extension payments + credit carryforward
  const line15 = d(input.estimatedPayments);
  audit.record("OH-IT-1040", "15", "Estimated and extension payments, credit carryforward", line15, "Sum of estimated payments + extension payments + prior year carryforward");

  // Line 16 — Refundable credits
  const line16 = d(input.refundableCredits);
  audit.record("OH-IT-1040", "16", "Refundable credits", line16, "Schedule of Credits, line 47");

  // Line 17 — Total payments
  const line17 = line14.plus(line15).plus(line16);
  audit.record(
    "OH-IT-1040", "17",
    "Total Ohio tax payments",
    line17,
    "Line 14 + Line 15 + Line 16",
    { "Line 14": line14, "Line 15": line15, "Line 16": line16 }
  );

  // Line 18 — Amended return prior overpayment
  const line18 = d(input.amendedPriorOverpayment);
  audit.record("OH-IT-1040", "18", "Amended return prior overpayment", line18, "Prior return line 23");

  // Line 19 — Net payment position
  const line19 = line17.minus(line18);
  audit.record(
    "OH-IT-1040", "19",
    "Net payment position",
    line19,
    "Line 17 - Line 18",
    { "Line 17": line17, "Line 18": line18 }
  );

  // Branching: if line 19 > line 13, overpayment; otherwise, tax due
  const hasOverpayment = line19.greaterThan(line13);

  // Line 20 — Tax due (zero if overpayment)
  const line20 = hasOverpayment ? new Decimal(0) : line13.minus(line19);
  audit.record(
    "OH-IT-1040", "20",
    "Tax due",
    line20,
    hasOverpayment ? "$0 (overpayment)" : "Line 13 - Line 19",
    { "Line 13": line13, "Line 19": line19 }
  );

  // Line 21 — Late payment interest (pass-through)
  const line21 = d(input.latePaymentInterest);
  audit.record("OH-IT-1040", "21", "Interest due on late payment", line21, "Pass-through input");

  // Line 22 — Total amount due ($1 or less = $0, per IT 1040 instructions)
  const rawLine22 = line20.plus(line21);
  const line22 = rawLine22.lessThanOrEqualTo(1) ? new Decimal(0) : rawLine22;
  audit.record(
    "OH-IT-1040", "22",
    "Total amount due",
    line22,
    rawLine22.lessThanOrEqualTo(1)
      ? "$0 ($1 or less threshold — no payment necessary)"
      : "Line 20 + Line 21",
    { "Line 20": line20, "Line 21": line21 }
  );

  // Line 23 — Overpayment (zero if tax due)
  const line23 = hasOverpayment ? line19.minus(line13) : new Decimal(0);
  audit.record(
    "OH-IT-1040", "23",
    "Overpayment",
    line23,
    hasOverpayment ? "Line 19 - Line 13" : "$0 (tax due)",
    { "Line 19": line19, "Line 13": line13 }
  );

  // Line 24 — Credit carryforward (capped at overpayment)
  const line24 = min(d(input.creditCarryforward), line23);
  audit.record(
    "OH-IT-1040", "24",
    "Credit carryforward to next year",
    line24,
    "min(elected amount, Line 23)",
    { "Elected": d(input.creditCarryforward), "Line 23": line23 }
  );

  // Line 25 — Donations (capped at remaining overpayment after carryforward)
  const remainingAfterCarryforward = line23.minus(line24);
  const line25 = min(d(input.donations), remainingAfterCarryforward);
  audit.record(
    "OH-IT-1040", "25",
    "Charitable donations from overpayment",
    line25,
    "min(donations, Line 23 - Line 24)",
    { "Donations requested": d(input.donations), "Available": remainingAfterCarryforward }
  );

  // Line 26 — Refund ($1 or less = $0, per IT 1040 instructions)
  const rawLine26 = line23.minus(line24).minus(line25);
  const line26 = rawLine26.lessThanOrEqualTo(1) ? new Decimal(0) : rawLine26;
  audit.record(
    "OH-IT-1040", "26",
    "Refund",
    line26,
    rawLine26.lessThanOrEqualTo(1)
      ? "$0 ($1 or less threshold — no refund issued)"
      : "Line 23 - Line 24 - Line 25",
    { "Line 23": line23, "Line 24": line24, "Line 25": line25 }
  );

  return {
    line1_federalAgi: line1,
    line2a_additions: line2a,
    line2b_deductions: line2b,
    line3_ohioAgi: line3,
    magi,
    line4_exemptions: line4,
    exemptionAmountPerPerson,
    line5_ohioTaxableIncome: line5,
    line6_taxableBusinessIncome: line6,
    line7_taxableNonbusinessIncome: line7,
    line8a_nonbusinessTax: line8a,
    line8b_businessTax: line8b,
    line8c_totalTax: line8c,
    line9_nonrefundableCredits: line9,
    line10_taxAfterCredits: line10,
    line11_underpaymentPenalty: line11,
    line12_useTax: line12,
    line13_totalLiability: line13,
    line14_ohioWithholding: line14,
    line15_estimatedPayments: line15,
    line16_refundableCredits: line16,
    line17_totalPayments: line17,
    line18_amendedPriorOverpayment: line18,
    line19_netPayments: line19,
    line20_taxDue: line20,
    line21_latePaymentInterest: line21,
    line22_totalAmountDue: line22,
    line23_overpayment: line23,
    line24_creditCarryforward: line24,
    line25_donations: line25,
    line26_refund: line26,
    lines: audit.getLines(),
  };
}
