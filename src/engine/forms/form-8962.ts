/**
 * Form 8962 — Premium Tax Credit (PTC)
 * Spec: spec/federal/form-8962.yaml
 *
 * Reconciles advance PTC (APTC) from the marketplace with actual PTC
 * based on household income relative to Federal Poverty Line.
 */

import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { d, zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form8962Input {
  taxFamilySize: number;
  modifiedAGI: Decimal;
  filingStatus: FilingStatus;
  form1095A: TaxYearInput["form1095A"];
}

export interface Form8962Result {
  familySize: number; // Line 1
  modifiedAGI: Decimal; // Line 2
  fplPercentage: Decimal; // Line 3
  contributionRate: Decimal; // Line 5
  expectedContribution: Decimal; // Line 7
  annualPremium: Decimal; // Line 11a
  annualSLCSP: Decimal; // Line 11b
  annualAdvancePTC: Decimal; // Line 11c
  ptcAllowed: Decimal; // Line 24
  advancePTCTotal: Decimal; // Line 25
  netPTC: Decimal; // Line 26 (refundable, → Sched 3 Line 10)
  excessAPTCRepayment: Decimal; // Line 27 (→ Sched 2 Line 2)
  lines: CalculatedLine[];
}

/**
 * Federal Poverty Line for TY2025 (48 contiguous states)
 * Per IRS: "the tax credit for 2025 is based on the 2024 FPL"
 * Source: 2024 HHS Poverty Guidelines (published January 2024)
 * IRS Form 8962 Instructions, Table 1-1
 */
const FPL_2025_BASE = new Decimal(15060); // 1 person
const FPL_2025_PER_PERSON = new Decimal(5380); // each additional person

function getFPL(familySize: number): Decimal {
  if (familySize <= 1) return FPL_2025_BASE;
  return FPL_2025_BASE.plus(FPL_2025_PER_PERSON.times(familySize - 1));
}

/**
 * 2025 applicable figure table (contribution percentage).
 * Based on IRA-extended enhanced subsidies.
 * FPL% ranges map to contribution rate ranges (linear interpolation).
 */
interface ContributionBracket {
  minFPL: number;
  maxFPL: number;
  minRate: Decimal;
  maxRate: Decimal;
}

const CONTRIBUTION_TABLE_2025: ContributionBracket[] = [
  { minFPL: 0, maxFPL: 150, minRate: new Decimal(0), maxRate: new Decimal(0) },
  { minFPL: 150, maxFPL: 200, minRate: new Decimal(0), maxRate: new Decimal(0.02) },
  { minFPL: 200, maxFPL: 250, minRate: new Decimal(0.02), maxRate: new Decimal(0.04) },
  { minFPL: 250, maxFPL: 300, minRate: new Decimal(0.04), maxRate: new Decimal(0.06) },
  { minFPL: 300, maxFPL: 400, minRate: new Decimal(0.06), maxRate: new Decimal(0.085) },
  { minFPL: 400, maxFPL: Infinity, minRate: new Decimal(0.085), maxRate: new Decimal(0.085) },
];

function getContributionRate(fplPercentage: Decimal): Decimal {
  const pct = fplPercentage.toNumber();
  for (const bracket of CONTRIBUTION_TABLE_2025) {
    if (pct >= bracket.minFPL && pct < bracket.maxFPL) {
      if (bracket.minRate.eq(bracket.maxRate)) return bracket.minRate;
      // Linear interpolation within bracket
      const range = bracket.maxFPL - bracket.minFPL;
      const position = (pct - bracket.minFPL) / range;
      return bracket.minRate.plus(
        bracket.maxRate.minus(bracket.minRate).times(position)
      );
    }
  }
  // Above all brackets
  return new Decimal(0.085);
}

/**
 * Repayment caps for excess APTC (Table 5)
 */
interface RepaymentCap {
  minFPL: number;
  maxFPL: number;
  single: Decimal;
  other: Decimal;
}

// Rev. Proc. 2024-40 §2.07; IRS Form 8962 Instructions Table 5 (TY2025)
const REPAYMENT_CAPS_2025: RepaymentCap[] = [
  { minFPL: 0, maxFPL: 200, single: new Decimal(375), other: new Decimal(750) },
  { minFPL: 200, maxFPL: 300, single: new Decimal(975), other: new Decimal(1950) },
  { minFPL: 300, maxFPL: 400, single: new Decimal(1625), other: new Decimal(3250) },
];

function getRepaymentCap(fplPercentage: Decimal, filingStatus: FilingStatus): Decimal | null {
  const pct = fplPercentage.toNumber();
  if (pct >= 400) return null; // No cap above 400% FPL
  for (const cap of REPAYMENT_CAPS_2025) {
    if (pct >= cap.minFPL && pct < cap.maxFPL) {
      // IRS Form 8962 Table 5: "for a filing status of Single" vs "any other filing status"
      // Only Single uses the lower cap. MFS uses "any other" per Table 5.
      return filingStatus === "single"
        ? cap.single
        : cap.other;
    }
  }
  return null;
}

export function calculateForm8962(input: Form8962Input): Form8962Result {
  const audit = new AuditTrail();

  // Line 1: Family size
  const familySize = input.taxFamilySize;
  audit.record("Form 8962", "1", "Tax family size", new Decimal(familySize),
    "Primary + spouse + dependents");

  // Line 2: Modified AGI
  const modifiedAGI = input.modifiedAGI;
  audit.record("Form 8962", "2", "Modified AGI", modifiedAGI, "AGI + adjustments");

  // Line 3: Household income as % of FPL
  // IRS Form 8962 Line 3: "Divide line 2a by line 2b." — no rounding instruction.
  // The form field shows "___.__%" (2 decimal places). Decimal precision is required
  // for accurate interpolation (Line 5) and repayment cap tier classification (Table 5).
  // Rounding to a whole number would misclassify taxpayers near bracket boundaries
  // (e.g., 199.8% → 200% would change the repayment cap from $375 to $950 for single filers).
  const fpl = getFPL(familySize);
  const fplPercentage = fpl.isZero()
    ? new Decimal(0)
    : modifiedAGI.div(fpl).times(100);
  audit.record("Form 8962", "3", "FPL percentage", fplPercentage,
    `MAGI ${modifiedAGI} / FPL ${fpl} × 100`);

  // Line 5: Expected contribution rate
  const contributionRate = getContributionRate(fplPercentage);
  audit.record("Form 8962", "5", "Expected contribution rate", contributionRate,
    "From applicable figure table");

  // Line 7: Expected annual contribution
  const expectedContribution = roundDollar(modifiedAGI.times(contributionRate));
  audit.record("Form 8962", "7", "Expected annual contribution", expectedContribution,
    "Line 2 × Line 5");

  // Lines 11a-c: Aggregate Form 1095-A data
  // Lines 12-23: Per-month PTC computation (IRS Form 8962 Lines 12-23 method)
  // Monthly expected contribution = Line 7 ÷ 12 (Column c)
  // Monthly PTC = min(max(0, SLCSP - monthly expected), premium) (Column e)
  let annualPremium = new Decimal(0);
  let annualSLCSP = new Decimal(0);
  let annualAdvancePTC = new Decimal(0);
  let totalMonthlyPTC = new Decimal(0);

  const monthlyExpected = expectedContribution.dividedBy(12);

  for (const form of input.form1095A) {
    for (const month of form.monthlyPremiums) {
      const premium = d(month.enrolleePremium);
      const slcsp = d(month.slcsp);
      const aptc = d(month.advancePremiumTaxCredit);

      annualPremium = annualPremium.plus(premium);
      annualSLCSP = annualSLCSP.plus(slcsp);
      annualAdvancePTC = annualAdvancePTC.plus(aptc);

      // Per-month PTC: min(max(0, SLCSP - monthly expected), premium)
      const monthPTC = min(zeroFloor(slcsp.minus(monthlyExpected)), premium);
      totalMonthlyPTC = totalMonthlyPTC.plus(monthPTC);
    }
  }

  audit.record("Form 8962", "11a", "Annual enrollment premium", annualPremium,
    "Sum of monthly premiums from 1095-A");
  audit.record("Form 8962", "11b", "Annual SLCSP premium", annualSLCSP,
    "Sum of monthly SLCSP from 1095-A");
  audit.record("Form 8962", "11c", "Annual advance PTC", annualAdvancePTC,
    "Sum of monthly APTC from 1095-A");

  // Line 24: PTC allowed = sum of per-month PTC (IRS Lines 12-23 Column e)
  const ptcAllowed = roundDollar(totalMonthlyPTC);
  audit.record("Form 8962", "24", "Annual PTC allowed", ptcAllowed,
    "max(0, min(SLCSP - expected, premium))");

  // Line 25: Advance PTC total
  const advancePTCTotal = annualAdvancePTC;
  audit.record("Form 8962", "25", "Advance PTC total", advancePTCTotal,
    "Same as Line 11c");

  // Line 26: Net PTC (refundable credit if PTC > APTC)
  const netPTC = zeroFloor(ptcAllowed.minus(advancePTCTotal));
  audit.record("Form 8962", "26", "Net PTC", netPTC,
    "Line 24 - Line 25 → Schedule 3 Line 10");

  // Line 27: Excess APTC repayment (if APTC > PTC)
  const rawExcess = zeroFloor(advancePTCTotal.minus(ptcAllowed));
  const repaymentCap = getRepaymentCap(fplPercentage, input.filingStatus);
  const excessAPTCRepayment = repaymentCap !== null
    ? min(rawExcess, repaymentCap)
    : rawExcess;
  audit.record("Form 8962", "27", "Excess APTC repayment", excessAPTCRepayment,
    "Line 25 - Line 24 (capped) → Schedule 2 Line 2");

  return {
    familySize,
    modifiedAGI,
    fplPercentage,
    contributionRate,
    expectedContribution,
    annualPremium,
    annualSLCSP,
    annualAdvancePTC,
    ptcAllowed,
    advancePTCTotal,
    netPTC,
    excessAPTCRepayment,
    lines: audit.getLines(),
  };
}
