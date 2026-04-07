/**
 * California FTB 3521 Low-Income Housing Credit upstream personal-filer slice.
 * Spec: spec/state/ca-ftb-3521-low-income-housing-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export type CAFTB3521CurrentYearCreditSource =
  | "ctcac_3521a"
  | "part_iii_line_20"
  | "taxpayer_certification";

export interface CAFTB3521PassThroughCreditInput {
  entityName: string;
  entityId?: string;
  buildingIdentificationNumber?: string;
  amount: Decimal | string | number;
}

export interface CAFTB3521LowIncomeHousingCreditInput {
  currentYearCredit?: Decimal | string | number;
  currentYearCreditSource?: CAFTB3521CurrentYearCreditSource;
  passThroughCredits?: CAFTB3521PassThroughCreditInput[];
  passiveActivityCreditIncludedOnLine4?: Decimal | string | number;
  allowablePassiveActivityCredit?: Decimal | string | number;
  priorYearCarryover?: Decimal | string | number;
  creditClaimedThisYear?: Decimal | string | number;
  taxYear: number;
}

export interface CAFTB3521LowIncomeHousingCreditResult {
  line2CurrentYearCredit: Decimal;
  line3PassThroughCredit: Decimal;
  line4CurrentYearLowIncomeHousingCredit: Decimal;
  line5PassiveActivityCreditIncludedOnLine4: Decimal;
  line6CurrentYearNonPassiveCredit: Decimal;
  line7AllowablePassiveActivityCredit: Decimal;
  line8PriorYearCarryover: Decimal;
  line9TotalCreditBeforeAllocation: Decimal;
  line10AllocatedToAffiliatedCorporations: Decimal;
  line11TotalAvailableCredit: Decimal;
  line12aCreditClaimedThisYear: Decimal;
  line12bAssignedCredit: Decimal;
  line12bAssignedCreditToAffiliatedCorporations: Decimal;
  line13CarryoverAvailableForFutureYears: Decimal;
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

export function calculateCAFTB3521LowIncomeHousingCredit(
  input: CAFTB3521LowIncomeHousingCreditInput
): CAFTB3521LowIncomeHousingCreditResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(
      `CA FTB 3521 Low-Income Housing Credit constants not available for ${input.taxYear}`
    );
  }

  const currentYearCreditSource = input.currentYearCreditSource ?? "taxpayer_certification";
  const line2CurrentYearCredit = nonNegativeAmount(
    input.currentYearCredit,
    "CA FTB 3521 line 2 current-year low-income housing credit"
  );
  const normalizedPassThroughCredits = (input.passThroughCredits ?? []).map((passThroughCredit, index) => {
    const entityName = passThroughCredit.entityName.trim();
    if (entityName.length === 0) {
      throw new Error(`CA FTB 3521 line 3 pass-through credit ${index + 1} entity name is required`);
    }

    return {
      entityName,
      entityId: passThroughCredit.entityId?.trim() ?? "",
      buildingIdentificationNumber: passThroughCredit.buildingIdentificationNumber?.trim() ?? "",
      amount: nonNegativeAmount(
        passThroughCredit.amount,
        `CA FTB 3521 line 3 pass-through credit ${index + 1} amount`
      ),
    };
  });

  const line3PassThroughCredit = sum(...normalizedPassThroughCredits.map((credit) => credit.amount));
  const line4CurrentYearLowIncomeHousingCredit = line2CurrentYearCredit.plus(line3PassThroughCredit);
  const line5PassiveActivityCreditIncludedOnLine4 = nonNegativeAmount(
    input.passiveActivityCreditIncludedOnLine4,
    "CA FTB 3521 line 5 passive activity credit included on line 4"
  );
  if (line5PassiveActivityCreditIncludedOnLine4.greaterThan(line4CurrentYearLowIncomeHousingCredit)) {
    throw new Error("CA FTB 3521 line 5 passive activity credit cannot exceed line 4");
  }

  const line6CurrentYearNonPassiveCredit = line4CurrentYearLowIncomeHousingCredit.minus(
    line5PassiveActivityCreditIncludedOnLine4
  );
  const line7AllowablePassiveActivityCredit = nonNegativeAmount(
    input.allowablePassiveActivityCredit,
    "CA FTB 3521 line 7 allowable passive activity credit"
  );
  if (line7AllowablePassiveActivityCredit.greaterThan(line5PassiveActivityCreditIncludedOnLine4)) {
    throw new Error("CA FTB 3521 line 7 allowable passive activity credit cannot exceed line 5");
  }

  const line8PriorYearCarryover = nonNegativeAmount(
    input.priorYearCarryover,
    "CA FTB 3521 line 8 prior-year carryover"
  );
  const line9TotalCreditBeforeAllocation = sum(
    line6CurrentYearNonPassiveCredit,
    line7AllowablePassiveActivityCredit,
    line8PriorYearCarryover
  );
  const line10AllocatedToAffiliatedCorporations = d(0);
  const line11TotalAvailableCredit = line9TotalCreditBeforeAllocation.minus(line10AllocatedToAffiliatedCorporations);
  const line12aCreditClaimedThisYear = nonNegativeAmount(
    input.creditClaimedThisYear,
    "CA FTB 3521 line 12a credit claimed this year"
  );
  const line12bAssignedCreditToAffiliatedCorporations = d(0);
  if (
    line12aCreditClaimedThisYear
      .plus(line12bAssignedCreditToAffiliatedCorporations)
      .greaterThan(line11TotalAvailableCredit)
  ) {
    throw new Error("CA FTB 3521 line 12a through line 12b total cannot exceed line 11 available credit");
  }

  const line13CarryoverAvailableForFutureYears = line11TotalAvailableCredit
    .minus(line12aCreditClaimedThisYear)
    .minus(line12bAssignedCreditToAffiliatedCorporations);

  const audit = new AuditTrail();
  audit.record(
    "CA-3521",
    "2",
    "Current-year low-income housing credit",
    line2CurrentYearCredit,
    "Supported upstream current-year low-income housing credit amount after the official smaller-of rule",
    {
      "Current-year credit source": currentYearCreditSource,
    }
  );
  audit.record(
    "CA-3521",
    "3",
    "Pass-through and affiliated-corporation low-income housing credit",
    line3PassThroughCredit,
    "Add the supported pass-through and affiliated-corporation low-income housing credit amounts",
    {
      "Pass-through entities": normalizedPassThroughCredits
        .map((credit) =>
          [
            credit.entityName,
            credit.entityId,
            credit.buildingIdentificationNumber,
          ].filter(Boolean).join(":")
        )
        .join(",") || "none",
    }
  );
  audit.record("CA-3521", "4", "Current-year low-income housing credit", line4CurrentYearLowIncomeHousingCredit, "Line 2 + Line 3", {
    "Line 2": line2CurrentYearCredit,
    "Line 3": line3PassThroughCredit,
  });
  audit.record(
    "CA-3521",
    "5",
    "Passive-activity portion of line 4",
    line5PassiveActivityCreditIncludedOnLine4,
    "Supported passive-activity low-income housing credit amount included on line 4",
    {
      "Line 4": line4CurrentYearLowIncomeHousingCredit,
    }
  );
  audit.record(
    "CA-3521",
    "6",
    "Current-year non-passive low-income housing credit",
    line6CurrentYearNonPassiveCredit,
    "Line 4 - Line 5",
    {
      "Line 4": line4CurrentYearLowIncomeHousingCredit,
      "Line 5": line5PassiveActivityCreditIncludedOnLine4,
    }
  );
  audit.record(
    "CA-3521",
    "7",
    "Allowable credit from passive activities",
    line7AllowablePassiveActivityCredit,
    "Supported allowable low-income housing credit from passive activities",
    {
      "Line 5": line5PassiveActivityCreditIncludedOnLine4,
    }
  );
  audit.record(
    "CA-3521",
    "8",
    "Low-income housing credit carryover from prior year",
    line8PriorYearCarryover,
    "Supported prior-year low-income housing credit carryover input"
  );
  audit.record(
    "CA-3521",
    "9",
    "Total low-income housing credit before affiliated-corporation allocations",
    line9TotalCreditBeforeAllocation,
    "Line 6 + Line 7 + Line 8",
    {
      "Line 6": line6CurrentYearNonPassiveCredit,
      "Line 7": line7AllowablePassiveActivityCredit,
      "Line 8": line8PriorYearCarryover,
    }
  );
  audit.record(
    "CA-3521",
    "10",
    "Credit allocated to affiliated corporations",
    line10AllocatedToAffiliatedCorporations,
    "0 for the supported personal-filer slice because affiliated-corporation allocations are unsupported"
  );
  audit.record(
    "CA-3521",
    "11",
    "Total available low-income housing credit",
    line11TotalAvailableCredit,
    "Line 9 - Line 10",
    {
      "Line 9": line9TotalCreditBeforeAllocation,
      "Line 10": line10AllocatedToAffiliatedCorporations,
    }
  );
  audit.record(
    "CA-3521",
    "12a",
    "Credit claimed on the current return",
    line12aCreditClaimedThisYear,
    "Supported current-return claim amount, including the Schedule P (540NR) used-this-year amount when this slice feeds Form 540NR line 60"
  );
  audit.record(
    "CA-3521",
    "12b",
    "Assigned credit to other corporations",
    line12bAssignedCreditToAffiliatedCorporations,
    "0 for the supported personal-filer slice because corporate assignment is unsupported"
  );
  audit.record(
    "CA-3521",
    "13",
    "Credit carryover available for future years",
    line13CarryoverAvailableForFutureYears,
    "Line 11 - Line 12a - Line 12b",
    {
      "Line 11": line11TotalAvailableCredit,
      "Line 12a": line12aCreditClaimedThisYear,
      "Line 12b": line12bAssignedCreditToAffiliatedCorporations,
    }
  );

  return {
    line2CurrentYearCredit,
    line3PassThroughCredit,
    line4CurrentYearLowIncomeHousingCredit,
    line5PassiveActivityCreditIncludedOnLine4,
    line6CurrentYearNonPassiveCredit,
    line7AllowablePassiveActivityCredit,
    line8PriorYearCarryover,
    line9TotalCreditBeforeAllocation,
    line10AllocatedToAffiliatedCorporations,
    line11TotalAvailableCredit,
    line12aCreditClaimedThisYear,
    line12bAssignedCredit: line12bAssignedCreditToAffiliatedCorporations,
    line12bAssignedCreditToAffiliatedCorporations,
    line13CarryoverAvailableForFutureYears,
    lines: audit.getLines(),
  };
}
