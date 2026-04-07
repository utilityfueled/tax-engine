/**
 * New York IT-249 long-term care insurance credit.
 * Resident-individual slice for the credit that flows to IT-201-ATT line 3.
 * Spec: spec/state/ny-it249-long-term-care-insurance-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

export interface NYIT249Input {
  taxYear: number;
  nyAgi: Decimal | string | number;
  premiumsPaid?: Decimal | string | number;
  partnershipCreditShare?: Decimal | string | number;
  sCorporationCreditShare?: Decimal | string | number;
  fiduciaryCreditShare?: Decimal | string | number;
  priorYearCarryover?: Decimal | string | number;
  taxBeforeCredits: Decimal | string | number;
  creditsAppliedBeforeThisCredit?: Decimal | string | number;
}

export interface NYIT249Result {
  qualifiedPremiumsPaid: Decimal;
  creditRate: Decimal;
  currentYearDirectCredit: Decimal;
  partnershipCreditShare: Decimal;
  sCorporationCreditShare: Decimal;
  fiduciaryCreditShare: Decimal;
  totalPassThroughCredit: Decimal;
  totalCurrentYearCredit: Decimal;
  allowedCurrentYearCredit: Decimal;
  cappedCurrentYearCredit: Decimal;
  priorYearCarryover: Decimal;
  totalAvailableCredit: Decimal;
  taxBeforeCredits: Decimal;
  creditsAppliedBeforeThisCredit: Decimal;
  netTaxAvailable: Decimal;
  creditUsedThisYear: Decimal;
  creditCarryoverToNextYear: Decimal;
  lines: CalculatedLine[];
}

const CREDIT_RATE = new Decimal("0.20");
const CURRENT_YEAR_CAP = new Decimal(1500);
const NYAGI_LIMIT = new Decimal(250000);
const ZERO = new Decimal(0);

function requireNonNegativeRoundedAmount(
  value: Decimal | string | number | undefined,
  description: string
): Decimal {
  const amount = roundDollar(d(value));
  if (amount.lessThan(ZERO)) {
    throw new Error(`${description} must be non-negative`);
  }
  return amount;
}

export function calculateNYIT249(input: NYIT249Input): NYIT249Result {
  if (input.taxYear !== 2025) {
    throw new Error(
      `NY IT-249 long-term care insurance credit not available for tax year ${input.taxYear}`
    );
  }

  const audit = new AuditTrail();
  const nyAgi = roundDollar(d(input.nyAgi));
  const qualifiedPremiumsPaid = requireNonNegativeRoundedAmount(
    input.premiumsPaid,
    "NY IT-249 qualified premiums paid"
  );
  const partnershipCreditShare = requireNonNegativeRoundedAmount(
    input.partnershipCreditShare,
    "NY IT-249 partnership credit share"
  );
  const sCorporationCreditShare = requireNonNegativeRoundedAmount(
    input.sCorporationCreditShare,
    "NY IT-249 S corporation credit share"
  );
  const fiduciaryCreditShare = requireNonNegativeRoundedAmount(
    input.fiduciaryCreditShare,
    "NY IT-249 fiduciary credit share"
  );
  const priorYearCarryover = requireNonNegativeRoundedAmount(
    input.priorYearCarryover,
    "NY IT-249 prior-year carryover"
  );
  const taxBeforeCredits = requireNonNegativeRoundedAmount(
    input.taxBeforeCredits,
    "NY IT-249 tax due before credits"
  );
  const creditsAppliedBeforeThisCredit = requireNonNegativeRoundedAmount(
    input.creditsAppliedBeforeThisCredit,
    "NY IT-249 credits applied before this credit"
  );

  const currentYearDirectCredit = roundDollar(qualifiedPremiumsPaid.times(CREDIT_RATE));
  const totalPassThroughCredit = sum(
    partnershipCreditShare,
    sCorporationCreditShare,
    fiduciaryCreditShare
  );
  const totalCurrentYearCredit = sum(currentYearDirectCredit, totalPassThroughCredit);
  const allowedCurrentYearCredit = nyAgi.lessThan(NYAGI_LIMIT) ? totalCurrentYearCredit : ZERO;
  const cappedCurrentYearCredit = Decimal.min(allowedCurrentYearCredit, CURRENT_YEAR_CAP);
  const totalAvailableCredit = sum(cappedCurrentYearCredit, priorYearCarryover);
  const netTaxAvailable = zeroFloor(taxBeforeCredits.minus(creditsAppliedBeforeThisCredit));
  const creditUsedThisYear = Decimal.min(totalAvailableCredit, netTaxAvailable);
  const creditCarryoverToNextYear = totalAvailableCredit.minus(creditUsedThisYear);

  audit.record("NY-IT249", "1", "Qualified long-term care insurance premiums paid", qualifiedPremiumsPaid, "Qualified premiums paid during the current tax year");
  audit.record("NY-IT249", "2", "Credit rate", CREDIT_RATE, "Statutory 20% rate");
  audit.record("NY-IT249", "3", "Current-year direct long-term care insurance credit", currentYearDirectCredit, "Line 1 × Line 2", {
    "Line 1 qualified premiums": qualifiedPremiumsPaid.toString(),
    "Line 2 credit rate": CREDIT_RATE.toString(),
  });
  audit.record("NY-IT249", "4", "Partner share of credit", partnershipCreditShare, "Aggregate Schedule C line 4 partner credit share");
  audit.record("NY-IT249", "5", "S corporation shareholder share of credit", sCorporationCreditShare, "Aggregate Schedule C line 5 S corporation credit share");
  audit.record("NY-IT249", "6", "Beneficiary share of credit", fiduciaryCreditShare, "Aggregate Schedule C line 6 fiduciary credit share");
  audit.record("NY-IT249", "7", "Total pass-through share of credit", totalPassThroughCredit, "Line 4 + Line 5 + Line 6", {
    "Line 4 partnership share": partnershipCreditShare.toString(),
    "Line 5 S corporation share": sCorporationCreditShare.toString(),
    "Line 6 fiduciary share": fiduciaryCreditShare.toString(),
  });
  audit.record("NY-IT249", "8", "Amount from Schedule A line 3", currentYearDirectCredit, "Schedule A line 3");
  audit.record("NY-IT249", "9", "Amount from Schedule C line 7", totalPassThroughCredit, "Schedule C line 7");
  audit.record("NY-IT249", "11", "Total credit available for the current year", totalCurrentYearCredit, "Line 8 + Line 9", {
    "Line 8 direct credit": currentYearDirectCredit.toString(),
    "Line 9 pass-through credit": totalPassThroughCredit.toString(),
  });
  audit.record("NY-IT249", "12a", "Resident NYAGI eligibility limitation", allowedCurrentYearCredit, "If NYAGI is less than $250,000, line 11; otherwise 0", {
    NYAGI: nyAgi.toString(),
    "Line 11 current-year credit": totalCurrentYearCredit.toString(),
  });
  audit.record("NY-IT249", "12b", "Resident current-year credit cap", cappedCurrentYearCredit, "Lesser of line 12a or $1,500", {
    "Line 12a eligible credit": allowedCurrentYearCredit.toString(),
    "Current-year cap": CURRENT_YEAR_CAP.toString(),
  });
  audit.record("NY-IT249", "13", "Prior-year carryover credit", priorYearCarryover, "Direct carryover input from the prior year's IT-249");
  audit.record("NY-IT249", "14", "Total credit available including carryover", totalAvailableCredit, "Line 12b + Line 13", {
    "Line 12b capped current-year credit": cappedCurrentYearCredit.toString(),
    "Line 13 carryover": priorYearCarryover.toString(),
  });
  audit.record("NY-IT249", "20", "Tax due before credits", taxBeforeCredits, "IT-201 line 39 plus any IT-201-ATT line 21 tax");
  audit.record("NY-IT249", "21", "Credits applied before the long-term care insurance credit", creditsAppliedBeforeThisCredit, "Credits that precede IT-249 in New York's credit ordering rules");
  audit.record("NY-IT249", "22", "Net tax before the long-term care insurance credit", netTaxAvailable, "max(0, line 20 - line 21)", {
    "Line 20 tax before credits": taxBeforeCredits.toString(),
    "Line 21 prior credits": creditsAppliedBeforeThisCredit.toString(),
  });
  audit.record("NY-IT249", "23", "Credit used for the current tax year", creditUsedThisYear, "Lesser of line 14 or line 22", {
    "Line 14 total available credit": totalAvailableCredit.toString(),
    "Line 22 net tax": netTaxAvailable.toString(),
  });
  audit.record("NY-IT249", "24", "Credit carryover to next year", creditCarryoverToNextYear, "Line 14 - Line 23", {
    "Line 14 total available credit": totalAvailableCredit.toString(),
    "Line 23 credit used": creditUsedThisYear.toString(),
  });

  return {
    qualifiedPremiumsPaid,
    creditRate: CREDIT_RATE,
    currentYearDirectCredit,
    partnershipCreditShare,
    sCorporationCreditShare,
    fiduciaryCreditShare,
    totalPassThroughCredit,
    totalCurrentYearCredit,
    allowedCurrentYearCredit,
    cappedCurrentYearCredit,
    priorYearCarryover,
    totalAvailableCredit,
    taxBeforeCredits,
    creditsAppliedBeforeThisCredit,
    netTaxAvailable,
    creditUsedThisYear,
    creditCarryoverToNextYear,
    lines: audit.getLines(),
  };
}
