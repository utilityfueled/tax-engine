/**
 * Form 8880 saver's credit.
 * Spec: spec/federal/form-8880.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus } from "@/models/constants.js";
import type { Form8880Input, W2 } from "@/models/inputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

export interface Form8880CalculationInput {
  filingStatus: FilingStatus;
  agi: string | Decimal;
  taxYear: number;
  primaryDateOfBirth: string;
  spouseDateOfBirth?: string;
  primaryElectiveDeferrals?: string | Decimal;
  primaryIraContributions?: string | Decimal;
  primaryAbleContributions?: string | Decimal;
  primaryRecentDistributions?: string | Decimal;
  primaryIsFullTimeStudent?: boolean;
  primaryCanBeClaimedAsDependent?: boolean;
  spouseElectiveDeferrals?: string | Decimal;
  spouseIraContributions?: string | Decimal;
  spouseAbleContributions?: string | Decimal;
  spouseRecentDistributions?: string | Decimal;
  spouseIsFullTimeStudent?: boolean;
  spouseCanBeClaimedAsDependent?: boolean;
  supportedW2PrimaryElectiveDeferrals?: string | Decimal;
  supportedW2SpouseElectiveDeferrals?: string | Decimal;
  taxLiabilityBeforeCredit: string | Decimal;
  priorNonrefundableCredits: string | Decimal;
}

export interface Form8880Result {
  line1a: Decimal;
  line1b: Decimal;
  line2a: Decimal;
  line2b: Decimal;
  line3a: Decimal;
  line3b: Decimal;
  line4a: Decimal;
  line4b: Decimal;
  line5a: Decimal;
  line5b: Decimal;
  line6a: Decimal;
  line6b: Decimal;
  line7: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  lines: CalculatedLine[];
}

const MAX_ELIGIBLE_CONTRIBUTION = new Decimal(2000);
const SUPPORTED_W2_RETIREMENT_CONTRIBUTION_FIELDS = [
  "box12CodeD",
  "box12CodeE",
  "box12CodeF",
  "box12CodeG",
  "box12CodeH",
  "box12CodeS",
  "box12CodeAA",
  "box12CodeBB",
  "box12CodeEE",
] as const satisfies readonly (keyof W2)[];

export function mergeW2RetirementContributionsIntoForm8880Input(
  input: Form8880Input | undefined,
  w2s: W2[] = [],
  filingStatus?: FilingStatus
): Form8880Input | undefined {
  if (!input) {
    return undefined;
  }

  const isJointReturn = filingStatus === "married_filing_jointly";
  const hasTaggedRetirementContributions = w2s.some(
    (w2) => w2.accountHolder !== undefined && getSupportedW2RetirementContributionAmount(w2).greaterThan(0)
  );

  const supportedW2PrimaryElectiveDeferrals = sum(
    ...w2s
      .filter((w2) => shouldIncludeSupportedW2RetirementContribution(w2, "primary", isJointReturn, hasTaggedRetirementContributions))
      .map(getSupportedW2RetirementContributionAmount)
  );
  const supportedW2SpouseElectiveDeferrals = isJointReturn
    ? sum(
      ...w2s
        .filter((w2) => shouldIncludeSupportedW2RetirementContribution(w2, "spouse", isJointReturn, hasTaggedRetirementContributions))
        .map(getSupportedW2RetirementContributionAmount)
    )
    : new Decimal(0);

  return {
    ...input,
    supportedW2PrimaryElectiveDeferrals: supportedW2PrimaryElectiveDeferrals.toString(),
    supportedW2SpouseElectiveDeferrals: supportedW2SpouseElectiveDeferrals.toString(),
  };
}

export function calculateForm8880(input: Form8880CalculationInput): Form8880Result {
  const audit = new AuditTrail();
  const hasSpouseColumn = input.filingStatus === "married_filing_jointly";
  const validatedPrimaryElectiveDeferrals = input.primaryElectiveDeferrals === undefined
    ? undefined
    : zeroFloor(d(input.primaryElectiveDeferrals));
  const validatedSpouseElectiveDeferrals = input.spouseElectiveDeferrals === undefined
    ? undefined
    : zeroFloor(d(input.spouseElectiveDeferrals));
  const supportedW2PrimaryElectiveDeferrals = zeroFloor(d(input.supportedW2PrimaryElectiveDeferrals));
  const supportedW2SpouseElectiveDeferrals = zeroFloor(d(input.supportedW2SpouseElectiveDeferrals));
  const primaryEligible = isEligibleSaverCreditPerson(
    input.primaryDateOfBirth,
    input.taxYear,
    input.primaryIsFullTimeStudent ?? false,
    input.primaryCanBeClaimedAsDependent ?? false
  );
  const spouseEligible = hasSpouseColumn
    && input.spouseDateOfBirth !== undefined
    && isEligibleSaverCreditPerson(
      input.spouseDateOfBirth,
      input.taxYear,
      input.spouseIsFullTimeStudent ?? false,
      input.spouseCanBeClaimedAsDependent ?? false
    );

  const line1a = zeroFloor(d(input.primaryIraContributions)).plus(zeroFloor(d(input.primaryAbleContributions)));
  const line1b = hasSpouseColumn
    ? zeroFloor(d(input.spouseIraContributions)).plus(zeroFloor(d(input.spouseAbleContributions)))
    : new Decimal(0);
  const line2a = validatedPrimaryElectiveDeferrals ?? supportedW2PrimaryElectiveDeferrals;
  const line2b = hasSpouseColumn
    ? validatedSpouseElectiveDeferrals ?? supportedW2SpouseElectiveDeferrals
    : new Decimal(0);
  const line3a = line1a.plus(line2a);
  const line3b = line1b.plus(line2b);
  const line4a = zeroFloor(d(input.primaryRecentDistributions));
  const line4b = hasSpouseColumn ? zeroFloor(d(input.spouseRecentDistributions)) : new Decimal(0);
  const line5a = zeroFloor(line3a.minus(line4a));
  const line5b = hasSpouseColumn ? zeroFloor(line3b.minus(line4b)) : new Decimal(0);
  const line6a = primaryEligible ? Decimal.min(MAX_ELIGIBLE_CONTRIBUTION, line5a) : new Decimal(0);
  const line6b = spouseEligible ? Decimal.min(MAX_ELIGIBLE_CONTRIBUTION, line5b) : new Decimal(0);
  const line7 = line6a.plus(line6b);
  const line8 = zeroFloor(d(input.agi));
  const line9 = getApplicableCreditRate(input.filingStatus, line8);
  const line10 = roundDollar(line7.times(line9));
  const taxLiabilityBeforeCredit = zeroFloor(d(input.taxLiabilityBeforeCredit));
  const priorNonrefundableCredits = zeroFloor(d(input.priorNonrefundableCredits));
  const line11 = zeroFloor(taxLiabilityBeforeCredit.minus(priorNonrefundableCredits));
  const line12 = Decimal.min(line10, line11);

  audit.record("Form 8880", "1a", "Primary taxpayer IRA and ABLE contributions", line1a,
    "Primary taxpayer IRA contributions plus designated-beneficiary ABLE contributions",
    {
      "Primary IRA contributions": zeroFloor(d(input.primaryIraContributions)),
      "Primary ABLE contributions": zeroFloor(d(input.primaryAbleContributions)),
    });
  audit.record("Form 8880", "1b", "Spouse IRA and ABLE contributions", line1b,
    hasSpouseColumn
      ? "Spouse IRA contributions plus designated-beneficiary ABLE contributions"
      : "$0 because only joint returns use the spouse column",
    {
      "Spouse IRA contributions": zeroFloor(d(input.spouseIraContributions)),
      "Spouse ABLE contributions": zeroFloor(d(input.spouseAbleContributions)),
    });
  audit.record("Form 8880", "2a", "Primary taxpayer qualified retirement plan contributions", line2a,
    validatedPrimaryElectiveDeferrals === undefined && supportedW2PrimaryElectiveDeferrals.greaterThan(0)
      ? "Supported W-2 Box 12 retirement-contribution codes D, E, F, G, H, S, AA, BB, and EE attributed to the primary taxpayer"
      : "Validated primary taxpayer elective deferrals and other qualified plan contributions",
    {
      "Validated direct Line 2a input": validatedPrimaryElectiveDeferrals ?? new Decimal(0),
      "Supported W-2 Box 12 retirement contributions": supportedW2PrimaryElectiveDeferrals,
    });
  audit.record("Form 8880", "2b", "Spouse qualified retirement plan contributions", line2b,
    !hasSpouseColumn
      ? "$0 because only joint returns use the spouse column"
      : validatedSpouseElectiveDeferrals === undefined && supportedW2SpouseElectiveDeferrals.greaterThan(0)
        ? "Supported owner-tagged W-2 Box 12 retirement-contribution codes D, E, F, G, H, S, AA, BB, and EE attributed to the spouse"
        : "Validated spouse elective deferrals and other qualified plan contributions",
    {
      "Validated direct Line 2b input": validatedSpouseElectiveDeferrals ?? new Decimal(0),
      "Supported W-2 Box 12 retirement contributions": supportedW2SpouseElectiveDeferrals,
    });
  audit.record("Form 8880", "3a", "Primary taxpayer total current-year contributions", line3a, "Line 1a + Line 2a", {
    "Line 1a": line1a,
    "Line 2a": line2a,
  });
  audit.record("Form 8880", "3b", "Spouse total current-year contributions", line3b, "Line 1b + Line 2b", {
    "Line 1b": line1b,
    "Line 2b": line2b,
  });
  audit.record("Form 8880", "4a", "Primary taxpayer recent-distribution reduction", line4a,
    "Validated primary taxpayer recent-distribution reduction amount");
  audit.record("Form 8880", "4b", "Spouse recent-distribution reduction", line4b,
    hasSpouseColumn
      ? "Validated spouse recent-distribution reduction amount"
      : "$0 because only joint returns use the spouse column");
  audit.record("Form 8880", "5a", "Primary taxpayer contributions after recent-distribution reduction", line5a,
    "max(0, Line 3a - Line 4a)", {
      "Line 3a": line3a,
      "Line 4a": line4a,
    });
  audit.record("Form 8880", "5b", "Spouse contributions after recent-distribution reduction", line5b,
    hasSpouseColumn
      ? "max(0, Line 3b - Line 4b)"
      : "$0 because only joint returns use the spouse column",
    {
      "Line 3b": line3b,
      "Line 4b": line4b,
    });
  audit.record("Form 8880", "6a", "Primary taxpayer eligible contributions after age, dependency, student, and dollar caps", line6a,
    primaryEligible
      ? "Smaller of $2,000 or Line 5a"
      : "$0 because the primary taxpayer is under age 18, can be claimed as a dependent, or is a full-time student",
    {
      "Line 5a": line5a,
      "Primary date of birth": input.primaryDateOfBirth,
      "Primary full-time student": (input.primaryIsFullTimeStudent ?? false).toString(),
      "Primary can be claimed as dependent": (input.primaryCanBeClaimedAsDependent ?? false).toString(),
    });
  audit.record("Form 8880", "6b", "Spouse eligible contributions after age, dependency, student, and dollar caps", line6b,
    !hasSpouseColumn
      ? "$0 because only joint returns use the spouse column"
      : spouseEligible
        ? "Smaller of $2,000 or Line 5b"
        : "$0 because the spouse is under age 18, can be claimed as a dependent, or is a full-time student",
    {
      "Line 5b": line5b,
      "Spouse date of birth": input.spouseDateOfBirth ?? "",
      "Spouse full-time student": (input.spouseIsFullTimeStudent ?? false).toString(),
      "Spouse can be claimed as dependent": (input.spouseCanBeClaimedAsDependent ?? false).toString(),
    });
  audit.record("Form 8880", "7", "Total eligible contributions", line7, "Line 6a + Line 6b", {
    "Line 6a": line6a,
    "Line 6b": line6b,
  });
  audit.record("Form 8880", "8", "Form 1040 line 11a amount used for the rate table", line8,
    "Form 1040 line 11a used directly in the supported engine path");
  audit.record("Form 8880", "9", "Applicable credit rate", line9,
    "2025 Form 8880 rate table based on Line 8 and filing status",
    {
      "Line 8": line8,
      "Filing status": input.filingStatus,
    });
  audit.record("Form 8880", "10", "Tentative saver's credit", line10,
    "Line 7 × Line 9, rounded to the nearest dollar", {
      "Line 7": line7,
      "Line 9": line9,
    });
  audit.record("Form 8880", "11", "Tax-liability limitation", line11,
    "max(0, Form 1040 line 18 limitation base minus prior nonrefundable credits that precede Form 8880)", {
      "Form 1040 line 18 limitation base": taxLiabilityBeforeCredit,
      "Prior nonrefundable credits": priorNonrefundableCredits,
    });
  audit.record("Form 8880", "12", "Retirement savings contributions credit", line12, "Smaller of Line 10 or Line 11", {
    "Line 10": line10,
    "Line 11": line11,
  });

  return {
    line1a,
    line1b,
    line2a,
    line2b,
    line3a,
    line3b,
    line4a,
    line4b,
    line5a,
    line5b,
    line6a,
    line6b,
    line7,
    line8,
    line9,
    line10,
    line11,
    line12,
    lines: audit.getLines(),
  };
}

function getSupportedW2RetirementContributionAmount(w2: W2): Decimal {
  return sum(...SUPPORTED_W2_RETIREMENT_CONTRIBUTION_FIELDS.map((field) => d(w2[field])));
}

function shouldIncludeSupportedW2RetirementContribution(
  w2: W2,
  accountHolder: "primary" | "spouse",
  isJointReturn: boolean,
  hasTaggedRetirementContributions: boolean
): boolean {
  if (getSupportedW2RetirementContributionAmount(w2).isZero()) {
    return false;
  }

  if (isJointReturn) {
    if (!hasTaggedRetirementContributions) {
      return false;
    }

    return w2.accountHolder === accountHolder;
  }

  if (hasTaggedRetirementContributions) {
    return w2.accountHolder === undefined || w2.accountHolder === accountHolder;
  }

  return true;
}

function getApplicableCreditRate(filingStatus: FilingStatus, line8Amount: Decimal): Decimal {
  const thresholds = getRateThresholds(filingStatus);

  if (line8Amount.lessThanOrEqualTo(thresholds.fiftyPercentMax)) {
    return new Decimal(0.5);
  }

  if (line8Amount.lessThanOrEqualTo(thresholds.twentyPercentMax)) {
    return new Decimal(0.2);
  }

  if (line8Amount.lessThanOrEqualTo(thresholds.tenPercentMax)) {
    return new Decimal(0.1);
  }

  return new Decimal(0);
}

function getRateThresholds(filingStatus: FilingStatus): {
  fiftyPercentMax: Decimal;
  twentyPercentMax: Decimal;
  tenPercentMax: Decimal;
} {
  switch (filingStatus) {
    case "married_filing_jointly":
      return {
        fiftyPercentMax: new Decimal(47500),
        twentyPercentMax: new Decimal(51000),
        tenPercentMax: new Decimal(79000),
      };
    case "head_of_household":
      return {
        fiftyPercentMax: new Decimal(35625),
        twentyPercentMax: new Decimal(38250),
        tenPercentMax: new Decimal(59250),
      };
    case "single":
    case "married_filing_separately":
    case "qualifying_surviving_spouse":
      return {
        fiftyPercentMax: new Decimal(23750),
        twentyPercentMax: new Decimal(25500),
        tenPercentMax: new Decimal(39500),
      };
  }
}

function isEligibleSaverCreditPerson(
  dateOfBirth: string,
  taxYear: number,
  isFullTimeStudent: boolean,
  canBeClaimedAsDependent: boolean
): boolean {
  if (isFullTimeStudent || canBeClaimedAsDependent) {
    return false;
  }

  return getAgeAtYearEnd(dateOfBirth, taxYear) >= 18;
}

function getAgeAtYearEnd(dateOfBirth: string, taxYear: number): number {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  const yearEnd = new Date(Date.UTC(taxYear, 11, 31));
  let age = yearEnd.getUTCFullYear() - birthDate.getUTCFullYear();
  const hadBirthdayByYearEnd = (
    yearEnd.getUTCMonth() > birthDate.getUTCMonth()
    || (yearEnd.getUTCMonth() === birthDate.getUTCMonth()
      && yearEnd.getUTCDate() >= birthDate.getUTCDate())
  );

  if (!hadBirthdayByYearEnd) {
    age -= 1;
  }

  return age;
}
