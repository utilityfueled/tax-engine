/** Source-complete ordinary2025 integration. Spec: state/oh-payment-dated-source.yaml. */
import Decimal from "decimal.js";
import { roundDollar, zeroFloor } from "@/utils/decimal.js";
import { calculateOhioITSD2210, type OhioITSD2210Result } from "./oh-it-sd-2210.js";
import { calculateOhioDatedPartII, type OhioDatedPartIIResult } from "./oh-it-sd-2210-dated.js";
import type { OhioPaymentSourceProjection } from "./oh-payment-source.js";

export interface OhioDatedPaymentInterestResult {
  /** PartI and total; endpoint quarter factors are inapplicable to changing balances. */
  worksheet: OhioITSD2210Result;
  partII: OhioDatedPartIIResult | null;
}
const fail = (detail: string): never => { throw new Error(`Ohio actual dated payment sources: ${detail}`); };
const endpoints = [["2025-04-15", ".25"], ["2025-06-16", ".50"], ["2025-09-15", ".75"], ["2026-01-15", "1"]] as const;

/** Called after the return derives current IT1040 line10 minus line16 and actual OH withholding. */
export function calculateOhioDatedPaymentInterest(
  source: OhioPaymentSourceProjection,
  currentYearTaxLiability: Decimal,
  ohioWithholding: Decimal,
): OhioDatedPaymentInterestResult {
  if (source.facts.taxYear !== 2025 || source.methodVersion !== "ohio-it1040-actual-dated-payment-sources-v1" || !source.datedPayments)
    return fail("complete current actual dated source projection is required");
  if (!currentYearTaxLiability.isFinite() || !ohioWithholding.isFinite() || ohioWithholding.isNegative())
    return fail("actual current tax and withholding must be finite");
  for (const receipt of source.datedPayments) {
    if (!receipt.amount.isFinite() || receipt.amount.isNegative() || !receipt.amount.isInteger())
      return fail("actual receipt cents require their separate method; whole-dollar receipts only");
  }
  const liability = roundDollar(currentYearTaxLiability), withheld = roundDollar(ohioWithholding);
  const principal = zeroFloor(liability.minus(withheld).minus(roundDollar(source.estimatedPayments)));
  const coverage = source.facts.remainingTaxPayment;
  if (coverage.status === "expected_payment") return fail("expected payment is not actual settlement evidence");
  if (coverage.status === "no_remaining_tax" ? principal.gt(0) : new Decimal(coverage.amountAppliedToTax).lt(principal))
    return fail("actual remaining-tax payment does not cover fresh principal");
  const worksheet = calculateOhioITSD2210({
    taxYear: source.facts.taxYear, currentYearTaxLiability: liability, ohioWithholding: withheld,
    estimatedPayments: source.estimatedPayments, estimatedPaymentSchedule: source.estimatedPaymentSchedule,
    priorYearTaxLiability: source.priorYearTaxLiability, priorYearTimelyFiled: source.priorYearTimelyFiled,
  });
  const paidThrough = (date: string) => roundDollar(source.estimatedPaymentSchedule.filter(row => row.date <= date).reduce((sum, row) => sum.plus(row.amount), new Decimal(0)));
  const covered = (required: Decimal) => endpoints.every(([date, fraction]) => roundDollar(withheld.times(fraction)).plus(paidThrough(date)).gte(roundDollar(required.times(fraction))));
  // The pre-existing annual-cash catchup guard is retained. A PartII source
  // successor cannot silently settle that separate PartI interpretation.
  if (worksheet.safeHarborA && !covered(roundDollar(liability.times(".90")))
      || worksheet.safeHarborB && !covered(roundDollar(source.priorYearTaxLiability ?? new Decimal(0))))
    return fail("actual timely installment coverage requires its separate dated payment method");
  if (worksheet.penaltyExempt) return { worksheet, partII: null };
  const partII = calculateOhioDatedPartII({
    taxYear: source.facts.taxYear, requiredAnnualPayment: worksheet.line9_requiredAnnualPayment,
    annualWithholding: withheld, actualAsOfDate: source.asOfDate, payments: source.datedPayments,
  });
  const partILines = worksheet.lines.filter(line => ["1", "2", "3", "4-5", "6-7", "8", "9"].includes(line.line));
  return { worksheet: { ...worksheet, quarters: null, line17_totalPenalty: partII.line17, lines: [...partILines, ...partII.lines] }, partII };
}
