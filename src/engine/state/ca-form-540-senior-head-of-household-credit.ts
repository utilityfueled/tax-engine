/**
 * California Form 540 Senior Head of Household credit (code 163).
 * Spec: spec/state/ca-form-540-senior-head-of-household-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar } from "@/utils/decimal.js";

export type CAForm540SeniorHeadOfHouseholdCreditDisqualificationReason =
  | "age_requirement_not_met"
  | "prior_head_of_household_requirement_not_met"
  | "agi_limit_exceeded";

export interface CAForm540SeniorHeadOfHouseholdCreditConstants {
  agiLimit: Decimal;
  rate: Decimal;
  maxCredit: Decimal;
}

export const CA_FORM_540_SENIOR_HEAD_OF_HOUSEHOLD_CREDIT_CONSTANTS: Record<
  number,
  CAForm540SeniorHeadOfHouseholdCreditConstants
> = {
  2025: {
    agiLimit: new Decimal(98652),
    rate: new Decimal(0.02),
    maxCredit: new Decimal(1860),
  },
};

export interface CAForm540SeniorHeadOfHouseholdCreditInput {
  taxableIncome: Decimal | string | number;
  agiForQualification: Decimal | string | number;
  age65OrOlderOnDecember31: boolean;
  qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: boolean;
  taxYear: number;
}

export interface CAForm540SeniorHeadOfHouseholdCreditResult {
  taxableIncome: Decimal;
  agiForQualification: Decimal;
  age65OrOlderOnDecember31: boolean;
  qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: boolean;
  agiLimit: Decimal;
  maxCredit: Decimal;
  qualifies: boolean;
  disqualificationReason?: CAForm540SeniorHeadOfHouseholdCreditDisqualificationReason;
  line1TaxableIncome: Decimal;
  line2Rate: Decimal;
  line3CreditBeforeCap: Decimal;
  line3Credit: Decimal;
  lines: CalculatedLine[];
}

function nonNegativeAmount(value: Decimal | string | number, description: string): Decimal {
  const amount = d(value);
  if (amount.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }

  return amount;
}

export function calculateCAForm540SeniorHeadOfHouseholdCredit(
  input: CAForm540SeniorHeadOfHouseholdCreditInput
): CAForm540SeniorHeadOfHouseholdCreditResult {
  const constants = CA_FORM_540_SENIOR_HEAD_OF_HOUSEHOLD_CREDIT_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`CA Form 540 Senior Head of Household credit constants not available for ${input.taxYear}`);
  }

  const taxableIncome = nonNegativeAmount(
    input.taxableIncome,
    "CA Form 540 Senior Head of Household credit taxable income"
  );
  const agiForQualification = nonNegativeAmount(
    input.agiForQualification,
    "CA Form 540 Senior Head of Household credit AGI"
  );

  let disqualificationReason: CAForm540SeniorHeadOfHouseholdCreditDisqualificationReason | undefined;
  if (!input.age65OrOlderOnDecember31) {
    disqualificationReason = "age_requirement_not_met";
  } else if (!input.qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath) {
    disqualificationReason = "prior_head_of_household_requirement_not_met";
  } else if (agiForQualification.greaterThan(constants.agiLimit)) {
    disqualificationReason = "agi_limit_exceeded";
  }

  const qualifies = disqualificationReason === undefined;
  const line1TaxableIncome = taxableIncome;
  const line2Rate = constants.rate;
  const line3CreditBeforeCap = qualifies ? roundDollar(line1TaxableIncome.times(line2Rate)) : new Decimal(0);
  const line3Credit = qualifies ? min(line3CreditBeforeCap, constants.maxCredit) : new Decimal(0);

  const audit = new AuditTrail();
  audit.record("CA-SHOH", "1", "Form 540 line 19 taxable income", line1TaxableIncome, "Supported input for Form 540 line 19 taxable income");
  audit.record("CA-SHOH", "2", "Credit percentage", line2Rate, "Use the published 2025 Senior Head of Household credit percentage of 2%");
  audit.record(
    "CA-SHOH",
    "3",
    "Credit amount",
    line3Credit,
    qualifies
      ? "min(round(Line 1 × Line 2), $1,860)"
      : "Taxpayer does not meet every Senior Head of Household credit qualification requirement",
    {
      "Line 1": line1TaxableIncome,
      "Line 2": line2Rate.toString(),
      "AGI for qualification": agiForQualification,
      "AGI limit": constants.agiLimit,
      "Maximum credit": constants.maxCredit,
      "Age 65 or older on December 31": input.age65OrOlderOnDecember31 ? "yes" : "no",
      "Prior head of household requirement":
        input.qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath ? "met" : "not_met",
      "Qualification status": qualifies ? "qualified" : `disqualified:${disqualificationReason}`,
    }
  );

  return {
    taxableIncome,
    agiForQualification,
    age65OrOlderOnDecember31: input.age65OrOlderOnDecember31,
    qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath:
      input.qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath,
    agiLimit: constants.agiLimit,
    maxCredit: constants.maxCredit,
    qualifies,
    disqualificationReason,
    line1TaxableIncome,
    line2Rate,
    line3CreditBeforeCap,
    line3Credit,
    lines: audit.getLines(),
  };
}
