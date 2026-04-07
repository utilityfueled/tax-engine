/**
 * New Jersey NJ-1040 property tax benefit computation.
 * Spec: spec/state/nj-1040-property-tax.yaml
 *
 * Computes property tax deduction or credit. Filers choose one:
 * - Deduction: up to $15,000 of property taxes (or 18% of rent for tenants)
 * - Credit: flat $50 if NJ gross income ≤ $250,000
 */

import Decimal from "decimal.js";
import { getNJResidentConstants, type FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";
const MONTHS_IN_YEAR = new Decimal(12);

export interface NJ1040PropertyTaxInput {
  taxYear: number;
  filingStatus?: FilingStatus;
  /** Is the taxpayer a homeowner of their principal NJ residence? */
  isHomeowner?: boolean;
  /** Is the taxpayer a tenant of their principal NJ residence? */
  isTenant?: boolean;
  /** Property taxes paid on principal NJ residence (homeowners) */
  propertyTaxesPaid?: Decimal | string | number;
  /** Annual rent paid on principal NJ residence (tenants) */
  rentPaid?: Decimal | string | number;
  /** NJ gross income (Line 29) — needed for credit eligibility */
  njGrossIncome?: Decimal | string | number;
  /** Age-65+ exception flag for below-threshold filers */
  taxpayerAge65OrOlder?: boolean;
  /** Age-65+ exception flag for joint filers */
  spouseAge65OrOlder?: boolean;
  /** Blind/disabled exception flag for below-threshold filers */
  taxpayerBlindOrDisabled?: boolean;
  /** Blind/disabled exception flag for joint filers */
  spouseBlindOrDisabled?: boolean;
  /** Elect the $50 credit instead of the deduction? */
  electCredit?: boolean;
  /** Months of NJ residency in the main home (for part-year proration) */
  monthsOfResidency?: number;
  /** MFS spouses who maintained the same main home split the credit to $25 each */
  sharedMainHomeWithSpouse?: boolean;
  /** Homeowner with a 100% disabled-veteran property tax exemption — ineligible for deduction and credit */
  hasDisabledVeteranPropertyTaxExemption?: boolean;
  /** Homeowner who made PILOT (Payment In Lieu Of Taxes) payments — ineligible for deduction and credit */
  madePilotPayments?: boolean;
  /** Tenant who rented a tax-exempt property — ineligible for deduction and credit */
  rentedTaxExemptProperty?: boolean;
}

export interface NJ1040PropertyTaxResult {
  /** Property taxes paid (actual for homeowners, 18% of rent for tenants) */
  propertyTaxAmount: Decimal;
  /** Whether filer elected the deduction */
  electedDeduction: boolean;
  /** Deduction amount (0 if credit elected) */
  deductionAmount: Decimal;
  /** Whether filer is eligible for the $50 credit */
  creditEligible: boolean;
  /** Credit amount (0 if deduction elected or not eligible) */
  creditAmount: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040PropertyTax(
  input: NJ1040PropertyTaxInput
): NJ1040PropertyTaxResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 property tax benefit rules");

  const audit = new AuditTrail();
  const njResidentConstants = getNJResidentConstants(input.taxYear);
  const propertyTaxConstants = njResidentConstants.propertyTax;

  const homeownerPropertyTaxAmount = input.isHomeowner
    ? zeroFloor(d(input.propertyTaxesPaid))
    : new Decimal(0);
  const tenantPropertyTaxAmount = input.isTenant
    ? zeroFloor(d(input.rentPaid).times(propertyTaxConstants.rentToPropertyTaxRate))
    : new Decimal(0);
  const propertyTaxAmount = homeownerPropertyTaxAmount.plus(tenantPropertyTaxAmount);

  audit.record(
    "NJ-1040",
    "property-tax-paid",
    "Property taxes paid or computed from rent",
    propertyTaxAmount,
    input.isHomeowner && input.isTenant
      ? "Worksheet G line 10: homeowner property taxes plus 18% of tenant rent"
      : input.isTenant
        ? "18% of annual rent paid"
        : "Actual property taxes paid on principal NJ residence",
    input.isHomeowner && input.isTenant
      ? {
        "Homeowner property taxes paid": homeownerPropertyTaxAmount,
        "Tenant rent paid": d(input.rentPaid),
        "Tenant property tax amount": tenantPropertyTaxAmount,
        "Rate": propertyTaxConstants.rentToPropertyTaxRate.toString(),
      }
      : input.isTenant
        ? {
          "Rent paid": d(input.rentPaid),
          "Rate": propertyTaxConstants.rentToPropertyTaxRate.toString(),
        }
        : { "Property taxes paid": d(input.propertyTaxesPaid) }
  );

  // Compute deduction (capped at $15,000)
  const uncappedDeduction = propertyTaxAmount;
  const deductionCap =
    input.filingStatus === "married_filing_separately" &&
    input.sharedMainHomeWithSpouse
      ? propertyTaxConstants.sharedHomeMFSDeductionCap
      : propertyTaxConstants.deductionCap;
  const cappedDeduction = Decimal.min(uncappedDeduction, deductionCap);

  const njGrossIncome = d(input.njGrossIncome);
  const hasGrossIncomeInput = input.njGrossIncome !== undefined;
  const filingThreshold = njResidentConstants.filingThresholds[
    input.filingStatus ?? "single"
  ];
  const meetsRegularThreshold = !hasGrossIncomeInput || njGrossIncome.greaterThan(filingThreshold);
  const qualifiesForLowIncomeException =
    hasGrossIncomeInput
    && njGrossIncome.lessThanOrEqualTo(filingThreshold)
    && (
      !!input.taxpayerAge65OrOlder
      || !!input.spouseAge65OrOlder
      || !!input.taxpayerBlindOrDisabled
      || !!input.spouseBlindOrDisabled
    );

  // Disqualifying conditions that block both the deduction and credit
  const isDisqualifiedByExemption =
    !!input.hasDisabledVeteranPropertyTaxExemption
    || !!input.madePilotPayments
    || !!input.rentedTaxExemptProperty;

  // Determine benefit eligibility
  const hasQualifyingProperty = (input.isHomeowner || input.isTenant || false) && !isDisqualifiedByExemption;
  const deductionEligible = hasQualifyingProperty && meetsRegularThreshold;
  const creditEligible =
    hasQualifyingProperty
    && njGrossIncome.lessThanOrEqualTo(propertyTaxConstants.creditIncomeLimit)
    && (meetsRegularThreshold || qualifiesForLowIncomeException);

  audit.record(
    "NJ-1040",
    "credit-eligible",
    "Property tax credit eligibility",
    new Decimal(creditEligible ? 1 : 0),
    "NJ gross income ≤ $250,000, qualifying property, and either above the filing threshold or within the age-65+/blind-disabled low-income exception",
    {
      "NJ gross income": njGrossIncome,
      "Filing threshold": filingThreshold,
      "Income limit": propertyTaxConstants.creditIncomeLimit,
      "Has qualifying property": String(hasQualifyingProperty),
      "Meets regular threshold": String(meetsRegularThreshold),
      "Low-income exception": String(qualifiesForLowIncomeException),
      "Eligible": String(creditEligible),
    }
  );

  // Determine election: default to deduction when property taxes exist
  const electCredit = input.electCredit ?? false;
  const electedDeduction =
    deductionEligible && !electCredit && propertyTaxAmount.greaterThan(0);
  const months = Math.max(0, Math.min(12, input.monthsOfResidency ?? 12));
  const baseCreditAmount =
    input.filingStatus === "married_filing_separately" && input.sharedMainHomeWithSpouse
      ? propertyTaxConstants.sharedHomeMFSCreditAmount
      : propertyTaxConstants.creditAmount;
  const proratedCreditAmount =
    months === 12
      ? baseCreditAmount
      : roundDollar(baseCreditAmount.times(months).dividedBy(MONTHS_IN_YEAR));

  // Apply the elected benefit
  const deductionAmount = electedDeduction ? cappedDeduction : new Decimal(0);
  const creditAmount =
    electCredit && creditEligible ? proratedCreditAmount : new Decimal(0);

  audit.record(
    "NJ-1040",
    "deduction-amount",
    "Property tax deduction amount",
    deductionAmount,
    "min(property taxes, applicable cap) if deduction elected and the filing-threshold rule is met; otherwise $0",
    {
      "Uncapped amount": uncappedDeduction,
      "Cap": deductionCap,
      "Deduction eligible": String(deductionEligible),
      "Elected deduction": String(electedDeduction),
    }
  );

  audit.record(
    "NJ-1040",
    "credit-amount",
    "Property tax credit amount",
    creditAmount,
    "Refundable line 56 credit: generally $50, reduced to $25 for MFS same-home filers and prorated for part-year residents",
    {
      "Elected credit": String(electCredit),
      "Eligible": String(creditEligible),
      "Base credit amount": baseCreditAmount,
      "Months of residency": months.toString(),
    }
  );

  return {
    propertyTaxAmount,
    electedDeduction,
    deductionAmount,
    creditEligible,
    creditAmount,
    lines: audit.getLines(),
  };
}
