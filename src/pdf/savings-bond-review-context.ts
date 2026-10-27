/** Original bond history and income survive render-only redaction privately. */
import { createHash } from "node:crypto";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { redactReviewIdentifiers } from "./redact-review-identifiers.js";

const brand = Symbol("prepared savings-bond originals");
export interface PreparedSavingsBondReview { readonly [brand]: true }
const contexts = new WeakMap<PreparedSavingsBondReview, {
  original: TaxYearInput; originalDigest: string; redactedDigest: string; calculationDigest: string;
}>();
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function calculationDigest(result: TaxReturnResult): string {
  return digest(redactReviewIdentifiers({ taxYear: result.taxYear, filingStatus: result.filingStatus,
    agi: result.agi, totalInterest: result.totalInterest, form8815: result.form8815, scheduleB: result.scheduleB,
    schedule1: result.schedule1, allLines: result.allLines.filter(row => ["Form 8815", "Savings bond reissue sources", "Sched B", "Educator education exclusions"].includes(row.form)
      || (row.form === "1040" && ["2b", "11"].includes(row.line))) }));
}
export function hasSavingsBondReviewSources(input: TaxYearInput): boolean {
  return input.form8815?.reissueSources !== undefined || (input.savingsBondRedemptions ?? []).some(row => row.reissueSourceId !== undefined);
}
export function prepareSavingsBondReview(input: TaxYearInput): PreparedSavingsBondReview {
  if (!hasSavingsBondReviewSources(input)) throw new Error("Savings-bond review requires original reissue sources.");
  const result = calculateFederalTax(input);
  if (!result.form8815?.reissueSourcesVerified) throw new Error("Savings-bond review requires the completed original history and return calculation.");
  const token: PreparedSavingsBondReview = Object.freeze({ [brand]: true as const });
  contexts.set(token, { original: structuredClone(input), originalDigest: digest(input),
    redactedDigest: digest(redactReviewIdentifiers(input)), calculationDigest: calculationDigest(result) });
  return token;
}
export function savingsBondReviewOriginalInput(input: TaxYearInput, result: TaxReturnResult, token: PreparedSavingsBondReview): TaxYearInput {
  const context = contexts.get(token);
  if (!context) throw new Error("Savings-bond review requires an original prepared private context.");
  const current = digest(input);
  if (current !== context.originalDigest && current !== context.redactedDigest) throw new Error("Savings-bond review original history, income or statement source is stale.");
  if (calculationDigest(result) !== context.calculationDigest) throw new Error("Savings-bond review calculation, reporting or audit does not reconcile.");
  return structuredClone(context.original);
}
