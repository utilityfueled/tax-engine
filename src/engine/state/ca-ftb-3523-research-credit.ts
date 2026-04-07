/**
 * California FTB 3523 Research Credit upstream personal-filer carryover slice.
 * Spec: spec/state/ca-ftb-3523-research-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export type CAFTB3523CurrentYearCreditSourceLine = "17a" | "17b" | "31a" | "31b";

export interface CAFTB3523PassThroughCreditInput {
  entityName: string;
  entityId?: string;
  amount: Decimal | string | number;
}

export interface CAFTB3523ResearchCreditInput {
  currentYearNonPassiveResearchCredit?: Decimal | string | number;
  currentYearCreditSourceLine?: CAFTB3523CurrentYearCreditSourceLine;
  passThroughCredits?: CAFTB3523PassThroughCreditInput[];
  passiveActivityCreditIncludedOnLine32?: Decimal | string | number;
  allowablePassiveActivityCredit?: Decimal | string | number;
  priorYearNonPassiveCarryover?: Decimal | string | number;
  creditClaimedThisYear?: Decimal | string | number;
  electedRefundableCreditAmount?: Decimal | string | number;
  taxYear: number;
}

export interface CAFTB3523ResearchCreditResult {
  line32PassThroughCredit: Decimal;
  line33CurrentYearResearchCredit: Decimal;
  line34PassiveActivityCreditIncludedOnLine32: Decimal;
  line35CurrentYearNonPassiveResearchCredit: Decimal;
  line36AllowablePassiveActivityCredit: Decimal;
  line37PriorYearCarryoverOfNonPassiveResearchCredit: Decimal;
  line38TotalCreditAvailable: Decimal;
  line39CreditClaimedThisYear: Decimal;
  line40AssignedCreditToAffiliatedCorporations: Decimal;
  line41ElectedRefundableCreditAmount: Decimal;
  line42CarryoverAvailableForFutureYears: Decimal;
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

export function calculateCAFTB3523ResearchCredit(
  input: CAFTB3523ResearchCreditInput
): CAFTB3523ResearchCreditResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`CA FTB 3523 Research Credit constants not available for ${input.taxYear}`);
  }

  const currentYearNonPassiveResearchCredit = nonNegativeAmount(
    input.currentYearNonPassiveResearchCredit,
    "CA FTB 3523 supported current-year non-passive research credit"
  );
  const currentYearCreditSourceLine = input.currentYearCreditSourceLine ?? "17a";

  const normalizedPassThroughCredits = (input.passThroughCredits ?? []).map((passThroughCredit, index) => {
    const entityName = passThroughCredit.entityName.trim();
    if (entityName.length === 0) {
      throw new Error(`CA FTB 3523 line 32 pass-through credit ${index + 1} entity name is required`);
    }

    return {
      entityName,
      entityId: passThroughCredit.entityId?.trim() ?? "",
      amount: nonNegativeAmount(
        passThroughCredit.amount,
        `CA FTB 3523 line 32 pass-through credit ${index + 1} amount`
      ),
    };
  });

  const line32PassThroughCredit = sum(...normalizedPassThroughCredits.map((credit) => credit.amount));
  const line33CurrentYearResearchCredit = currentYearNonPassiveResearchCredit.plus(line32PassThroughCredit);
  const line34PassiveActivityCreditIncludedOnLine32 = nonNegativeAmount(
    input.passiveActivityCreditIncludedOnLine32,
    "CA FTB 3523 line 34 passive activity credit included on line 32"
  );
  if (line34PassiveActivityCreditIncludedOnLine32.greaterThan(line32PassThroughCredit)) {
    throw new Error("CA FTB 3523 line 34 passive activity credit cannot exceed line 32 pass-through credit");
  }

  const line35CurrentYearNonPassiveResearchCredit = line33CurrentYearResearchCredit.minus(
    line34PassiveActivityCreditIncludedOnLine32
  );
  const line36AllowablePassiveActivityCredit = nonNegativeAmount(
    input.allowablePassiveActivityCredit,
    "CA FTB 3523 line 36 allowable passive activity credit"
  );
  if (line36AllowablePassiveActivityCredit.greaterThan(line34PassiveActivityCreditIncludedOnLine32)) {
    throw new Error("CA FTB 3523 line 36 allowable passive activity credit cannot exceed line 34");
  }

  const line37PriorYearCarryoverOfNonPassiveResearchCredit = nonNegativeAmount(
    input.priorYearNonPassiveCarryover,
    "CA FTB 3523 line 37 prior-year carryover of non-passive research credit"
  );
  const line38TotalCreditAvailable = sum(
    line35CurrentYearNonPassiveResearchCredit,
    line36AllowablePassiveActivityCredit,
    line37PriorYearCarryoverOfNonPassiveResearchCredit
  );
  const line39CreditClaimedThisYear = nonNegativeAmount(
    input.creditClaimedThisYear,
    "CA FTB 3523 line 39 credit claimed this year"
  );
  const line40AssignedCreditToAffiliatedCorporations = d(0);
  const line41ElectedRefundableCreditAmount = nonNegativeAmount(
    input.electedRefundableCreditAmount,
    "CA FTB 3523 line 41 elected refundable credit amount"
  );
  if (
    line39CreditClaimedThisYear
      .plus(line40AssignedCreditToAffiliatedCorporations)
      .plus(line41ElectedRefundableCreditAmount)
      .greaterThan(line38TotalCreditAvailable)
  ) {
    throw new Error("CA FTB 3523 line 39 through line 41 total cannot exceed line 38 available credit");
  }

  const line42CarryoverAvailableForFutureYears = line38TotalCreditAvailable
    .minus(line39CreditClaimedThisYear)
    .minus(line40AssignedCreditToAffiliatedCorporations)
    .minus(line41ElectedRefundableCreditAmount);

  const audit = new AuditTrail();
  audit.record(
    "CA-3523",
    "32",
    "Pass-through research credit",
    line32PassThroughCredit,
    "Add the supported pass-through research credit amounts from Schedule K-1 or similar statements",
    {
      "Pass-through entities": normalizedPassThroughCredits
        .map((credit) => `${credit.entityName}${credit.entityId ? `:${credit.entityId}` : ""}`)
        .join(",") || "none",
    }
  );
  audit.record(
    "CA-3523",
    "33",
    "Current-year non-passive plus pass-through research credit",
    line33CurrentYearResearchCredit,
    "Supported upstream current-year non-passive research credit amount + Line 32",
    {
      "Supported current-year non-passive research credit": currentYearNonPassiveResearchCredit,
      "Current-year credit source line": currentYearCreditSourceLine,
      "Line 32": line32PassThroughCredit,
    }
  );
  audit.record(
    "CA-3523",
    "34",
    "Passive activity credit included on line 32",
    line34PassiveActivityCreditIncludedOnLine32,
    "Supported passive-activity portion of line 32 pass-through research credit",
    {
      "Line 32": line32PassThroughCredit,
    }
  );
  audit.record(
    "CA-3523",
    "35",
    "Current-year non-passive research credit",
    line35CurrentYearNonPassiveResearchCredit,
    "Line 33 - Line 34",
    {
      "Line 33": line33CurrentYearResearchCredit,
      "Line 34": line34PassiveActivityCreditIncludedOnLine32,
    }
  );
  audit.record(
    "CA-3523",
    "36",
    "Allowable credit from passive activities",
    line36AllowablePassiveActivityCredit,
    "Supported allowable passive-activity research credit amount",
    {
      "Line 34": line34PassiveActivityCreditIncludedOnLine32,
    }
  );
  audit.record(
    "CA-3523",
    "37",
    "Prior-year carryover of non-passive research credit",
    line37PriorYearCarryoverOfNonPassiveResearchCredit,
    "Supported prior-year non-passive research credit carryover input"
  );
  audit.record(
    "CA-3523",
    "38",
    "Total research credit available",
    line38TotalCreditAvailable,
    "Line 35 + Line 36 + Line 37",
    {
      "Line 35": line35CurrentYearNonPassiveResearchCredit,
      "Line 36": line36AllowablePassiveActivityCredit,
      "Line 37": line37PriorYearCarryoverOfNonPassiveResearchCredit,
    }
  );
  audit.record(
    "CA-3523",
    "39",
    "Research credit claimed this year",
    line39CreditClaimedThisYear,
    "Supported current-return claim amount, including the Schedule P (540NR) used-this-year amount when this slice feeds Form 540NR line 60"
  );
  audit.record(
    "CA-3523",
    "40",
    "Assigned credit to affiliated corporations",
    line40AssignedCreditToAffiliatedCorporations,
    "0 for the supported personal-filer slice because corporate assignment is unsupported"
  );
  audit.record(
    "CA-3523",
    "41",
    "Elected refundable research credit amount",
    line41ElectedRefundableCreditAmount,
    "Supported elected refundable amount excluded from future carryover"
  );
  audit.record(
    "CA-3523",
    "42",
    "Research credit carryover available for future years",
    line42CarryoverAvailableForFutureYears,
    "Line 38 - Line 39 - Line 40 - Line 41",
    {
      "Line 38": line38TotalCreditAvailable,
      "Line 39": line39CreditClaimedThisYear,
      "Line 40": line40AssignedCreditToAffiliatedCorporations,
      "Line 41": line41ElectedRefundableCreditAmount,
    }
  );

  return {
    line32PassThroughCredit,
    line33CurrentYearResearchCredit,
    line34PassiveActivityCreditIncludedOnLine32,
    line35CurrentYearNonPassiveResearchCredit,
    line36AllowablePassiveActivityCredit,
    line37PriorYearCarryoverOfNonPassiveResearchCredit,
    line38TotalCreditAvailable,
    line39CreditClaimedThisYear,
    line40AssignedCreditToAffiliatedCorporations,
    line41ElectedRefundableCreditAmount,
    line42CarryoverAvailableForFutureYears,
    lines: audit.getLines(),
  };
}
