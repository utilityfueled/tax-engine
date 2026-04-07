/**
 * California FTB 3503 Natural Heritage Preservation Credit upstream personal-filer slice.
 * Spec: spec/state/ca-ftb-3503-natural-heritage-preservation-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface CAFTB3503NaturalHeritagePreservationPassThroughCreditInput {
  entityName: string;
  entityId?: string;
  amount: Decimal | string | number;
}

export interface CAFTB3503NaturalHeritagePreservationCreditInput {
  fairMarketValue?: Decimal | string | number;
  passThroughCredits?: CAFTB3503NaturalHeritagePreservationPassThroughCreditInput[];
  priorYearCarryover?: Decimal | string | number;
  creditClaimedThisYear?: Decimal | string | number;
  electedRefundableCreditAmount?: Decimal | string | number;
  taxYear: number;
}

export interface CAFTB3503NaturalHeritagePreservationCreditResult {
  line1FairMarketValue: Decimal;
  line2CurrentYearCredit: Decimal;
  line3PassThroughCredit: Decimal;
  line4TotalCurrentYearCredit: Decimal;
  line5PriorYearCarryover: Decimal;
  line6TotalAvailableCredit: Decimal;
  line7aCreditClaimedThisYear: Decimal;
  line7bAssignedCreditToAffiliatedCorporations: Decimal;
  line7cElectedRefundableCreditAmount: Decimal;
  line8CarryoverAvailableForFutureYears: Decimal;
  lines: CalculatedLine[];
}

const SUPPORTED_TAX_YEARS = new Set([2025]);
const NATURAL_HERITAGE_CREDIT_RATE = new Decimal("0.55");

function nonNegativeAmount(
  value: Decimal | string | number | undefined,
  description: string
): Decimal {
  const amount = d(value);
  if (amount.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }

  return amount;
}

export function calculateCAFTB3503NaturalHeritagePreservationCredit(
  input: CAFTB3503NaturalHeritagePreservationCreditInput
): CAFTB3503NaturalHeritagePreservationCreditResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(
      `CA FTB 3503 Natural Heritage Preservation Credit constants not available for ${input.taxYear}`
    );
  }

  const line1FairMarketValue = nonNegativeAmount(
    input.fairMarketValue,
    "CA FTB 3503 line 1 fair market value"
  );
  const normalizedPassThroughCredits = (input.passThroughCredits ?? []).map((passThroughCredit, index) => {
    const entityName = passThroughCredit.entityName.trim();
    if (entityName.length === 0) {
      throw new Error(`CA FTB 3503 line 3 pass-through credit ${index + 1} entity name is required`);
    }

    return {
      entityName,
      entityId: passThroughCredit.entityId?.trim() ?? "",
      amount: nonNegativeAmount(
        passThroughCredit.amount,
        `CA FTB 3503 line 3 pass-through credit ${index + 1} amount`
      ),
    };
  });

  const line2CurrentYearCredit = line1FairMarketValue.times(NATURAL_HERITAGE_CREDIT_RATE);
  const line3PassThroughCredit = sum(...normalizedPassThroughCredits.map((credit) => credit.amount));
  const line4TotalCurrentYearCredit = line2CurrentYearCredit.plus(line3PassThroughCredit);
  const line5PriorYearCarryover = nonNegativeAmount(
    input.priorYearCarryover,
    "CA FTB 3503 line 5 prior-year carryover"
  );
  const line6TotalAvailableCredit = line4TotalCurrentYearCredit.plus(line5PriorYearCarryover);
  const line7aCreditClaimedThisYear = nonNegativeAmount(
    input.creditClaimedThisYear,
    "CA FTB 3503 line 7a credit claimed this year"
  );
  const line7bAssignedCreditToAffiliatedCorporations = d(0);
  const line7cElectedRefundableCreditAmount = nonNegativeAmount(
    input.electedRefundableCreditAmount,
    "CA FTB 3503 line 7c elected refundable credit amount"
  );
  if (
    line7aCreditClaimedThisYear
      .plus(line7bAssignedCreditToAffiliatedCorporations)
      .plus(line7cElectedRefundableCreditAmount)
      .greaterThan(line6TotalAvailableCredit)
  ) {
    throw new Error("CA FTB 3503 line 7a through line 7c total cannot exceed line 6 available credit");
  }

  const line8CarryoverAvailableForFutureYears = line6TotalAvailableCredit
    .minus(line7aCreditClaimedThisYear)
    .minus(line7bAssignedCreditToAffiliatedCorporations)
    .minus(line7cElectedRefundableCreditAmount);

  const audit = new AuditTrail();
  audit.record(
    "CA-3503",
    "1",
    "Approved fair market value of the qualified contribution",
    line1FairMarketValue,
    "Supported fair market value from the Wildlife Conservation Board certificate"
  );
  audit.record(
    "CA-3503",
    "2",
    "Current-year Natural Heritage Preservation Credit",
    line2CurrentYearCredit,
    "Line 1 × 55%",
    {
      "Line 1": line1FairMarketValue,
    }
  );
  audit.record(
    "CA-3503",
    "3",
    "Pass-through Natural Heritage Preservation Credit",
    line3PassThroughCredit,
    "Add the supported pass-through Natural Heritage Preservation Credit amounts from Schedule K-1 or similar statements",
    {
      "Pass-through entities": normalizedPassThroughCredits
        .map((credit) => `${credit.entityName}${credit.entityId ? `:${credit.entityId}` : ""}`)
        .join(",") || "none",
    }
  );
  audit.record(
    "CA-3503",
    "4",
    "Total current-year Natural Heritage Preservation Credit",
    line4TotalCurrentYearCredit,
    "Line 2 + Line 3",
    {
      "Line 2": line2CurrentYearCredit,
      "Line 3": line3PassThroughCredit,
    }
  );
  audit.record(
    "CA-3503",
    "5",
    "Credit carryover from prior year",
    line5PriorYearCarryover,
    "Supported prior-year Natural Heritage Preservation Credit carryover input"
  );
  audit.record(
    "CA-3503",
    "6",
    "Total available Natural Heritage Preservation Credit",
    line6TotalAvailableCredit,
    "Line 4 + Line 5",
    {
      "Line 4": line4TotalCurrentYearCredit,
      "Line 5": line5PriorYearCarryover,
    }
  );
  audit.record(
    "CA-3503",
    "7a",
    "Natural Heritage Preservation Credit claimed this year",
    line7aCreditClaimedThisYear,
    "Supported current-return claim amount, including the Schedule P (540NR) used-this-year amount when this slice feeds Form 540NR line 60"
  );
  audit.record(
    "CA-3503",
    "7b",
    "Assigned credit to affiliated corporations",
    line7bAssignedCreditToAffiliatedCorporations,
    "0 for the supported personal-filer slice because corporate assignment is unsupported"
  );
  audit.record(
    "CA-3503",
    "7c",
    "Elected refundable Natural Heritage Preservation Credit amount",
    line7cElectedRefundableCreditAmount,
    "Supported elected refundable amount excluded from future carryover"
  );
  audit.record(
    "CA-3503",
    "8",
    "Natural Heritage Preservation Credit carryover available for future years",
    line8CarryoverAvailableForFutureYears,
    "Line 6 - Line 7a - Line 7b - Line 7c",
    {
      "Line 6": line6TotalAvailableCredit,
      "Line 7a": line7aCreditClaimedThisYear,
      "Line 7b": line7bAssignedCreditToAffiliatedCorporations,
      "Line 7c": line7cElectedRefundableCreditAmount,
    }
  );

  return {
    line1FairMarketValue,
    line2CurrentYearCredit,
    line3PassThroughCredit,
    line4TotalCurrentYearCredit,
    line5PriorYearCarryover,
    line6TotalAvailableCredit,
    line7aCreditClaimedThisYear,
    line7bAssignedCreditToAffiliatedCorporations,
    line7cElectedRefundableCreditAmount,
    line8CarryoverAvailableForFutureYears,
    lines: audit.getLines(),
  };
}
