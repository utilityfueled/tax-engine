/**
 * Pennsylvania Working Pennsylvanians Tax Credit
 * Spec: spec/state/pa-working-pennsylvanians-tax-credit.yaml
 */

import Decimal from "decimal.js";
import { roundDollar, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

const SUPPORTED_TAX_YEARS = new Set([2025, 2026]);
const MAX_CREDIT_BY_TAX_YEAR = new Map<number, Decimal>([
  [2025, new Decimal(805)],
  [2026, new Decimal(805)],
]);

export interface PAWorkingPennsylvaniansTaxCreditInput {
  taxYear: number;
  paEarnedIncome: Decimal;
  federalEarnedIncomeCredit: Decimal;
  isClaimedAsDependentOnAnotherFederalReturn?: boolean;
}

export interface PAWorkingPennsylvaniansTaxCreditResult {
  paEarnedIncome: Decimal;
  federalEarnedIncomeCredit: Decimal;
  isEligible: boolean;
  credit: Decimal;
  lines: CalculatedLine[];
}

export function calculatePAWorkingPennsylvaniansTaxCredit(
  input: PAWorkingPennsylvaniansTaxCreditInput,
): PAWorkingPennsylvaniansTaxCreditResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(
      `PA Working Pennsylvanians Tax Credit constants not available for tax year ${input.taxYear}`,
    );
  }

  const audit = new AuditTrail();
  const paEarnedIncome = zeroFloor(input.paEarnedIncome);
  const federalEarnedIncomeCredit = zeroFloor(input.federalEarnedIncomeCredit);
  const dependentClaimantBlocked = input.isClaimedAsDependentOnAnotherFederalReturn === true;
  const hasPAEarnedIncome = paEarnedIncome.greaterThan(0);
  const isEligible = hasPAEarnedIncome && federalEarnedIncomeCredit.greaterThan(0) && !dependentClaimantBlocked;
  const maxCredit = MAX_CREDIT_BY_TAX_YEAR.get(input.taxYear);
  if (!maxCredit) {
    throw new Error(
      `PA Working Pennsylvanians Tax Credit constants not available for tax year ${input.taxYear}`,
    );
  }

  audit.record(
    "PA-WPTC",
    "pa-earned-income",
    "Pennsylvania earned income",
    paEarnedIncome,
    "Supported Pennsylvania wages/salary/compensation plus positive self-employment income",
  );

  audit.record(
    "PA-WPTC",
    "eligibility",
    "Working Pennsylvanians Tax Credit eligibility",
    isEligible ? new Decimal(1) : new Decimal(0),
    dependentClaimantBlocked
      ? "Taxpayer is claimed as a dependent on another person's federal return, so no WPTC is allowed"
      : !hasPAEarnedIncome
        ? "No credit because the return has no Pennsylvania earned income"
      : isEligible
        ? "Federal earned income credit is greater than $0"
        : "Federal earned income credit is $0, so no WPTC is allowed",
    { paEarnedIncome, federalEarnedIncomeCredit },
  );

  const credit = isEligible
    ? Decimal.min(roundDollar(federalEarnedIncomeCredit.times("0.10")), maxCredit)
    : new Decimal(0);

  audit.record(
    "PA-WPTC",
    "credit",
    "Working Pennsylvanians Tax Credit",
    credit,
    dependentClaimantBlocked
      ? "No credit when the taxpayer is claimed as a dependent on another person's federal return"
      : !hasPAEarnedIncome
        ? "No credit when the return has no Pennsylvania earned income"
      : isEligible
        ? `min($${maxCredit}, round to nearest dollar: $${federalEarnedIncomeCredit} × 10%)`
        : "No credit when the federal earned income credit is zero",
  );

  return {
    paEarnedIncome,
    federalEarnedIncomeCredit,
    isEligible,
    credit,
    lines: audit.getLines(),
  };
}
