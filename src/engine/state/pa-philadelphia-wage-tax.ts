/**
 * Philadelphia Wage Tax / Earnings Tax
 * Spec: spec/state/pa-philadelphia-wage-tax.yaml
 */

import Decimal from "decimal.js";
import { d, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

export type PhiladelphiaWageTaxResidencyStatus = "resident" | "nonresident";

interface PhiladelphiaWageTaxRates {
  resident: {
    preJuly: Decimal;
    postJuly: Decimal;
  };
  nonresident: {
    preJuly: Decimal;
    postJuly: Decimal;
  };
  reducedRate: Decimal;
}

const PHILADELPHIA_WAGE_TAX_CONSTANTS: Record<number, PhiladelphiaWageTaxRates> = {
  2025: {
    resident: {
      preJuly: new Decimal("0.0375"),
      postJuly: new Decimal("0.0374"),
    },
    nonresident: {
      preJuly: new Decimal("0.0344"),
      postJuly: new Decimal("0.0343"),
    },
    reducedRate: new Decimal("0.015"),
  },
};

function cents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export interface PhiladelphiaWageTaxInput {
  taxYear: number;
  residencyStatus: PhiladelphiaWageTaxResidencyStatus;
  taxableCompensationPreJuly: Decimal;
  taxableCompensationPostJuly: Decimal;
  scheduleSPApproved?: boolean;
  withholding: Decimal;
}

export interface PhiladelphiaWageTaxResult {
  residencyStatus: PhiladelphiaWageTaxResidencyStatus;
  taxableCompensationPreJuly: Decimal;
  taxableCompensationPostJuly: Decimal;
  totalTaxableCompensation: Decimal;
  preJulyRate: Decimal;
  postJulyRate: Decimal;
  standardTax: Decimal;
  scheduleSPApproved: boolean;
  reducedRate: Decimal;
  reducedRateTax: Decimal;
  finalTax: Decimal;
  withholding: Decimal;
  overpayment: Decimal;
  balanceDue: Decimal;
  lines: CalculatedLine[];
}

export function calculatePhiladelphiaWageTax(
  input: PhiladelphiaWageTaxInput,
): PhiladelphiaWageTaxResult {
  const constants = PHILADELPHIA_WAGE_TAX_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`Philadelphia Wage Tax constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const periodRates = constants[input.residencyStatus];
  const taxableCompensationPreJuly = cents(zeroFloor(d(input.taxableCompensationPreJuly)));
  const taxableCompensationPostJuly = cents(zeroFloor(d(input.taxableCompensationPostJuly)));
  const totalTaxableCompensation = cents(
    taxableCompensationPreJuly.plus(taxableCompensationPostJuly),
  );
  const scheduleSPApproved = input.scheduleSPApproved === true;
  const withholding = cents(zeroFloor(d(input.withholding)));

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "1",
    "Taxable compensation paid January 1 through June 30, 2025",
    taxableCompensationPreJuly,
    "Input pre-July taxable compensation, floored at 0 and rounded to cents",
  );

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "2",
    "Taxable compensation paid on or after July 1, 2025",
    taxableCompensationPostJuly,
    "Input post-July taxable compensation, floored at 0 and rounded to cents",
  );

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "3-pre",
    "Applicable pre-July 2025 rate",
    periodRates.preJuly,
    input.residencyStatus === "resident"
      ? "2025 Philadelphia resident rate through June 30, 2025"
      : "2025 Philadelphia nonresident rate through June 30, 2025",
  );
  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "3-post",
    "Applicable post-July 2025 rate",
    periodRates.postJuly,
    input.residencyStatus === "resident"
      ? "2025 Philadelphia resident rate on and after July 1, 2025"
      : "2025 Philadelphia nonresident rate on and after July 1, 2025",
  );

  const preJulyTax = cents(taxableCompensationPreJuly.times(periodRates.preJuly));
  const postJulyTax = cents(taxableCompensationPostJuly.times(periodRates.postJuly));
  const standardTax = cents(preJulyTax.plus(postJulyTax));

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "4",
    "Standard Philadelphia Wage/Earnings Tax",
    standardTax,
    "(Line 1 × pre-July rate) + (Line 2 × post-July rate), rounded to cents",
    {
      taxableCompensationPreJuly,
      taxableCompensationPostJuly,
      preJulyRate: periodRates.preJuly,
      postJulyRate: periodRates.postJuly,
    },
  );

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "5",
    "Income-based reduced-rate eligibility",
    scheduleSPApproved ? new Decimal(1) : new Decimal(0),
    scheduleSPApproved
      ? "PA Schedule SP approval present, so the 1.5% reduced rate applies"
      : "No PA Schedule SP approval, so the standard resident or nonresident rate applies",
  );

  const reducedRateTax = cents(totalTaxableCompensation.times(constants.reducedRate));
  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "6",
    "Income-based reduced-rate tax",
    reducedRateTax,
    "(Line 1 + Line 2) × 1.5%, rounded to cents",
    {
      totalTaxableCompensation,
      reducedRate: constants.reducedRate,
    },
  );

  const finalTax = scheduleSPApproved ? reducedRateTax : standardTax;
  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "7",
    "Final Philadelphia Wage/Earnings Tax liability",
    finalTax,
    scheduleSPApproved ? "Reduced-rate tax because PA Schedule SP is approved" : "Standard tax because PA Schedule SP is not approved",
  );

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "8",
    "Philadelphia Wage Tax withheld or paid",
    withholding,
    "Input Philadelphia Wage Tax withholding/payments, floored at 0 and rounded to cents",
  );

  const settlement = cents(withholding.minus(finalTax));
  const overpayment = settlement.isPositive() ? settlement : new Decimal(0);
  const balanceDue = settlement.isNegative() ? settlement.abs() : new Decimal(0);

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "9",
    "Overpayment",
    overpayment,
    "If Line 8 > Line 7, Line 8 - Line 7; otherwise 0",
  );
  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "10",
    "Balance due",
    balanceDue,
    "If Line 7 > Line 8, Line 7 - Line 8; otherwise 0",
  );

  return {
    residencyStatus: input.residencyStatus,
    taxableCompensationPreJuly,
    taxableCompensationPostJuly,
    totalTaxableCompensation,
    preJulyRate: periodRates.preJuly,
    postJulyRate: periodRates.postJuly,
    standardTax,
    scheduleSPApproved,
    reducedRate: constants.reducedRate,
    reducedRateTax,
    finalTax,
    withholding,
    overpayment,
    balanceDue,
    lines: audit.getLines(),
  };
}
