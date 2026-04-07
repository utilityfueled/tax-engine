/**
 * California FTB 3592 College Access Tax Credit upstream personal-filer slice.
 * Spec: spec/state/ca-ftb-3592-college-access-tax-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface CAFTB3592CollegeAccessPassThroughCreditInput {
  entityName: string;
  entityId?: string;
  amount: Decimal | string | number;
}

export interface CAFTB3592CollegeAccessTaxCreditInput {
  certificateNumber?: string;
  certificateCreditAmount?: Decimal | string | number;
  passThroughCredits?: CAFTB3592CollegeAccessPassThroughCreditInput[];
  priorYearCarryover?: Decimal | string | number;
  creditClaimedThisYear?: Decimal | string | number;
  electedRefundableCreditAmount?: Decimal | string | number;
  taxYear: number;
}

export interface CAFTB3592CollegeAccessTaxCreditResult {
  line1aCertificateCreditAmount: Decimal;
  line2PassThroughCredit: Decimal;
  line3CurrentYearCredit: Decimal;
  line4PriorYearCarryover: Decimal;
  line5TotalAvailableCredit: Decimal;
  line6aCreditClaimedThisYear: Decimal;
  line6bAssignedCreditToAffiliatedCorporations: Decimal;
  line6cElectedRefundableCreditAmount: Decimal;
  line7CarryoverAvailableForFutureYears: Decimal;
  lines: CalculatedLine[];
}

const SUPPORTED_TAX_YEARS = new Set([2025]);

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

export function calculateCAFTB3592CollegeAccessTaxCredit(
  input: CAFTB3592CollegeAccessTaxCreditInput
): CAFTB3592CollegeAccessTaxCreditResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(
      `CA FTB 3592 College Access Tax Credit constants not available for ${input.taxYear}`
    );
  }

  const certificateCreditAmount = nonNegativeAmount(
    input.certificateCreditAmount,
    "CA FTB 3592 line 1a certificate credit amount"
  );
  const certificateNumber = input.certificateNumber?.trim() ?? "";
  if (certificateCreditAmount.greaterThan(0) && certificateNumber.length === 0) {
    throw new Error("CA FTB 3592 line 1b certificate number is required when line 1a has a credit amount");
  }

  const normalizedPassThroughCredits = (input.passThroughCredits ?? []).map((passThroughCredit, index) => {
    const entityName = passThroughCredit.entityName.trim();
    if (entityName.length === 0) {
      throw new Error(`CA FTB 3592 line 2 pass-through credit ${index + 1} entity name is required`);
    }

    return {
      entityName,
      entityId: passThroughCredit.entityId?.trim() ?? "",
      amount: nonNegativeAmount(
        passThroughCredit.amount,
        `CA FTB 3592 line 2 pass-through credit ${index + 1} amount`
      ),
    };
  });

  const line1aCertificateCreditAmount = certificateCreditAmount;
  const line2PassThroughCredit = sum(...normalizedPassThroughCredits.map((credit) => credit.amount));
  const line3CurrentYearCredit = line1aCertificateCreditAmount.plus(line2PassThroughCredit);
  const line4PriorYearCarryover = nonNegativeAmount(
    input.priorYearCarryover,
    "CA FTB 3592 line 4 prior-year carryover"
  );
  const line5TotalAvailableCredit = line3CurrentYearCredit.plus(line4PriorYearCarryover);
  const line6aCreditClaimedThisYear = nonNegativeAmount(
    input.creditClaimedThisYear,
    "CA FTB 3592 line 6a credit claimed this year"
  );
  const line6bAssignedCreditToAffiliatedCorporations = d(0);
  const line6cElectedRefundableCreditAmount = nonNegativeAmount(
    input.electedRefundableCreditAmount,
    "CA FTB 3592 line 6c elected refundable credit amount"
  );
  if (
    line6aCreditClaimedThisYear
      .plus(line6bAssignedCreditToAffiliatedCorporations)
      .plus(line6cElectedRefundableCreditAmount)
      .greaterThan(line5TotalAvailableCredit)
  ) {
    throw new Error("CA FTB 3592 line 6a through line 6c total cannot exceed line 5 available credit");
  }

  const line7CarryoverAvailableForFutureYears = line5TotalAvailableCredit
    .minus(line6aCreditClaimedThisYear)
    .minus(line6bAssignedCreditToAffiliatedCorporations)
    .minus(line6cElectedRefundableCreditAmount);

  const audit = new AuditTrail();
  audit.record(
    "CA-3592",
    "1a",
    "Current-year College Access Tax Credit certificate amount",
    line1aCertificateCreditAmount,
    "Supported input from the current-year College Access Tax Credit Certificate",
    {
      "Certificate number": certificateNumber || "none",
    }
  );
  audit.record(
    "CA-3592",
    "2",
    "Pass-through College Access Tax Credit",
    line2PassThroughCredit,
    "Add the supported Schedule K-1 or K-1 equivalent College Access Tax Credit amounts",
    {
      "Pass-through entities": normalizedPassThroughCredits
        .map((credit) => `${credit.entityName}${credit.entityId ? `:${credit.entityId}` : ""}`)
        .join(",") || "none",
    }
  );
  audit.record("CA-3592", "3", "Total current-year College Access Tax Credit", line3CurrentYearCredit, "Line 1a + Line 2", {
    "Line 1a": line1aCertificateCreditAmount,
    "Line 2": line2PassThroughCredit,
  });
  audit.record(
    "CA-3592",
    "4",
    "Credit carryover from prior year",
    line4PriorYearCarryover,
    "Supported prior-year College Access Tax Credit carryover input"
  );
  audit.record("CA-3592", "5", "Total available College Access Tax Credit", line5TotalAvailableCredit, "Line 3 + Line 4", {
    "Line 3": line3CurrentYearCredit,
    "Line 4": line4PriorYearCarryover,
  });
  audit.record(
    "CA-3592",
    "6a",
    "College Access Tax Credit claimed this year",
    line6aCreditClaimedThisYear,
    "Supported current-return claim amount, including the Schedule P (540NR) used-this-year amount when this slice feeds Form 540NR line 60"
  );
  audit.record(
    "CA-3592",
    "6b",
    "Assigned credit to affiliated corporations",
    line6bAssignedCreditToAffiliatedCorporations,
    "0 for the supported personal-filer slice because corporate assignment is unsupported"
  );
  audit.record(
    "CA-3592",
    "6c",
    "Elected refundable College Access Tax Credit amount",
    line6cElectedRefundableCreditAmount,
    "Supported elected refundable amount excluded from future carryover"
  );
  audit.record(
    "CA-3592",
    "7",
    "College Access Tax Credit carryover available for future years",
    line7CarryoverAvailableForFutureYears,
    "Line 5 - Line 6a - Line 6b - Line 6c",
    {
      "Line 5": line5TotalAvailableCredit,
      "Line 6a": line6aCreditClaimedThisYear,
      "Line 6b": line6bAssignedCreditToAffiliatedCorporations,
      "Line 6c": line6cElectedRefundableCreditAmount,
    }
  );

  return {
    line1aCertificateCreditAmount,
    line2PassThroughCredit,
    line3CurrentYearCredit,
    line4PriorYearCarryover,
    line5TotalAvailableCredit,
    line6aCreditClaimedThisYear,
    line6bAssignedCreditToAffiliatedCorporations,
    line6cElectedRefundableCreditAmount,
    line7CarryoverAvailableForFutureYears,
    lines: audit.getLines(),
  };
}
