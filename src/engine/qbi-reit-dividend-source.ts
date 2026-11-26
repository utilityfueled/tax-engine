import type { Form1099Div } from "@/models/inputs.js";
import { isActualDate } from "@/utils/civil-date.js";
import { d } from "@/utils/decimal.js";

const MILLISECONDS_PER_DAY = 86_400_000;

function reitCivilDay(value: string): number {
  if (!isActualDate(value)) throw new Error("Enter the actual dates from the REIT distribution and holding records.");
  return Date.parse(`${value}T00:00:00Z`) / MILLISECONDS_PER_DAY;
}

function normalizeReference(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function assertUniqueDirectReitDividend(form: Form1099Div, jointReturn: boolean, seen: Set<string>): void {
  const source = form.directReitDividendFacts;
  if (!source) return;
  const account = normalizeReference(form.accountReference ?? "");
  const compactAccount = account.replace(/[\s-]/g, "");
  if (!compactAccount || /[*•●…]|\.{3}|\b(?:last\s+(?:4|four)|end(?:ing|s)?\s+in)\b/i.test(account)
    || /^(?:x{2,}\d*|\d{1,4})$/i.test(compactAccount)) {
    throw new Error("Enter an actual, unambiguous account reference for the direct REIT dividend.");
  }
  if ((jointReturn && !form.accountHolder)
    || (!jointReturn && form.accountHolder === "spouse")) {
    throw new Error("Enter the actual account and holder for the direct REIT dividend.");
  }
  const original = JSON.stringify(["original", normalizeReference(source.sourceReference)]);
  const distribution = JSON.stringify([
    "distribution", form.accountHolder ?? "primary", compactAccount,
    normalizeReference(source.securityIdentifier), source.exDividendOn,
  ]);
  if (seen.has(original) || seen.has(distribution)) {
    throw new Error("A repeated direct REIT distribution record cannot qualify under Box 5 twice.");
  }
  seen.add(original);
  seen.add(distribution);
}

/** 26 CFR §1.199A-3(c)(2)(ii) and IRC §246(c)(3)–(4). */
export function resolveQualifiedReitBox5(form: Form1099Div, taxYear: number, calculationDate: string) {
  const reported = d(form.section199ADividends);
  const source = form.directReitDividendFacts;
  if (taxYear !== 2026 || (reported.isZero() && !source)) return reported;
  if (!source || source.sourceFactsConfirmed !== true || source.singleDirectReitDistributionConfirmed !== true
    || source.sourceTaxYear !== taxYear || form.taxYear !== taxYear
    || !source.sourceReference.trim() || !source.securityIdentifier.trim() || !source.issuerName.trim()) {
    throw new Error("Enter actual 2026 direct REIT records that qualify the amount reported in Box 5.");
  }
  const original = d(source.originalBox5Amount);
  const related = d(source.relatedPaymentAmount);
  const qualifiedDividends = d(form.qualifiedDividends);
  if (!reported.isFinite() || reported.lte(0) || !reported.eq(original)
    || !qualifiedDividends.isFinite() || qualifiedDividends.isNegative()
    || reported.plus(qualifiedDividends).gt(d(form.ordinaryDividends))
    || !source.relatedPaymentAmount?.trim() || (!related.isZero() && !related.eq(reported))) {
    throw new Error("The direct REIT Box 5 record must match the actual ordinary dividend and the full or zero related-payment obligation.");
  }

  const acquired = reitCivilDay(source.acquiredOn);
  const exDividend = reitCivilDay(source.exDividendOn);
  const paid = reitCivilDay(source.paidOn);
  const heldThrough = reitCivilDay(source.heldThrough);
  const sourceAsOf = reitCivilDay(source.sourceAsOfDate);
  if (sourceAsOf > reitCivilDay(calculationDate) || paid > sourceAsOf || heldThrough > sourceAsOf) {
    throw new Error("Enter a direct REIT source date that covers the actual payment and holding records without using future facts.");
  }
  if (acquired >= exDividend || heldThrough < exDividend || paid < exDividend || !source.paidOn.startsWith(`${taxYear}-`)
    || typeof source.positionEnded !== "boolean") {
    throw new Error("The direct REIT holding period and payment must cover the actual ex-dividend date and statement year.");
  }
  const windowEnd = exDividend + 45;
  const firstQualifyingDay = Math.max(exDividend - 45, acquired + 1);
  const lastPotentialDay = Math.min(windowEnd, heldThrough);
  const daysHeldInWindow = lastPotentialDay - firstQualifyingDay + 1;
  if (!Number.isInteger(source.diminishedRiskDays) || source.diminishedRiskDays < 0 || source.diminishedRiskDays > daysHeldInWindow) {
    throw new Error("Reconcile the actual diminished-risk days to the direct REIT holding period.");
  }
  if (related.eq(reported)) return d(0);
  if (daysHeldInWindow - source.diminishedRiskDays > 45) return reported;
  if (source.positionEnded || heldThrough >= windowEnd) return d(0);
  throw new Error("The open REIT holding period does not yet establish more than 45 qualifying days.");
}
