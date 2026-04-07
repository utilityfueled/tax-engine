/**
 * New Jersey Health Insurance Mandate — Shared Responsibility Payment (SRP).
 * Spec: spec/state/nj-1040-health-coverage.yaml
 *
 * Computes the penalty for NJ residents who lack minimum essential health
 * coverage. Modeled after the federal ACA individual mandate (IRC §5000A)
 * as adopted by NJ (P.L. 2018, c.31) effective tax year 2019.
 *
 * Penalty = max(flat dollar, income-based), capped at bronze plan cost,
 * prorated for partial-year non-coverage. Short gaps (≤2 months) are exempt.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

interface SRPConstants {
  adultPenalty: Decimal;
  childPenalty: Decimal;
  maxFlatPenalty: Decimal;
  incomePercentage: Decimal;
  filingThresholds: Record<string, Decimal>;
  bronzePlanCostPerPerson: Decimal;
  shortGapMaxMonths: number;
}

const NJ_SRP_CONSTANTS: Record<number, SRPConstants> = {
  2025: {
    adultPenalty: new Decimal(695),
    childPenalty: new Decimal("347.50"),
    maxFlatPenalty: new Decimal(2085),
    incomePercentage: new Decimal("0.025"),
    filingThresholds: {
      single: new Decimal(10000),
      married_filing_jointly: new Decimal(20000),
      head_of_household: new Decimal(10000),
      qualifying_surviving_spouse: new Decimal(20000),
      married_filing_separately: new Decimal(10000),
    },
    bronzePlanCostPerPerson: new Decimal(9012),
    shortGapMaxMonths: 2,
  },
};

export interface NJ1040HealthCoverageInput {
  taxYear: number;
  filingStatus: FilingStatus;
  /** Taxpayer total income before exclusions/adjustments (Worksheet L line 1 / NJ-1040 line 27) */
  totalIncome: Decimal | string | number;
  /** Tax-exempt interest included in Worksheet L line 2 / NJ-1040 line 16b */
  taxExemptInterest?: Decimal | string | number;
  /** Dependents' total income and tax-exempt interest included in Worksheet L line 3 */
  dependentIncome?: Decimal | string | number;
  /** Number of adults (18+) in household */
  adults: number;
  /** Number of children (under 18) in household */
  children: number;
  /** Number of months household lacked coverage (0-12) */
  uncoveredMonths: number;
}

export interface NJ1040HealthCoverageResult {
  /** Worksheet L household income base */
  householdIncome: Decimal;
  /** Flat dollar penalty (before proration / cap) */
  flatDollarAmount: Decimal;
  /** Income-based penalty (before proration / cap) */
  incomeBasedAmount: Decimal;
  /** Bronze plan cost cap for household */
  bronzePlanCap: Decimal;
  /** Annual penalty before monthly proration */
  annualPenalty: Decimal;
  /** Effective uncovered months (after short gap exemption) */
  effectiveUncoveredMonths: number;
  /** Final Shared Responsibility Payment */
  sharedResponsibilityPayment: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040HealthCoverage(
  input: NJ1040HealthCoverageInput
): NJ1040HealthCoverageResult {
  const audit = new AuditTrail();
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 health coverage rules");

  const constants = NJ_SRP_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(
      `NJ health coverage SRP constants not available for tax year ${input.taxYear}`
    );
  }

  const totalIncome = d(input.totalIncome);
  const taxExemptInterest = d(input.taxExemptInterest);
  const dependentIncome = d(input.dependentIncome);
  const householdIncome = totalIncome.plus(taxExemptInterest).plus(dependentIncome);
  const adults = Math.max(0, input.adults);
  const children = Math.max(0, input.children);
  const totalMembers = adults + children;
  const rawUncoveredMonths = Math.max(0, Math.min(12, input.uncoveredMonths));

  // Short coverage gap exemption: ≤2 months uncovered → no penalty
  const effectiveUncoveredMonths =
    rawUncoveredMonths <= constants.shortGapMaxMonths ? 0 : rawUncoveredMonths;

  audit.record(
    "NJ-HCC",
    "uncovered-months",
    "Effective uncovered months (after short gap exemption)",
    new Decimal(effectiveUncoveredMonths),
    rawUncoveredMonths <= constants.shortGapMaxMonths
      ? `Gap of ${rawUncoveredMonths} month(s) qualifies for short gap exemption`
      : `${rawUncoveredMonths} uncovered months exceed short gap threshold`,
    {
      "Raw uncovered months": rawUncoveredMonths.toString(),
      "Short gap threshold": constants.shortGapMaxMonths.toString(),
    }
  );

  // If no members or no uncovered months → $0
  if (totalMembers === 0 || effectiveUncoveredMonths === 0) {
    const zero = new Decimal(0);
    audit.record(
      "NJ-HCC",
      "srp-total",
      "Shared Responsibility Payment",
      zero,
      totalMembers === 0
        ? "No household members subject to mandate"
        : "All members covered or short gap exemption applies"
    );

    return {
      householdIncome,
      flatDollarAmount: zero,
      incomeBasedAmount: zero,
      bronzePlanCap: zero,
      annualPenalty: zero,
      effectiveUncoveredMonths,
      sharedResponsibilityPayment: zero,
      lines: audit.getLines(),
    };
  }

  // --- Flat dollar penalty ---
  const rawFlat = constants.adultPenalty
    .times(adults)
    .plus(constants.childPenalty.times(children));
  const flatDollarAmount = Decimal.min(rawFlat, constants.maxFlatPenalty);

  audit.record(
    "NJ-HCC",
    "flat-dollar",
    "Flat dollar penalty amount",
    flatDollarAmount,
    `min($695 × ${adults} adults + $347.50 × ${children} children, $2,085 cap)`,
    {
      "Adult penalty": constants.adultPenalty.times(adults),
      "Child penalty": constants.childPenalty.times(children),
      "Raw total": rawFlat,
      "Cap": constants.maxFlatPenalty,
    }
  );

  // --- Income-based penalty ---
  const threshold =
    constants.filingThresholds[input.filingStatus] ?? new Decimal(10000);
  const excessIncome = zeroFloor(householdIncome.minus(threshold));
  const incomeBasedAmount = excessIncome.times(constants.incomePercentage);

  audit.record(
    "NJ-HCC",
    "income-based",
    "Income-based penalty amount",
    incomeBasedAmount,
    `2.5% × max(0, household income $${householdIncome} - $${threshold} threshold)`,
    {
      "Total income": totalIncome,
      "Tax-exempt interest": taxExemptInterest,
      "Dependent income": dependentIncome,
      "Household income": householdIncome,
      "Filing threshold": threshold,
      "Excess income": excessIncome,
    }
  );

  // --- Annual penalty = max(flat, income), capped at bronze plan cost ---
  const uncappedPenalty = Decimal.max(flatDollarAmount, incomeBasedAmount);

  const bronzePlanCap = constants.bronzePlanCostPerPerson.times(totalMembers);
  const annualPenalty = Decimal.min(uncappedPenalty, bronzePlanCap);

  audit.record(
    "NJ-HCC",
    "annual-penalty",
    "Annual household penalty (before proration)",
    annualPenalty,
    `min(max(flat=$${flatDollarAmount}, income=$${incomeBasedAmount}), bronze cap=$${bronzePlanCap})`,
    {
      "Flat dollar": flatDollarAmount,
      "Income-based": incomeBasedAmount,
      "Uncapped penalty": uncappedPenalty,
      "Bronze plan cap": bronzePlanCap,
    }
  );

  // --- Monthly proration ---
  const prorated =
    effectiveUncoveredMonths === 12
      ? annualPenalty
      : annualPenalty.times(effectiveUncoveredMonths).dividedBy(12);
  const sharedResponsibilityPayment = roundDollar(prorated);

  audit.record(
    "NJ-HCC",
    "srp-total",
    "Shared Responsibility Payment",
    sharedResponsibilityPayment,
    effectiveUncoveredMonths === 12
      ? "Full year uncovered — no proration"
      : `Annual penalty × (${effectiveUncoveredMonths} / 12), rounded`,
    {
      "Annual penalty": annualPenalty,
      "Uncovered months": effectiveUncoveredMonths.toString(),
      "Prorated amount": prorated,
    }
  );

  return {
    householdIncome,
    flatDollarAmount,
    incomeBasedAmount,
    bronzePlanCap,
    annualPenalty,
    effectiveUncoveredMonths,
    sharedResponsibilityPayment,
    lines: audit.getLines(),
  };
}
