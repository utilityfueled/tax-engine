/**
 * Form 1116 — Foreign Tax Credit
 * Spec: spec/federal/form-1116.yaml
 *
 * Computes the foreign tax credit limitation. Credit cannot exceed
 * the US tax attributable to foreign-source income.
 * Simplified method available for small passive-only amounts.
 */

import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { d, zeroFloor, min, roundDollar, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

/** Per-year carryforward entry for Schedule B reconciliation */
export interface FTCCarryforwardEntry {
  taxYear: number;
  amount: Decimal;
}

export interface Form1116Input {
  foreignSourceIncome: Decimal; // Line 1a — gross foreign income
  totalTaxableIncome: Decimal; // From 1040 — worldwide taxable income
  taxBeforeCredits: Decimal; // US tax before any credits
  foreignTaxesPaid: Decimal; // Line 7 — current-year creditable foreign taxes
  filingStatus: FilingStatus;
  /** Current tax year (defaults to 2025 when omitted; needed for Schedule B expiration) */
  currentTaxYear?: number;
  /** Legacy single aggregate carryforward (used when per-year entries are not provided) */
  priorYearCarryforward?: Decimal;
  /** Per-year carryforward entries for Schedule B FIFO reconciliation (takes precedence) */
  priorYearCarryforwardByYear?: FTCCarryforwardEntry[];
  hasDisqualifyingForeignTaxSources?: boolean;
  /** Standard or itemized deduction (Form 1040 Line 12/13) for Line 3e apportionment */
  deductionAmount?: Decimal;
  /** AGI (Form 1040 Line 11) — denominator for Line 3e apportionment ratio */
  agi?: Decimal;
}

/** Schedule B reconciliation detail for a single carryforward year */
export interface ScheduleBYearDetail {
  taxYear: number;
  amountAvailable: Decimal;
  amountUsed: Decimal;
  amountExpired: Decimal;
  amountRemaining: Decimal;
}

export interface Form1116Result {
  simplifiedEligible: boolean;
  foreignSourceIncome: Decimal; // Line 1a
  apportionedDeductions: Decimal; // Line 3e
  netForeignSourceIncome: Decimal; // Line 3f
  foreignTaxesPaid: Decimal; // Line 7 (current-year taxes only, before carryforward)
  foreignTaxesPaidPlusCarryforward: Decimal; // Total creditable taxes including carryforward
  limitation: Decimal; // Line 20
  creditAllowed: Decimal; // Line 21
  carryforward: Decimal; // Aggregate carryforward for backward compat
  /** Per-year remaining carryforward (Schedule B output) */
  carryforwardByYear: FTCCarryforwardEntry[];
  /** Total expired credits from Schedule B reconciliation */
  carryforwardExpired: Decimal;
  /** Schedule B year-by-year reconciliation detail */
  scheduleBDetail: ScheduleBYearDetail[];
  lines: CalculatedLine[];
}

/** Thresholds for simplified (direct) method */
const SIMPLIFIED_THRESHOLD: Record<FilingStatus, Decimal> = {
  single: new Decimal(300),
  married_filing_jointly: new Decimal(600),
  married_filing_separately: new Decimal(300),
  head_of_household: new Decimal(300),
  qualifying_surviving_spouse: new Decimal(600),
};

/**
 * Determine simplified method from 1099-DIV/INT data.
 * Eligible if all foreign tax is from 1099-DIV/INT passive income
 * and total ≤ threshold.
 */
export function isSimplifiedEligible(
  input: TaxYearInput,
  filingStatus: FilingStatus
): boolean {
  const threshold = SIMPLIFIED_THRESHOLD[filingStatus];
  const totalForeignFromDiv = input.form1099Div.reduce(
    (acc, div) => acc.plus(d(div.foreignTaxPaid)),
    new Decimal(0)
  );
  const totalForeignFromInt = input.form1099Int.reduce(
    (acc, interest) => acc.plus(d(interest.foreignTaxPaid)),
    new Decimal(0)
  );
  const totalForeignFromQualifiedPayeeStatements = totalForeignFromDiv.plus(totalForeignFromInt);
  // K-1 foreign taxes disqualify from simplified method (not passive-only 1099 income)
  const k1ForeignTax = input.scheduleK1.reduce(
    (acc, k1) => acc.plus(d(k1.foreignTaxPaid)),
    new Decimal(0)
  );
  return k1ForeignTax.isZero() && totalForeignFromQualifiedPayeeStatements.lte(threshold);
}

function positiveAmount(value: Parameters<typeof d>[0]): Decimal {
  return Decimal.max(new Decimal(0), d(value));
}

export function estimateForeignSourceIncomeFrom1099Div(input: TaxYearInput): Decimal {
  return input.form1099Div
    .filter((div) => d(div.foreignTaxPaid).greaterThan(0))
    .reduce(
      (acc, div) => acc.plus(
        positiveAmount(div.ordinaryDividends).plus(positiveAmount(div.totalCapitalGainDistributions))
      ),
      new Decimal(0)
    );
}

export function estimateForeignSourceIncomeFrom1099Int(input: TaxYearInput): Decimal {
  return input.form1099Int
    .filter((interest) => d(interest.foreignTaxPaid).greaterThan(0))
    .reduce((acc, interest) => acc.plus(positiveAmount(interest.interestIncome)), new Decimal(0));
}

export function estimateForeignSourceIncomeFromScheduleK1(input: TaxYearInput): Decimal {
  return input.scheduleK1
    .filter((k1) => d(k1.foreignTaxPaid).greaterThan(0))
    .reduce((acc, k1) => {
      // When explicit foreignSourceIncome is provided (Box 16 Codes D/E/F),
      // use it instead of the heuristic that sums all K-1 income fields.
      if (k1.foreignSourceIncome !== undefined) {
        return acc.plus(positiveAmount(k1.foreignSourceIncome));
      }
      return acc.plus(sum(
        positiveAmount(k1.ordinaryIncome),
        positiveAmount(k1.netRentalIncome),
        positiveAmount(k1.otherNetRentalIncome),
        positiveAmount(k1.guaranteedPayments),
        positiveAmount(k1.interestIncome),
        positiveAmount(k1.ordinaryDividends),
        positiveAmount(k1.royalties),
        positiveAmount(k1.netShortTermCapitalGain),
        positiveAmount(k1.netLongTermCapitalGain),
        positiveAmount(k1.section1231Gain),
        positiveAmount(k1.otherIncome),
      ));
    }, new Decimal(0));
}

export function estimateForeignSourceIncomeFromScheduleK1Form1041(input: TaxYearInput): Decimal {
  return (input.scheduleK1Form1041 ?? [])
    .filter((k) => d(k.foreignTaxesPaid).greaterThan(0))
    .reduce((acc, k) => acc.plus(sum(
      positiveAmount(k.interestIncome),
      positiveAmount(k.ordinaryDividends),
      positiveAmount(k.netShortTermCapitalGain),
      positiveAmount(k.netLongTermCapitalGain),
      positiveAmount(k.otherPortfolioIncome),
    )), new Decimal(0));
}

export function estimateForeignSourceIncome(input: TaxYearInput): Decimal {
  return sum(
    estimateForeignSourceIncomeFrom1099Div(input),
    estimateForeignSourceIncomeFrom1099Int(input),
    estimateForeignSourceIncomeFromScheduleK1(input),
    estimateForeignSourceIncomeFromScheduleK1Form1041(input),
  );
}

const FTC_CARRYFORWARD_YEARS = 10;
const ZERO = new Decimal(0);
const DEFAULT_TAX_YEAR = 2025;

/**
 * Build the resolved per-year carryforward entries.
 * If per-year entries are provided, use those (filtered for 10-year window).
 * Otherwise, convert the legacy single amount into a single entry from taxYear-1.
 */
function resolveCarryforwardEntries(
  input: Form1116Input
): FTCCarryforwardEntry[] {
  if (input.priorYearCarryforwardByYear && input.priorYearCarryforwardByYear.length > 0) {
    return input.priorYearCarryforwardByYear
      .filter((entry) => d(entry.amount).greaterThan(0))
      .map((entry) => ({ taxYear: entry.taxYear, amount: d(entry.amount) }))
      .sort((a, b) => a.taxYear - b.taxYear);
  }

  const legacy = input.priorYearCarryforward ?? ZERO;
  if (legacy.isZero()) {
    return [];
  }

  const currentTaxYear = input.currentTaxYear ?? DEFAULT_TAX_YEAR;
  return [{ taxYear: currentTaxYear - 1, amount: legacy }];
}

/**
 * Apply FIFO ordering to carryforward entries against available excess limitation.
 * Credits older than 10 years from the current tax year expire.
 */
function reconcileScheduleB(
  entries: FTCCarryforwardEntry[],
  currentTaxYear: number,
  excessLimitation: Decimal
): {
  detail: ScheduleBYearDetail[];
  totalUsed: Decimal;
  totalExpired: Decimal;
  remaining: FTCCarryforwardEntry[];
} {
  const detail: ScheduleBYearDetail[] = [];
  const remaining: FTCCarryforwardEntry[] = [];
  let availableLimitation = Decimal.max(ZERO, excessLimitation);
  let totalUsed = ZERO;
  let totalExpired = ZERO;

  // Process FIFO — entries already sorted oldest first
  for (const entry of entries) {
    const age = currentTaxYear - entry.taxYear;
    const expired = age > FTC_CARRYFORWARD_YEARS;

    if (expired) {
      detail.push({
        taxYear: entry.taxYear,
        amountAvailable: entry.amount,
        amountUsed: ZERO,
        amountExpired: entry.amount,
        amountRemaining: ZERO,
      });
      totalExpired = totalExpired.plus(entry.amount);
      continue;
    }

    const used = Decimal.min(entry.amount, availableLimitation);
    const remainder = entry.amount.minus(used);
    availableLimitation = availableLimitation.minus(used);
    totalUsed = totalUsed.plus(used);

    detail.push({
      taxYear: entry.taxYear,
      amountAvailable: entry.amount,
      amountUsed: used,
      amountExpired: ZERO,
      amountRemaining: remainder,
    });

    if (remainder.greaterThan(0)) {
      remaining.push({ taxYear: entry.taxYear, amount: remainder });
    }
  }

  return { detail, totalUsed, totalExpired, remaining };
}

export function calculateForm1116(input: Form1116Input): Form1116Result {
  const audit = new AuditTrail();

  const simplifiedEligible = !input.hasDisqualifyingForeignTaxSources
    && input.foreignTaxesPaid.lte(SIMPLIFIED_THRESHOLD[input.filingStatus]);
  audit.record(
    "Form 1116",
    "simplified_eligible",
    "Simplified method eligible",
    new Decimal(simplifiedEligible ? 1 : 0),
    "Foreign tax ≤ threshold and no disqualifying non-1099 foreign tax sources",
    {
      disqualifyingSources: input.hasDisqualifyingForeignTaxSources ? "yes" : "no",
    }
  );

  // Line 1a: Foreign source income
  const foreignSourceIncome = input.foreignSourceIncome;
  audit.record("Form 1116", "1a", "Foreign source taxable income", foreignSourceIncome,
    "Gross foreign income by category");

  // Line 3e: Apportioned deductions (IRS Form 1116 Instructions, Line 3e Worksheet)
  let apportionedDeductions = new Decimal(0);
  if (input.deductionAmount && input.agi && input.agi.greaterThan(0) && foreignSourceIncome.greaterThan(0)) {
    const apportionRatio = min(foreignSourceIncome.div(input.agi), new Decimal(1));
    apportionedDeductions = roundDollar(input.deductionAmount.times(apportionRatio));
  }
  audit.record("Form 1116", "3e", "Apportioned deductions", apportionedDeductions,
    input.deductionAmount && input.agi
      ? `$${input.deductionAmount} × ($${foreignSourceIncome} / $${input.agi})`
      : "No deduction/AGI provided");

  // Line 3f: Net foreign source taxable income
  const netForeignSourceIncome = zeroFloor(foreignSourceIncome.minus(apportionedDeductions));
  audit.record("Form 1116", "3f", "Net foreign source taxable income", netForeignSourceIncome,
    "Line 1a - Line 3e");

  // ── Schedule B: Per-year carryforward reconciliation ─────
  const currentTaxYearResolved = input.currentTaxYear ?? DEFAULT_TAX_YEAR;
  const carryforwardEntries = resolveCarryforwardEntries(input);
  // Only non-expired carryforward counts toward available credit (expired credits are forfeited)
  const nonExpiredEntries = carryforwardEntries.filter(
    (e) => (currentTaxYearResolved - e.taxYear) <= FTC_CARRYFORWARD_YEARS
  );
  const totalCarryforwardAvailable = sum(...nonExpiredEntries.map((e) => e.amount));

  // Line 7: Current-year foreign taxes paid (without carryforward for clarity)
  const foreignTaxesPaid = input.foreignTaxesPaid;
  const foreignTaxesPaidPlusCarryforward = foreignTaxesPaid.plus(totalCarryforwardAvailable);
  audit.record("Form 1116", "7", "Foreign taxes paid or accrued", foreignTaxesPaidPlusCarryforward,
    carryforwardEntries.length > 0
      ? `Current-year foreign taxes ($${foreignTaxesPaid}) + carryforward from ${carryforwardEntries.length} prior year(s) ($${totalCarryforwardAvailable})`
      : "Sum of creditable foreign taxes (no carryforward)");

  // Line 20: Limitation
  let limitation: Decimal;
  if (input.totalTaxableIncome.isZero() || netForeignSourceIncome.isZero()) {
    limitation = new Decimal(0);
  } else {
    const limitRatio = min(
      netForeignSourceIncome.div(input.totalTaxableIncome),
      new Decimal(1)
    );
    limitation = roundDollar(input.taxBeforeCredits.times(limitRatio));
  }
  audit.record("Form 1116", "20", "Foreign tax credit limitation", limitation,
    "taxBeforeCredits × (foreign source / worldwide)");

  // Line 21: Credit allowed = min(total taxes, limitation)
  const creditAllowed = min(foreignTaxesPaidPlusCarryforward, limitation);
  audit.record("Form 1116", "21", "Foreign tax credit allowed", creditAllowed,
    "min(Line 7, Line 20)");

  // ── Schedule B FIFO reconciliation ──────────────────────
  // Excess limitation = limitation - current-year taxes used
  // Current-year taxes are applied first, then carryforward FIFO
  const currentYearTaxesUsed = min(foreignTaxesPaid, limitation);
  const excessLimitation = zeroFloor(limitation.minus(currentYearTaxesUsed));

  const scheduleBResult = reconcileScheduleB(
    carryforwardEntries,
    currentTaxYearResolved,
    excessLimitation
  );

  // Current-year unused credit becomes new carryforward entry
  const currentYearExcessCredit = zeroFloor(foreignTaxesPaid.minus(currentYearTaxesUsed));
  const carryforwardByYear: FTCCarryforwardEntry[] = [
    ...scheduleBResult.remaining,
    ...(currentYearExcessCredit.greaterThan(0)
      ? [{ taxYear: currentTaxYearResolved, amount: currentYearExcessCredit }]
      : []),
  ];

  const carryforward = sum(...carryforwardByYear.map((e) => e.amount));

  // Add current-year detail to Schedule B if there's excess credit
  const scheduleBDetail: ScheduleBYearDetail[] = [
    ...scheduleBResult.detail,
    ...(currentYearExcessCredit.greaterThan(0)
      ? [{
        taxYear: currentTaxYearResolved,
        amountAvailable: foreignTaxesPaid,
        amountUsed: currentYearTaxesUsed,
        amountExpired: ZERO,
        amountRemaining: currentYearExcessCredit,
      }]
      : []),
  ];

  audit.record("Form 1116", "carryforward", "Unused FTC carryforward", carryforward,
    carryforwardByYear.length > 0
      ? `Carryforward from ${carryforwardByYear.length} year(s): ${carryforwardByYear.map((e) => `${e.taxYear}: $${e.amount}`).join(", ")}`
      : "No unused foreign tax credit to carry forward");

  if (scheduleBResult.totalExpired.greaterThan(0)) {
    audit.record("Form 1116", "schedule-b-expired", "Expired FTC carryforward",
      scheduleBResult.totalExpired,
      `Credits expired (older than ${FTC_CARRYFORWARD_YEARS} years)`,
      Object.fromEntries(
        scheduleBResult.detail
          .filter((d) => d.amountExpired.greaterThan(0))
          .map((d) => [`Tax year ${d.taxYear}`, d.amountExpired])
      ));
  }

  if (scheduleBResult.totalUsed.greaterThan(0)) {
    audit.record("Form 1116", "schedule-b-used", "Carryforward credits used this year",
      scheduleBResult.totalUsed,
      `FIFO: oldest year first against excess limitation of $${excessLimitation}`,
      Object.fromEntries(
        scheduleBResult.detail
          .filter((d) => d.amountUsed.greaterThan(0))
          .map((d) => [`Tax year ${d.taxYear} used`, d.amountUsed])
      ));
  }

  return {
    simplifiedEligible,
    foreignSourceIncome,
    apportionedDeductions,
    netForeignSourceIncome,
    foreignTaxesPaid,
    foreignTaxesPaidPlusCarryforward,
    limitation,
    creditAllowed,
    carryforward,
    carryforwardByYear,
    carryforwardExpired: scheduleBResult.totalExpired,
    scheduleBDetail,
    lines: audit.getLines(),
  };
}
