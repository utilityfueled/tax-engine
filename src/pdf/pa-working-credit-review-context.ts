/** WPTC-only source binding; this context does not qualify unrelated PA payment sources. */
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { calculatePAReturn, type PAOrchestratorResult } from "@/engine/state/pa-orchestrator.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { redactReviewIdentifiers } from "./redact-review-identifiers.js";
const brand = Symbol("prepared PA working credit review");
export interface PreparedPAWorkingCreditReview { readonly [brand]: true }
interface Context { original: TaxYearInput; originalDigest: string; redactedDigest: string; expected: PAOrchestratorResult }
const contexts = new WeakMap<PreparedPAWorkingCreditReview, Context>();
const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fail(detail: string): never { throw new Error(`PA WPTC source review: ${detail}`); }
export function preparePAWorkingCreditReview(input: TaxYearInput): PreparedPAWorkingCreditReview {
  if (![input.form1099B, input.form1099Nec, input.form1099Misc, input.form1099G, input.scheduleK1, input.form1098, input.form1095A, input.donations].every(Array.isArray)) fail("complete canonical original source arrays are required; field diagnostics do not admit actual source packets");
  const original = structuredClone(input);
  const expected = calculatePAReturn(original);
  const token: PreparedPAWorkingCreditReview = Object.freeze({ [brand]: true as const });
  contexts.set(token, { original, originalDigest: digest(original), redactedDigest: digest(redactReviewIdentifiers(original)), expected });
  return token;
}
function sameAmount(actual: unknown, expected: Decimal, label: string): void {
  if (!Decimal.isDecimal(actual) || !actual.isFinite() || !actual.eq(expected)) fail(`${label} does not reconcile`);
}
export function assertPAWorkingCreditReview(input: TaxYearInput, result: TaxReturnResult, token?: PreparedPAWorkingCreditReview): void {
  const saved = result.stateReturns?.pennsylvania;
  if (!saved) fail("PA result is missing");
  if (result.taxYear !== input.taxpayer.taxYear) fail("actual and retained source years conflict");
  // The separate NR/part-year orchestrator has no WPTC source method yet.
  // Preserve its existing zero-credit physical mapping without representing qualification.
  if (input.paNonresidentReturn && "residencyStatus" in saved) {
    if (token !== undefined || "workingCreditSourceCommitment" in saved || "workingPennsylvaniansTaxCredit" in saved || "workingCreditProcessing" in saved) fail("nonresident WPTC source method is unavailable");
    if (!saved.pa40.refundableCredits.eq(0)) fail("unprinted refundable credit cannot enter paper PA-40 totals");
    return;
  }
  if (!saved.pa40.refundableCredits.eq(0)) fail("unprinted refundable credit cannot enter actual paper PA-40 totals");
  let context: Context | undefined;
  if (token !== undefined) {
    context = contexts.get(token);
    if (!context) fail("an original prepared context is required");
    const actual = digest(input);
    if (actual !== context.originalDigest && actual !== context.redactedDigest) fail("original sources changed after preparation");
  } else {
    // Always inspect actual input, even when every retained WPTC route marker was stripped.
    const prepared = preparePAWorkingCreditReview(input);
    context = contexts.get(prepared)!;
  }
  const expected = context.expected;
  const actualCredit = expected.workingPennsylvaniansTaxCredit;
  const hasSavedSource = "workingCreditSourceCommitment" in saved && saved.workingCreditSourceCommitment !== undefined;
  const hasSavedCredit = "workingPennsylvaniansTaxCredit" in saved && saved.workingPennsylvaniansTaxCredit !== undefined;
  const hasSavedProcessing = "workingCreditProcessing" in saved && saved.workingCreditProcessing !== undefined;
  // Historical zero-credit mapping-only records remain usable; no source qualification is inferred.
  if (token === undefined && !hasSavedSource && !hasSavedCredit && !hasSavedProcessing && !actualCredit?.credit.gt(0)) return;
  if (!hasSavedSource || saved.workingCreditSourceCommitment !== expected.workingCreditSourceCommitment) fail("retained original source commitment is missing or stale");
  if (!hasSavedCredit || digest(saved.workingPennsylvaniansTaxCredit) !== digest(actualCredit)) fail("retained credit does not reconcile with actual federal and PA sources");
  if (!hasSavedProcessing || !saved.workingCreditProcessing) fail("processing reference is missing");
  const credit = actualCredit?.credit ?? new Decimal(0);
  const processing = saved.workingCreditProcessing;
  if (processing.stage !== "department-processing-reference") fail("processing reference stage is invalid");
  sameAmount(processing.credit, credit, "processing credit");
  sameAmount(processing.creditAppliedToTaxDue, Decimal.min(credit, saved.pa40.taxDue), "processing applied credit");
  sameAmount(processing.remainingTaxDueBeforePenalties, Decimal.max(0, saved.pa40.taxDue.minus(credit)), "processing remaining principal");
  sameAmount(processing.additionalOverpaymentBeforePenalties, Decimal.max(0, credit.minus(saved.pa40.taxDue)), "processing additional overpayment");
  const paperPayments = saved.pa40.stateWithholding.plus(saved.pa40.totalEstimatedPaymentsAndCredits)
    .plus(saved.pa40.taxForgivenessCredit).plus(saved.pa40.residentCredit).plus(saved.pa40.otherCredits);
  sameAmount(saved.pa40.totalPaymentsAndCredits, paperPayments, "printed paper payments and credits");
}
