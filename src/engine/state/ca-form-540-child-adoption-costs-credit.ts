/**
 * California Form 540 Child Adoption Costs credit (code 197).
 * Spec: spec/state/ca-form-540-child-adoption-costs-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, max, min, roundDollar } from "@/utils/decimal.js";

export type CAForm540ChildAdoptionCostsCreditDisqualificationReason =
  | "adoption_not_final_in_tax_year"
  | "child_not_us_citizen_or_legal_resident"
  | "child_not_in_california_agency_or_political_subdivision_custody";

export interface CAForm540ChildAdoptionCostsCreditConstants {
  rate: Decimal;
  maxCurrentYearCredit: Decimal;
}

export const CA_FORM_540_CHILD_ADOPTION_COSTS_CREDIT_CONSTANTS: Record<
  number,
  CAForm540ChildAdoptionCostsCreditConstants
> = {
  2025: {
    rate: new Decimal(0.5),
    maxCurrentYearCredit: new Decimal(2500),
  },
};

export interface CAForm540ChildAdoptionCostsCreditInput {
  qualifiedAdoptionCosts: Decimal | string | number;
  adoptionDecreeFinalInTaxYear: boolean;
  childIsUsCitizenOrLegalResident: boolean;
  childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: boolean;
  taxYear: number;
}

export interface CAForm540ChildAdoptionCostsCreditResult {
  qualifiedAdoptionCosts: Decimal;
  qualifies: boolean;
  disqualificationReason?: CAForm540ChildAdoptionCostsCreditDisqualificationReason;
  line1QualifiedAdoptionCosts: Decimal;
  line2Rate: Decimal;
  line3CreditBeforeCap: Decimal;
  line4CurrentYearCredit: Decimal;
  line5CarryoverCredit: Decimal;
  maxCurrentYearCredit: Decimal;
  lines: CalculatedLine[];
}

function nonNegativeAmount(value: Decimal | string | number, description: string): Decimal {
  const amount = d(value);
  if (amount.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }

  return amount;
}

export function calculateCAForm540ChildAdoptionCostsCredit(
  input: CAForm540ChildAdoptionCostsCreditInput
): CAForm540ChildAdoptionCostsCreditResult {
  const constants = CA_FORM_540_CHILD_ADOPTION_COSTS_CREDIT_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`CA Form 540 Child Adoption Costs credit constants not available for ${input.taxYear}`);
  }

  const qualifiedAdoptionCosts = nonNegativeAmount(
    input.qualifiedAdoptionCosts,
    "CA Form 540 Child Adoption Costs qualified adoption costs"
  );

  let disqualificationReason: CAForm540ChildAdoptionCostsCreditDisqualificationReason | undefined;
  if (!input.adoptionDecreeFinalInTaxYear) {
    disqualificationReason = "adoption_not_final_in_tax_year";
  } else if (!input.childIsUsCitizenOrLegalResident) {
    disqualificationReason = "child_not_us_citizen_or_legal_resident";
  } else if (!input.childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision) {
    disqualificationReason = "child_not_in_california_agency_or_political_subdivision_custody";
  }

  const qualifies = disqualificationReason === undefined;
  const line1QualifiedAdoptionCosts = qualifiedAdoptionCosts;
  const line2Rate = constants.rate;
  const line3CreditBeforeCap = qualifies
    ? roundDollar(line1QualifiedAdoptionCosts.times(line2Rate))
    : new Decimal(0);
  const line4CurrentYearCredit = qualifies
    ? min(line3CreditBeforeCap, constants.maxCurrentYearCredit)
    : new Decimal(0);
  const line5CarryoverCredit = qualifies
    ? max(new Decimal(0), line3CreditBeforeCap.minus(constants.maxCurrentYearCredit))
    : new Decimal(0);

  const audit = new AuditTrail();
  audit.record(
    "CA-197",
    "1",
    "Qualified adoption costs",
    line1QualifiedAdoptionCosts,
    "Supported input for total qualified adoption costs for the eligible child"
  );
  audit.record(
    "CA-197",
    "2",
    "Credit percentage",
    line2Rate,
    "Use the published 2025 Child Adoption Costs credit percentage of 50%"
  );
  audit.record(
    "CA-197",
    "3",
    "Credit before the annual cap",
    line3CreditBeforeCap,
    qualifies
      ? "round(Line 1 × Line 2)"
      : "Taxpayer does not meet every Child Adoption Costs credit qualification requirement",
    {
      "Line 1": line1QualifiedAdoptionCosts,
      "Line 2": line2Rate.toString(),
      "Adoption decree became final during 2025": input.adoptionDecreeFinalInTaxYear ? "yes" : "no",
      "Child is a U.S. citizen or legal resident": input.childIsUsCitizenOrLegalResident ? "yes" : "no",
      "Child was in California agency or political subdivision custody":
        input.childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision ? "yes" : "no",
      "Qualification status": qualifies ? "qualified" : `disqualified:${disqualificationReason}`,
    }
  );
  audit.record(
    "CA-197",
    "4",
    "Current-year credit",
    line4CurrentYearCredit,
    "min(Line 3, $2,500)",
    {
      "Line 3": line3CreditBeforeCap,
      "Maximum current-year credit": constants.maxCurrentYearCredit,
    }
  );
  audit.record(
    "CA-197",
    "5",
    "Carryover to future years",
    line5CarryoverCredit,
    "max(0, Line 3 - $2,500)",
    {
      "Line 3": line3CreditBeforeCap,
      "Maximum current-year credit": constants.maxCurrentYearCredit,
    }
  );

  return {
    qualifiedAdoptionCosts,
    qualifies,
    disqualificationReason,
    line1QualifiedAdoptionCosts,
    line2Rate,
    line3CreditBeforeCap,
    line4CurrentYearCredit,
    line5CarryoverCredit,
    maxCurrentYearCredit: constants.maxCurrentYearCredit,
    lines: audit.getLines(),
  };
}
