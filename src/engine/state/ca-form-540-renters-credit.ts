/**
 * California Form 540 nonrefundable renter's credit.
 * Spec: spec/state/ca-form-540-renters-credit.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

export type CAForm540RentersCreditDisqualificationReason =
  | "not_full_year_california_resident"
  | "income_limit_exceeded"
  | "did_not_rent_for_half_year"
  | "dependent_lived_with_claimant_more_than_half_year"
  | "tax_exempt_property_without_possessory_interest_tax"
  | "homeowners_exemption_disqualifies";

export type CAForm540RentersCreditAllocation = "half" | "full";

export interface CAForm540RentersCreditConstants {
  incomeLimit: Record<FilingStatus, Decimal>;
  standardCreditAmount: Record<FilingStatus, Decimal>;
}

export const CA_FORM_540_RENTERS_CREDIT_CONSTANTS: Record<number, CAForm540RentersCreditConstants> = {
  2025: {
    incomeLimit: {
      single: new Decimal(53994),
      married_filing_jointly: new Decimal(107988),
      married_filing_separately: new Decimal(53994),
      head_of_household: new Decimal(107988),
      qualifying_surviving_spouse: new Decimal(107988),
    },
    standardCreditAmount: {
      single: new Decimal(60),
      married_filing_jointly: new Decimal(120),
      married_filing_separately: new Decimal(60),
      head_of_household: new Decimal(120),
      qualifying_surviving_spouse: new Decimal(120),
    },
  },
};

export interface CAForm540RentersCreditInput {
  filingStatus: FilingStatus;
  californiaAgi: Decimal | string | number;
  residentEntireYear: boolean;
  monthsRentedPrincipalResidenceInCalifornia: number;
  canBeClaimedAsDependent: boolean;
  livedWithPersonWhoCanClaimDependentMoreThanHalfYear: boolean;
  rentedPropertyTaxExemptMoreThanHalfYear: boolean;
  paidPossessoryInterestTaxOnRentingProperty?: boolean;
  taxpayerClaimedHomeownersPropertyTaxExemption: boolean;
  spouseClaimedHomeownersPropertyTaxExemption?: boolean;
  livedApartFromSpouseEntireYear?: boolean;
  marriedFilingSeparateSharedRentalWithSpouse?: boolean;
  bothMarriedFilingSeparateTaxpayersQualified?: boolean;
  marriedFilingSeparateCreditAllocation?: CAForm540RentersCreditAllocation;
  taxYear: number;
}

export interface CAForm540RentersCreditResult {
  filingStatus: FilingStatus;
  californiaAgi: Decimal;
  incomeLimit: Decimal;
  residentRequirementMet: boolean;
  incomeRequirementMet: boolean;
  rentalPeriodRequirementMet: boolean;
  dependentResidenceRequirementMet: boolean;
  propertyTaxRequirementMet: boolean;
  homeownersExemptionRequirementMet: boolean;
  qualifies: boolean;
  disqualificationReason?: CAForm540RentersCreditDisqualificationReason;
  creditAmountRule: string;
  question11CreditAmount: Decimal;
  line46RentersCredit: Decimal;
  lines: CalculatedLine[];
}

interface HomeownersExemptionOutcome {
  passed: boolean;
  rule: string;
}

function validateRentalMonths(value: number): Decimal {
  if (!Number.isInteger(value) || value < 0 || value > 12) {
    throw new Error("CA Form 540 renter's credit months rented must be a whole number from 0 through 12");
  }

  return new Decimal(value);
}

function booleanValue(value: boolean): Decimal {
  return value ? new Decimal(1) : new Decimal(0);
}

function determineHomeownersExemptionOutcome(input: CAForm540RentersCreditInput): HomeownersExemptionOutcome {
  const taxpayerClaimed = input.taxpayerClaimedHomeownersPropertyTaxExemption;
  const spouseClaimed = input.spouseClaimedHomeownersPropertyTaxExemption ?? false;
  const livedApart = input.livedApartFromSpouseEntireYear ?? false;

  switch (input.filingStatus) {
    case "single":
      return taxpayerClaimed
        ? { passed: false, rule: "single_taxpayer_claimed_homeowners_exemption" }
        : { passed: true, rule: "single_no_homeowners_exemption" };

    case "married_filing_jointly":
      if (!taxpayerClaimed && !spouseClaimed) {
        return { passed: true, rule: "married_filing_jointly_standard" };
      }

      if (taxpayerClaimed && spouseClaimed) {
        return { passed: false, rule: "married_filing_jointly_both_spouses_claimed_homeowners_exemption" };
      }

      if (!livedApart) {
        return { passed: false, rule: "married_filing_jointly_one_spouse_claimed_without_separate_residences" };
      }

      return { passed: true, rule: "married_filing_jointly_separate_residences_exception" };

    case "married_filing_separately":
      if (taxpayerClaimed) {
        return { passed: false, rule: "married_filing_separately_taxpayer_claimed_homeowners_exemption" };
      }

      if (spouseClaimed && !livedApart) {
        return { passed: false, rule: "married_filing_separately_spouse_claimed_without_separate_residences" };
      }

      if (spouseClaimed && livedApart) {
        return { passed: true, rule: "married_filing_separately_separate_residences_exception" };
      }

      return { passed: true, rule: "married_filing_separately_standard" };

    case "head_of_household":
      if (taxpayerClaimed) {
        return { passed: false, rule: "head_of_household_taxpayer_claimed_homeowners_exemption" };
      }

      if (spouseClaimed && !livedApart) {
        return { passed: false, rule: "head_of_household_spouse_claimed_without_separate_residences" };
      }

      if (spouseClaimed && livedApart) {
        return { passed: true, rule: "head_of_household_separate_residences_exception" };
      }

      return { passed: true, rule: "head_of_household_standard" };

    case "qualifying_surviving_spouse":
      return taxpayerClaimed
        ? { passed: false, rule: "qualifying_surviving_spouse_taxpayer_claimed_homeowners_exemption" }
        : { passed: true, rule: "qualifying_surviving_spouse_standard" };
  }
}

function determineCreditAmountRule(input: CAForm540RentersCreditInput, homeownerRule: string): {
  amount: Decimal;
  rule: string;
} {
  const standardAmount = CA_FORM_540_RENTERS_CREDIT_CONSTANTS[input.taxYear]?.standardCreditAmount[input.filingStatus];
  if (!standardAmount) {
    throw new Error(`CA Form 540 renter's credit constants not available for ${input.taxYear}`);
  }

  if (input.filingStatus === "married_filing_jointly") {
    if (homeownerRule === "married_filing_jointly_separate_residences_exception") {
      return {
        amount: new Decimal(60),
        rule: "married_filing_jointly_separate_residences_exception",
      };
    }

    return {
      amount: standardAmount,
      rule: "married_filing_jointly_standard",
    };
  }

  if (input.filingStatus === "married_filing_separately") {
    const allocation = input.marriedFilingSeparateCreditAllocation ?? "half";

    if (allocation === "full") {
      if (
        !input.marriedFilingSeparateSharedRentalWithSpouse ||
        !input.bothMarriedFilingSeparateTaxpayersQualified
      ) {
        throw new Error(
          "CA Form 540 renter's credit full allocation is only allowed when both married-filing-separately spouses qualify in the same rental"
        );
      }

      return {
        amount: new Decimal(120),
        rule: "married_filing_separately_full",
      };
    }

    return {
      amount: standardAmount,
      rule: "married_filing_separately_half",
    };
  }

  return {
    amount: standardAmount,
    rule: input.filingStatus,
  };
}

export function calculateCAForm540RentersCredit(
  input: CAForm540RentersCreditInput
): CAForm540RentersCreditResult {
  const constants = CA_FORM_540_RENTERS_CREDIT_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`CA Form 540 renter's credit constants not available for ${input.taxYear}`);
  }

  if (
    input.marriedFilingSeparateCreditAllocation !== undefined &&
    input.filingStatus !== "married_filing_separately"
  ) {
    throw new Error("CA Form 540 renter's credit allocation only applies to married filing separately");
  }

  const californiaAgi = d(input.californiaAgi);
  const incomeLimit = constants.incomeLimit[input.filingStatus];
  const rentalMonths = validateRentalMonths(input.monthsRentedPrincipalResidenceInCalifornia);

  const residentRequirementMet = input.residentEntireYear;
  const incomeRequirementMet = californiaAgi.lessThanOrEqualTo(incomeLimit);
  const rentalPeriodRequirementMet = rentalMonths.greaterThanOrEqualTo(6);
  const dependentResidenceRequirementMet = !(
    input.canBeClaimedAsDependent && input.livedWithPersonWhoCanClaimDependentMoreThanHalfYear
  );
  const propertyTaxRequirementMet =
    !input.rentedPropertyTaxExemptMoreThanHalfYear || Boolean(input.paidPossessoryInterestTaxOnRentingProperty);
  const homeownersExemptionOutcome = determineHomeownersExemptionOutcome(input);
  const homeownersExemptionRequirementMet = homeownersExemptionOutcome.passed;

  let disqualificationReason: CAForm540RentersCreditDisqualificationReason | undefined;
  if (!residentRequirementMet) {
    disqualificationReason = "not_full_year_california_resident";
  } else if (!incomeRequirementMet) {
    disqualificationReason = "income_limit_exceeded";
  } else if (!rentalPeriodRequirementMet) {
    disqualificationReason = "did_not_rent_for_half_year";
  } else if (!dependentResidenceRequirementMet) {
    disqualificationReason = "dependent_lived_with_claimant_more_than_half_year";
  } else if (!propertyTaxRequirementMet) {
    disqualificationReason = "tax_exempt_property_without_possessory_interest_tax";
  } else if (!homeownersExemptionRequirementMet) {
    disqualificationReason = "homeowners_exemption_disqualifies";
  }

  const qualifies = disqualificationReason === undefined;
  const creditAmountOutcome = determineCreditAmountRule(input, homeownersExemptionOutcome.rule);
  const question11CreditAmount = qualifies ? creditAmountOutcome.amount : new Decimal(0);
  const line46RentersCredit = question11CreditAmount;

  const audit = new AuditTrail();
  audit.record(
    "CA-540-RC",
    "1",
    "California residency requirement status",
    booleanValue(residentRequirementMet),
    "Resident for the entire 2025 tax year",
    {
      "Resident entire year": residentRequirementMet ? "yes" : "no",
    }
  );

  audit.record(
    "CA-540-RC",
    "2",
    "California AGI limitation",
    incomeLimit,
    "Use the published 2025 renter's credit California AGI limit for the filing status",
    {
      "California AGI": californiaAgi.toString(),
      "Filing status": input.filingStatus,
      "Income requirement met": incomeRequirementMet ? "yes" : "no",
    }
  );

  audit.record(
    "CA-540-RC",
    "3",
    "Qualifying rental period",
    rentalMonths,
    "Rent must be paid for at least half of 2025 on a California principal residence",
    {
      "Requirement met": rentalPeriodRequirementMet ? "yes" : "no",
    }
  );

  audit.record(
    "CA-540-RC",
    "4-5",
    "Dependent residence rule status",
    booleanValue(dependentResidenceRequirementMet),
    "Disallow if the taxpayer can be claimed as a dependent and lived in the claimant's home for more than half of the year",
    {
      "Can be claimed as dependent": input.canBeClaimedAsDependent ? "yes" : "no",
      "Lived with claimant more than half year": input.livedWithPersonWhoCanClaimDependentMoreThanHalfYear ? "yes" : "no",
    }
  );

  audit.record(
    "CA-540-RC",
    "6",
    "Property tax exemption rule status",
    booleanValue(propertyTaxRequirementMet),
    "Disallow tax-exempt rental property unless possessory interest taxes were paid on the rented property",
    {
      "Property tax exempt more than half year": input.rentedPropertyTaxExemptMoreThanHalfYear ? "yes" : "no",
      "Paid possessory interest tax": input.paidPossessoryInterestTaxOnRentingProperty ? "yes" : "no",
    }
  );

  audit.record(
    "CA-540-RC",
    "7-10",
    "Homeowner's property tax exemption rule status",
    booleanValue(homeownersExemptionRequirementMet),
    "Apply the homeowner's exemption disallowance and the separate-residence exception from the qualification record",
    {
      "Taxpayer claimed homeowner exemption": input.taxpayerClaimedHomeownersPropertyTaxExemption ? "yes" : "no",
      "Spouse claimed homeowner exemption": input.spouseClaimedHomeownersPropertyTaxExemption ? "yes" : "no",
      "Separate residences all year": input.livedApartFromSpouseEntireYear ? "yes" : "no",
      Rule: homeownersExemptionOutcome.rule,
    }
  );

  audit.record(
    "CA-540-RC",
    "11",
    "Question 11 renter's credit amount",
    question11CreditAmount,
    "If questions 1 through 10 qualify, use the supported filing-status amount and married-filing-separately election rule",
    {
      "Qualification status": qualifies ? "qualified" : `disqualified:${disqualificationReason}`,
      "Credit amount rule": qualifies ? creditAmountOutcome.rule : "disqualified",
    }
  );

  audit.record(
    "CA-540",
    "46",
    "Nonrefundable renter's credit",
    line46RentersCredit,
    "If all qualification questions pass, use question 11; otherwise enter 0",
    {
      "Qualification status": qualifies ? "qualified" : `disqualified:${disqualificationReason}`,
      "Credit amount rule": qualifies ? creditAmountOutcome.rule : "disqualified",
    }
  );

  return {
    filingStatus: input.filingStatus,
    californiaAgi,
    incomeLimit,
    residentRequirementMet,
    incomeRequirementMet,
    rentalPeriodRequirementMet,
    dependentResidenceRequirementMet,
    propertyTaxRequirementMet,
    homeownersExemptionRequirementMet,
    qualifies,
    disqualificationReason,
    creditAmountRule: qualifies ? creditAmountOutcome.rule : "disqualified",
    question11CreditAmount,
    line46RentersCredit,
    lines: audit.getLines(),
  };
}
