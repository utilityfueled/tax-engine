/**
 * California Form 540 Joint Custody Head of Household credit (code 170).
 * Spec: spec/state/ca-form-540-joint-custody-head-of-household-credit.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar } from "@/utils/decimal.js";

export type CAForm540JointCustodyHeadOfHouseholdCreditDisqualificationReason =
  | "filing_status_not_supported"
  | "marital_status_requirement_not_met"
  | "household_cost_requirement_not_met"
  | "qualifying_child_relationship_not_met"
  | "qualifying_day_range_not_met"
  | "custody_agreement_requirement_not_met"
  | "dependent_exemption_requirement_not_met";

export interface CAForm540JointCustodyHeadOfHouseholdCreditConstants {
  rate: Decimal;
  maxCredit: Decimal;
}

export const CA_FORM_540_JOINT_CUSTODY_HEAD_OF_HOUSEHOLD_CREDIT_CONSTANTS: Record<
  number,
  CAForm540JointCustodyHeadOfHouseholdCreditConstants
> = {
  2025: {
    rate: new Decimal(0.3),
    maxCredit: new Decimal(610),
  },
};

export interface CAForm540JointCustodyHeadOfHouseholdCreditInput {
  taxBeforeCredits: Decimal | string | number;
  filingStatus: FilingStatus;
  notMarriedOrRegisteredDomesticPartnerAtYearEnd: boolean;
  livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: boolean;
  furnishedOverOneHalfHomeCost: boolean;
  qualifyingChildRelationshipMet: boolean;
  qualifyingChildLivedInHomeDays: number;
  custodyAgreementProvidesMoreThanHalfYearInParentsHomes: boolean;
  qualifyingChildMarriedOrRegisteredDomesticPartner: boolean;
  entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: boolean;
  taxYear: number;
}

export interface CAForm540JointCustodyHeadOfHouseholdCreditResult {
  taxBeforeCredits: Decimal;
  filingStatus: FilingStatus;
  qualifies: boolean;
  disqualificationReason?: CAForm540JointCustodyHeadOfHouseholdCreditDisqualificationReason;
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

function disallowsJointCustodyCreditFilingStatus(filingStatus: FilingStatus): boolean {
  return (
    filingStatus === "married_filing_jointly"
    || filingStatus === "head_of_household"
    || filingStatus === "qualifying_surviving_spouse"
  );
}

export function calculateCAForm540JointCustodyHeadOfHouseholdCredit(
  input: CAForm540JointCustodyHeadOfHouseholdCreditInput
): CAForm540JointCustodyHeadOfHouseholdCreditResult {
  const constants = CA_FORM_540_JOINT_CUSTODY_HEAD_OF_HOUSEHOLD_CREDIT_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(
      `CA Form 540 Joint Custody Head of Household credit constants not available for ${input.taxYear}`
    );
  }

  const taxBeforeCredits = nonNegativeAmount(
    input.taxBeforeCredits,
    "CA Form 540 Joint Custody Head of Household credit tax before credits"
  );

  let disqualificationReason: CAForm540JointCustodyHeadOfHouseholdCreditDisqualificationReason | undefined;
  if (disallowsJointCustodyCreditFilingStatus(input.filingStatus)) {
    disqualificationReason = "filing_status_not_supported";
  } else if (
    !input.notMarriedOrRegisteredDomesticPartnerAtYearEnd
    && !(input.filingStatus === "married_filing_separately"
      && input.livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner)
  ) {
    disqualificationReason = "marital_status_requirement_not_met";
  } else if (!input.furnishedOverOneHalfHomeCost) {
    disqualificationReason = "household_cost_requirement_not_met";
  } else if (!input.qualifyingChildRelationshipMet) {
    disqualificationReason = "qualifying_child_relationship_not_met";
  } else if (input.qualifyingChildLivedInHomeDays < 146 || input.qualifyingChildLivedInHomeDays > 219) {
    disqualificationReason = "qualifying_day_range_not_met";
  } else if (!input.custodyAgreementProvidesMoreThanHalfYearInParentsHomes) {
    disqualificationReason = "custody_agreement_requirement_not_met";
  } else if (
    input.qualifyingChildMarriedOrRegisteredDomesticPartner
    && !input.entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner
  ) {
    disqualificationReason = "dependent_exemption_requirement_not_met";
  }

  const qualifies = disqualificationReason === undefined;
  const line1TaxBeforeCredits = taxBeforeCredits;
  const line2Rate = constants.rate;
  const line3CreditBeforeCap = qualifies ? roundDollar(line1TaxBeforeCredits.times(line2Rate)) : new Decimal(0);
  const line3Credit = qualifies ? min(line3CreditBeforeCap, constants.maxCredit) : new Decimal(0);

  const audit = new AuditTrail();
  audit.record(
    "CA-JCHH",
    "1",
    "Form 540 line 35 subtotal tax before credits",
    line1TaxBeforeCredits,
    "Supported input for Form 540 line 35 subtotal tax before credits"
  );
  audit.record(
    "CA-JCHH",
    "2",
    "Credit percentage",
    line2Rate,
    "Use the published 2025 Joint Custody Head of Household credit percentage of 30%"
  );
  audit.record(
    "CA-JCHH",
    "3",
    "Credit amount",
    line3Credit,
    qualifies
      ? "min(round(Line 1 × Line 2), $610)"
      : "Taxpayer does not meet every Joint Custody Head of Household credit qualification requirement",
    {
      "Line 1": line1TaxBeforeCredits,
      "Line 2": line2Rate.toString(),
      "Maximum credit": constants.maxCredit,
      "Filing status": input.filingStatus,
      "Not married or registered domestic partner at year end":
        input.notMarriedOrRegisteredDomesticPartnerAtYearEnd ? "yes" : "no",
      "Lived apart all year if married or registered domestic partner":
        input.livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner ? "yes" : "no",
      "Furnished over one-half home cost": input.furnishedOverOneHalfHomeCost ? "yes" : "no",
      "Qualifying child relationship requirement": input.qualifyingChildRelationshipMet ? "met" : "not_met",
      "Qualifying child lived in home days": input.qualifyingChildLivedInHomeDays.toString(),
      "Custody agreement requirement":
        input.custodyAgreementProvidesMoreThanHalfYearInParentsHomes ? "met" : "not_met",
      "Qualifying child married or registered domestic partner":
        input.qualifyingChildMarriedOrRegisteredDomesticPartner ? "yes" : "no",
      "Dependent exemption requirement if child married or registered domestic partner":
        input.entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner ? "met" : "not_met",
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
