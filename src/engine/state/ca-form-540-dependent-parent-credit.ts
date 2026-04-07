/**
 * California Form 540 Dependent Parent credit (code 173).
 * Spec: spec/state/ca-form-540-dependent-parent-credit.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar } from "@/utils/decimal.js";

export type CAForm540DependentParentCreditDisqualificationReason =
  | "filing_status_not_married_filing_separately"
  | "marital_status_requirement_not_met"
  | "last_six_months_household_requirement_not_met"
  | "household_expense_requirement_not_met";

export interface CAForm540DependentParentCreditConstants {
  rate: Decimal;
  maxCredit: Decimal;
}

export const CA_FORM_540_DEPENDENT_PARENT_CREDIT_CONSTANTS: Record<
  number,
  CAForm540DependentParentCreditConstants
> = {
  2025: {
    rate: new Decimal(0.3),
    maxCredit: new Decimal(610),
  },
};

export interface CAForm540DependentParentCreditInput {
  taxBeforeCredits: Decimal | string | number;
  filingStatus: FilingStatus;
  marriedOrRegisteredDomesticPartnerAtYearEnd: boolean;
  spouseOrRdpNotMemberOfHouseholdDuringLastSixMonths: boolean;
  furnishedOverOneHalfDependentParentHouseholdExpenses: boolean;
  taxYear: number;
}

export interface CAForm540DependentParentCreditResult {
  taxBeforeCredits: Decimal;
  filingStatus: FilingStatus;
  qualifies: boolean;
  disqualificationReason?: CAForm540DependentParentCreditDisqualificationReason;
  line1TaxBeforeCredits: Decimal;
  line2Rate: Decimal;
  line3CreditBeforeCap: Decimal;
  line3Credit: Decimal;
  maxCredit: Decimal;
  lines: CalculatedLine[];
}

function nonNegativeAmount(value: Decimal | string | number, description: string): Decimal {
  const amount = d(value);
  if (amount.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }

  return amount;
}

export function calculateCAForm540DependentParentCredit(
  input: CAForm540DependentParentCreditInput
): CAForm540DependentParentCreditResult {
  const constants = CA_FORM_540_DEPENDENT_PARENT_CREDIT_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`CA Form 540 Dependent Parent credit constants not available for ${input.taxYear}`);
  }

  const taxBeforeCredits = nonNegativeAmount(
    input.taxBeforeCredits,
    "CA Form 540 Dependent Parent credit tax before credits"
  );

  let disqualificationReason: CAForm540DependentParentCreditDisqualificationReason | undefined;
  if (input.filingStatus !== "married_filing_separately") {
    disqualificationReason = "filing_status_not_married_filing_separately";
  } else if (!input.marriedOrRegisteredDomesticPartnerAtYearEnd) {
    disqualificationReason = "marital_status_requirement_not_met";
  } else if (!input.spouseOrRdpNotMemberOfHouseholdDuringLastSixMonths) {
    disqualificationReason = "last_six_months_household_requirement_not_met";
  } else if (!input.furnishedOverOneHalfDependentParentHouseholdExpenses) {
    disqualificationReason = "household_expense_requirement_not_met";
  }

  const qualifies = disqualificationReason === undefined;
  const line1TaxBeforeCredits = taxBeforeCredits;
  const line2Rate = constants.rate;
  const line3CreditBeforeCap = qualifies ? roundDollar(line1TaxBeforeCredits.times(line2Rate)) : new Decimal(0);
  const line3Credit = qualifies ? min(line3CreditBeforeCap, constants.maxCredit) : new Decimal(0);

  const audit = new AuditTrail();
  audit.record(
    "CA-DPC",
    "1",
    "Form 540 line 35 subtotal tax before credits",
    line1TaxBeforeCredits,
    "Supported input for Form 540 line 35 subtotal tax before credits"
  );
  audit.record(
    "CA-DPC",
    "2",
    "Credit percentage",
    line2Rate,
    "Use the published 2025 Dependent Parent credit percentage of 30%"
  );
  audit.record(
    "CA-DPC",
    "3",
    "Credit amount",
    line3Credit,
    qualifies
      ? "min(round(Line 1 × Line 2), $610)"
      : "Taxpayer does not meet every Dependent Parent credit qualification requirement",
    {
      "Line 1": line1TaxBeforeCredits,
      "Line 2": line2Rate.toString(),
      "Maximum credit": constants.maxCredit,
      "Filing status": input.filingStatus,
      "Married or registered domestic partner at year end":
        input.marriedOrRegisteredDomesticPartnerAtYearEnd ? "yes" : "no",
      "Spouse or registered domestic partner not in household during last six months":
        input.spouseOrRdpNotMemberOfHouseholdDuringLastSixMonths ? "yes" : "no",
      "Furnished over one-half dependent parent household expenses":
        input.furnishedOverOneHalfDependentParentHouseholdExpenses ? "yes" : "no",
      "Qualification status": qualifies ? "qualified" : `disqualified:${disqualificationReason}`,
    }
  );

  return {
    taxBeforeCredits,
    filingStatus: input.filingStatus,
    qualifies,
    disqualificationReason,
    line1TaxBeforeCredits,
    line2Rate,
    line3CreditBeforeCap,
    line3Credit,
    maxCredit: constants.maxCredit,
    lines: audit.getLines(),
  };
}
