/**
 * New Jersey Form NJ-1040-HW standalone credit application.
 * Spec: spec/state/nj-1040-hw.yaml
 *
 * Residents who are not filing Form NJ-1040 because their whole-year New
 * Jersey gross income is at or below the filing threshold may use NJ-1040-HW
 * to claim the Property Tax Credit and/or the Wounded Warrior Caregivers
 * Credit.
 */

import Decimal from "decimal.js";
import { getNJResidentConstants, type FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { calculateNJ1040PropertyTax } from "@/engine/state/nj-1040-property-tax.js";
import { calculateNJ1040WoundedWarriorCredit } from "@/engine/state/nj-1040-wounded-warrior-credit.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

export interface NJ1040HWInput {
  filingStatus: FilingStatus;
  taxYear: number;
  /** Whole-year NJ gross income, even for part-year residents */
  njGrossIncome: Decimal | string | number;
  /** True when the taxpayer is filing Form NJ-1040 instead of the HW application */
  isFilingNJ1040?: boolean;

  // Part I - Property Tax Credit
  isHomeowner?: boolean;
  isTenant?: boolean;
  propertyTaxesPaid?: Decimal | string | number;
  rentPaid?: Decimal | string | number;
  taxpayerAge65OrOlder?: boolean;
  spouseAge65OrOlder?: boolean;
  taxpayerBlindOrDisabled?: boolean;
  spouseBlindOrDisabled?: boolean;
  monthsOfResidency?: number;
  sharedMainHomeWithSpouse?: boolean;
  /** Tenant who rented a tax-exempt property — ineligible for property tax credit */
  rentedTaxExemptProperty?: boolean;

  // Part II - Wounded Warrior Caregivers Credit
  providedCareToQualifyingServiceMember?: boolean;
  serviceMemberFederalDisabilityCompensation?: Decimal | string | number;
  onlyCaregiver?: boolean;
  careExpensesSharePercent?: Decimal | string | number;
}

export interface NJ1040HWResult {
  filingThreshold: Decimal;
  hwEligible: boolean;
  propertyTaxCreditEligible: boolean;
  propertyTaxCredit: Decimal;
  woundedWarriorCreditEligible: boolean;
  woundedWarriorCredit: Decimal;
  totalCredits: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040HW(input: NJ1040HWInput): NJ1040HWResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040-HW rules");

  const audit = new AuditTrail();

  const filingThreshold = getNJResidentConstants(input.taxYear).filingThresholds[
    input.filingStatus
  ];
  const njGrossIncome = d(input.njGrossIncome);
  const isFilingNJ1040 = input.isFilingNJ1040 ?? false;
  const hwEligible = !isFilingNJ1040 && njGrossIncome.lessThanOrEqualTo(filingThreshold);

  audit.record(
    "NJ-1040-HW",
    "filing-threshold",
    "Whole-year income threshold for NJ-1040-HW",
    filingThreshold,
    "Single/MFS use $10,000; MFJ/HOH/QSS use $20,000",
    { "Filing status": input.filingStatus }
  );

  audit.record(
    "NJ-1040-HW",
    "hw-eligible",
    "Eligible to use Form NJ-1040-HW",
    new Decimal(hwEligible ? 1 : 0),
    "Taxpayer is not filing NJ-1040 and whole-year NJ gross income does not exceed the filing threshold",
    {
      "NJ gross income": njGrossIncome,
      "Filing threshold": filingThreshold,
      "Filing NJ-1040": String(isFilingNJ1040),
    }
  );

  const propertyTaxResult = calculateNJ1040PropertyTax({
    taxYear: input.taxYear,
    filingStatus: input.filingStatus,
    isHomeowner: input.isHomeowner,
    isTenant: input.isTenant,
    propertyTaxesPaid: input.propertyTaxesPaid,
    rentPaid: input.rentPaid,
    njGrossIncome,
    taxpayerAge65OrOlder: input.taxpayerAge65OrOlder,
    spouseAge65OrOlder: input.spouseAge65OrOlder,
    taxpayerBlindOrDisabled: input.taxpayerBlindOrDisabled,
    spouseBlindOrDisabled: input.spouseBlindOrDisabled,
    electCredit: true,
    monthsOfResidency: input.monthsOfResidency,
    sharedMainHomeWithSpouse: input.sharedMainHomeWithSpouse,
    rentedTaxExemptProperty: input.rentedTaxExemptProperty,
  });

  const propertyTaxCreditEligible = hwEligible && propertyTaxResult.creditEligible;
  const propertyTaxCredit = propertyTaxCreditEligible
    ? propertyTaxResult.creditAmount
    : new Decimal(0);

  audit.record(
    "NJ-1040-HW",
    "part-i-eligible",
    "Property Tax Credit eligibility on Part I",
    new Decimal(propertyTaxCreditEligible ? 1 : 0),
    "HW eligibility plus the resident property-tax-credit eligibility rules for age/disability and qualifying housing",
    {
      "HW eligible": String(hwEligible),
      "Resident property tax credit eligible": String(propertyTaxResult.creditEligible),
    }
  );

  audit.record(
    "NJ-1040-HW",
    "part-i-credit",
    "Property Tax Credit amount on Part I",
    propertyTaxCredit,
    "Resident property tax credit amount if Part I is eligible; otherwise $0",
    {
      "Part I eligible": String(propertyTaxCreditEligible),
      "Resident credit amount": propertyTaxResult.creditAmount,
    }
  );

  const woundedWarriorResult = calculateNJ1040WoundedWarriorCredit({
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
    njGrossIncome,
    providedCareToQualifyingServiceMember:
      input.providedCareToQualifyingServiceMember,
    serviceMemberFederalDisabilityCompensation:
      input.serviceMemberFederalDisabilityCompensation,
    onlyCaregiver: input.onlyCaregiver,
    careExpensesSharePercent: input.careExpensesSharePercent,
  });

  const woundedWarriorCreditEligible =
    hwEligible && (input.providedCareToQualifyingServiceMember ?? false);
  const woundedWarriorCredit = woundedWarriorCreditEligible
    ? woundedWarriorResult.credit
    : new Decimal(0);

  audit.record(
    "NJ-1040-HW",
    "part-ii-eligible",
    "Wounded Warrior Caregivers Credit eligibility on Part II",
    new Decimal(woundedWarriorCreditEligible ? 1 : 0),
    "HW eligibility plus caregiver eligibility for the qualifying service member",
    {
      "HW eligible": String(hwEligible),
      "Provided care": String(input.providedCareToQualifyingServiceMember ?? false),
    }
  );

  audit.record(
    "NJ-1040-HW",
    "part-ii-credit",
    "Wounded Warrior Caregivers Credit amount on Part II",
    woundedWarriorCredit,
    "Resident wounded warrior credit amount if Part II is eligible; otherwise $0",
    {
      "Part II eligible": String(woundedWarriorCreditEligible),
      "Resident wounded warrior credit": woundedWarriorResult.credit,
    }
  );

  const totalCredits = propertyTaxCredit.plus(woundedWarriorCredit);

  audit.record(
    "NJ-1040-HW",
    "total-credits",
    "Total refundable claim on NJ-1040-HW",
    totalCredits,
    "Part I property tax credit plus Part II wounded warrior credit",
    {
      "Property tax credit": propertyTaxCredit,
      "Wounded Warrior credit": woundedWarriorCredit,
    }
  );

  return {
    filingThreshold,
    hwEligible,
    propertyTaxCreditEligible,
    propertyTaxCredit,
    woundedWarriorCreditEligible,
    woundedWarriorCredit,
    totalCredits,
    lines: audit.getLines(),
  };
}
