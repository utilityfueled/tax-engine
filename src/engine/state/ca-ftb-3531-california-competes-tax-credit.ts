/**
 * California FTB 3531 California Competes Tax Credit upstream personal-filer slice.
 * Spec: spec/state/ca-ftb-3531-california-competes-tax-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface CAFTB3531CaliforniaCompetesAgreementCreditInput {
  agreementNumber: string;
  creditEarned: Decimal | string | number;
}

export interface CAFTB3531CaliforniaCompetesPassThroughCreditInput {
  agreementNumber: string;
  amount: Decimal | string | number;
  yearEarned: number;
}

export interface CAFTB3531CaliforniaCompetesTaxCreditInput {
  currentYearAgreementCredits?: CAFTB3531CaliforniaCompetesAgreementCreditInput[];
  passThroughCredits?: CAFTB3531CaliforniaCompetesPassThroughCreditInput[];
  priorYearCarryover?: Decimal | string | number;
  creditRecapture?: Decimal | string | number;
  previouslyUsedRecapturedCredit?: Decimal | string | number;
  taxYear: number;
}

export interface CAFTB3531CaliforniaCompetesTaxCreditResult {
  line1aAgreementCreditEarned: Decimal;
  line1bAgreementCreditEarned: Decimal;
  line2TotalCreditEarned: Decimal;
  line3CurrentYearCreditFromPartI: Decimal;
  line4aPassThroughCredit: Decimal;
  line5aCurrentYearCredit: Decimal;
  line6PriorYearCarryover: Decimal;
  line7TotalAvailableCredit: Decimal;
  line10aCreditRecapture: Decimal;
  line10bPreviouslyUsedRecapturedCredit: Decimal;
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

export function calculateCAFTB3531CaliforniaCompetesTaxCredit(
  input: CAFTB3531CaliforniaCompetesTaxCreditInput
): CAFTB3531CaliforniaCompetesTaxCreditResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(
      `CA FTB 3531 California Competes Tax Credit constants not available for ${input.taxYear}`
    );
  }

  const currentYearAgreementCredits = input.currentYearAgreementCredits ?? [];
  if (currentYearAgreementCredits.length > 2) {
    throw new Error(
      "CA FTB 3531 supports at most two current-year California Competes agreement credits on lines 1a and 1b"
    );
  }

  const normalizedAgreementCredits = currentYearAgreementCredits.map((agreement, index) => {
    const agreementNumber = agreement.agreementNumber.trim();
    if (agreementNumber.length === 0) {
      throw new Error(`CA FTB 3531 line 1${index === 0 ? "a" : "b"} agreement number is required`);
    }

    return {
      agreementNumber,
      creditEarned: nonNegativeAmount(
        agreement.creditEarned,
        `CA FTB 3531 line 1${index === 0 ? "a" : "b"} credit earned`
      ),
    };
  });

  const normalizedPassThroughCredits = (input.passThroughCredits ?? []).map((passThroughCredit, index) => {
    const agreementNumber = passThroughCredit.agreementNumber.trim();
    if (agreementNumber.length === 0) {
      throw new Error(`CA FTB 3531 line 4a pass-through credit ${index + 1} agreement number is required`);
    }

    return {
      agreementNumber,
      amount: nonNegativeAmount(
        passThroughCredit.amount,
        `CA FTB 3531 line 4a pass-through credit ${index + 1} amount`
      ),
      yearEarned: passThroughCredit.yearEarned,
    };
  });

  const line1aAgreementCreditEarned = normalizedAgreementCredits[0]?.creditEarned ?? d(0);
  const line1bAgreementCreditEarned = normalizedAgreementCredits[1]?.creditEarned ?? d(0);
  const line2TotalCreditEarned = line1aAgreementCreditEarned.plus(line1bAgreementCreditEarned);
  const line3CurrentYearCreditFromPartI = line2TotalCreditEarned;
  const line4aPassThroughCredit = sum(...normalizedPassThroughCredits.map((credit) => credit.amount));
  const line5aCurrentYearCredit = line3CurrentYearCreditFromPartI.plus(line4aPassThroughCredit);
  const line6PriorYearCarryover = nonNegativeAmount(
    input.priorYearCarryover,
    "CA FTB 3531 line 6 prior-year carryover"
  );
  const line7TotalAvailableCredit = line5aCurrentYearCredit.plus(line6PriorYearCarryover);
  const line10aCreditRecapture = nonNegativeAmount(
    input.creditRecapture,
    "CA FTB 3531 line 10a credit recapture"
  );
  const line10bPreviouslyUsedRecapturedCredit = nonNegativeAmount(
    input.previouslyUsedRecapturedCredit,
    "CA FTB 3531 line 10b previously used recaptured credit"
  );
  if (line10bPreviouslyUsedRecapturedCredit.greaterThan(line10aCreditRecapture)) {
    throw new Error(
      "CA FTB 3531 line 10b previously used recaptured credit cannot exceed line 10a recapture"
    );
  }

  const audit = new AuditTrail();
  audit.record(
    "CA-3531",
    "1a",
    "Current-year California Competes agreement credit earned",
    line1aAgreementCreditEarned,
    "Supported input for the first current-year California Competes agreement credit earned",
    {
      "Agreement number": normalizedAgreementCredits[0]?.agreementNumber ?? "none",
    }
  );
  audit.record(
    "CA-3531",
    "1b",
    "Current-year California Competes agreement credit earned",
    line1bAgreementCreditEarned,
    "Supported input for the second current-year California Competes agreement credit earned",
    {
      "Agreement number": normalizedAgreementCredits[1]?.agreementNumber ?? "none",
    }
  );
  audit.record("CA-3531", "2", "Total credit earned in 2025", line2TotalCreditEarned, "Line 1a + Line 1b", {
    "Line 1a": line1aAgreementCreditEarned,
    "Line 1b": line1bAgreementCreditEarned,
  });
  audit.record("CA-3531", "3", "Current-year credit from Part I", line3CurrentYearCreditFromPartI, "Copy line 2");
  audit.record(
    "CA-3531",
    "4a",
    "Pass-through California Competes Tax Credit",
    line4aPassThroughCredit,
    "Add the supported Schedule K-1 pass-through California Competes credit amounts",
    {
      "Pass-through agreements": normalizedPassThroughCredits
        .map((credit) => `${credit.agreementNumber}:${credit.yearEarned}`)
        .join(",") || "none",
    }
  );
  audit.record("CA-3531", "5a", "Current-year credit", line5aCurrentYearCredit, "Line 3 + Line 4a", {
    "Line 3": line3CurrentYearCreditFromPartI,
    "Line 4a": line4aPassThroughCredit,
  });
  audit.record(
    "CA-3531",
    "6",
    "Credit carryover from prior year(s)",
    line6PriorYearCarryover,
    "Supported prior-year California Competes credit carryover input"
  );
  audit.record(
    "CA-3531",
    "7",
    "Total available California Competes Tax Credit",
    line7TotalAvailableCredit,
    "Line 5a + Line 6",
    {
      "Line 5a": line5aCurrentYearCredit,
      "Line 6": line6PriorYearCarryover,
    }
  );
  audit.record(
    "CA-3531",
    "10a",
    "California Competes credit recapture",
    line10aCreditRecapture,
    "Supported California Competes credit recapture input"
  );
  audit.record(
    "CA-3531",
    "10b",
    "Previously used recaptured credit",
    line10bPreviouslyUsedRecapturedCredit,
    "Supported input for the portion of line 10a previously used on prior tax returns",
    {
      "Line 10a": line10aCreditRecapture,
    }
  );

  return {
    line1aAgreementCreditEarned,
    line1bAgreementCreditEarned,
    line2TotalCreditEarned,
    line3CurrentYearCreditFromPartI,
    line4aPassThroughCredit,
    line5aCurrentYearCredit,
    line6PriorYearCarryover,
    line7TotalAvailableCredit,
    line10aCreditRecapture,
    line10bPreviouslyUsedRecapturedCredit,
    lines: audit.getLines(),
  };
}
