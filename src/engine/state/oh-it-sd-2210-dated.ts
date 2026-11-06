/** Pure ordinary-calendar 2025 Part II successor; eligibility belongs to the caller. */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface OhioDatedPartIIInput {
  taxYear: number;
  requiredAnnualPayment: Decimal | string;
  annualWithholding: Decimal | string;
  actualAsOfDate: string;
  payments: ReadonlyArray<{ date: string; amount: Decimal | string }>;
}

export interface OhioDatedQuarter {
  dueDate: string;
  endDate: string;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  line14: Decimal;
  line16: Decimal;
  method: "published-endpoint" | "dated-precision-agreement";
}

export interface OhioDatedPartIIResult {
  methodVersion: "oh-2025-ordinary-dated-guarded-v2";
  quarters: OhioDatedQuarter[];
  line17: Decimal;
  lines: CalculatedLine[];
}

const DUE = ["2025-04-15", "2025-06-16", "2025-09-15", "2026-01-15", "2026-04-15"] as const;
const FRACTIONS = [".25", ".50", ".75", "1"] as const;
const FACTORS = [".013580", ".019932", ".026311", ".017248"] as const;
const PERIODS = [
  { dueDate: DUE[0], endDate: DUE[1], fraction: FRACTIONS[0], factor: FACTORS[0] },
  { dueDate: DUE[1], endDate: DUE[2], fraction: FRACTIONS[1], factor: FACTORS[1] },
  { dueDate: DUE[2], endDate: DUE[3], fraction: FRACTIONS[2], factor: FACTORS[2] },
  { dueDate: DUE[3], endDate: DUE[4], fraction: FRACTIONS[3], factor: FACTORS[3] },
] as const;
const DAY_MS = 86_400_000;

function actualDate(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Actual payment/as-of date must be an ISO calendar date");
  }
  const date = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid actual payment/as-of calendar date");
  }
  return date;
}

function wholeAmount(value: Decimal | string): Decimal {
  if (typeof value !== "string" && !Decimal.isDecimal(value)) {
    throw new Error("Whole-dollar monetary values must be Decimal or string");
  }
  const amount = new Decimal(value);
  if (!amount.isFinite() || amount.isNegative() || !amount.isInteger()) {
    throw new Error("Actual amounts must be finite nonnegative whole dollars; cents unavailable");
  }
  return amount;
}

/**
 * Requires independently established Part I eligibility, reported annual amounts,
 * actual receipt completeness/identity, and equal-quarter withholding eligibility.
 * No filing date, account selection, tax-year inference, or future nonpayment.
 */
export function calculateOhioDatedPartII(input: OhioDatedPartIIInput): OhioDatedPartIIResult {
  if (input.taxYear !== 2025) throw new Error("Ohio dated Part II tax year unavailable");
  const asOf = actualDate(input.actualAsOfDate);
  const required = wholeAmount(input.requiredAnnualPayment);
  const withholding = wholeAmount(input.annualWithholding);
  const payments = input.payments.map(payment => {
    const day = actualDate(payment.date);
    if (payment.date < "2025-01-01" || payment.date > DUE[4] || day > asOf) {
      throw new Error("Actual payment outside qualified dates or after actual as-of date");
    }
    return { date: payment.date, day, amount: wholeAmount(payment.amount) };
  }).sort((a, b) => a.day - b.day);
  const paidThrough = (day: number): Decimal => payments.reduce(
    (sum, payment) => payment.day <= day ? sum.plus(payment.amount) : sum,
    new Decimal(0),
  );
  const audit = new AuditTrail();
  const quarters: OhioDatedQuarter[] = [];
  for (const [q, period] of PERIODS.entries()) {
    const { dueDate, endDate } = period;
    const start = actualDate(dueDate);
    const end = actualDate(endDate);
    const line10 = roundDollar(required.times(period.fraction));
    const line11 = roundDollar(withholding.times(period.fraction));
    const line12 = paidThrough(start);
    const line13 = line11.plus(line12);
    const line14 = zeroFloor(line10.minus(line13));
    const interior = [...new Set(payments.filter(p => p.day > start && p.day < end).map(p => p.day))].filter(day => {
      // Receipt identity alone is not an accrual event. Aggregate same-day
      // receipts, then retain only days that actually reduce unpaid balance.
      // Otherwise a zero/excess receipt can change cent-segment rounding and
      // silently bypass the precision guard without changing economic facts.
      const paidBefore = payments.reduce((sum, payment) => payment.day < day ? sum.plus(payment.amount) : sum, new Decimal(0));
      const before = zeroFloor(line10.minus(line11).minus(paidBefore));
      const after = zeroFloor(line10.minus(line11).minus(paidThrough(day)));
      return after.lessThan(before);
    });
    // Exclude start/include end. Ending the old-rate segment on Dec31 charges
    // Jan1 itself at the new rate, rather than one extra day at the old rate.
    const rateBoundary = actualDate("2025-12-31");
    const events = [...new Set([...interior, ...(rateBoundary > start && rateBoundary < end ? [rateBoundary] : []), end])].sort((a, b) => a - b);
    let cursor = start;
    let balance = line14;
    let changed = false;
    let exact = new Decimal(0);
    let sixDigit = new Decimal(0);
    let cents = new Decimal(0);
    for (const event of events) {
      if (balance.greaterThan(0) && event > asOf) {
        throw new Error("Actual as-of evidence unavailable for future unpaid interest period");
      }
      const days = (event - cursor) / DAY_MS;
      const rate = cursor < rateBoundary ? ".08" : ".07";
      const factor = new Decimal(rate).times(days.toString()).div("365.25");
      const segment = balance.times(factor);
      exact = exact.plus(segment);
      sixDigit = sixDigit.plus(balance.times(factor.toDecimalPlaces(6, Decimal.ROUND_HALF_UP)));
      cents = cents.plus(segment.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
      if (event < end) {
        const next = zeroFloor(line10.minus(line11).minus(paidThrough(event)));
        if (next.lessThan(balance)) changed = true;
        balance = next;
      }
      cursor = event;
    }
    let line16: Decimal;
    const method = changed ? "dated-precision-agreement" : "published-endpoint";
    if (changed) {
      line16 = roundDollar(exact);
      if (!line16.equals(roundDollar(sixDigit)) || !line16.equals(roundDollar(cents))) {
        throw new Error("Ohio dated precision method unavailable: current full/partial precedents disagree");
      }
    } else {
      line16 = roundDollar(line14.times(period.factor));
    }
    const values = { "10": line10, "11": line11, "12": line12, "13": line13, "14": line14, "16": line16 };
    const formulas = {
      "10": "roundDollar(required annual payment × cumulative fraction)",
      "11": "roundDollar(annual withholding × cumulative fraction)",
      "12": "sum actual receipts on or before due date",
      "13": "line11 + line12",
      "14": "max(0, line10 - line13)",
      "16": changed ? "reported exact = six-digit-factor = cent-segment interest" : "roundDollar(line14 × published endpoint factor)",
    };
    for (const line of ["10", "11", "12", "13", "14", "16"] as const) {
      audit.record("OH-IT/SD-2210-Dated", `${line}-${q + 1}`, `Ordinary Part II line ${line}`, values[line], formulas[line], { method });
    }
    quarters.push({ dueDate, endDate, line10, line11, line12, line13, line14, line16, method });
  }
  const line17 = quarters.reduce((total, quarter) => total.plus(quarter.line16), new Decimal(0));
  audit.record("OH-IT/SD-2210-Dated", "17", "Total reported interest cells", line17, "sum four reported whole-dollar line16 values");
  return { methodVersion: "oh-2025-ordinary-dated-guarded-v2", quarters, line17, lines: audit.getLines() };
}
