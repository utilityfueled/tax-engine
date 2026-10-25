/** Validate original charitable identity before making a render-only copy. */
import { createHash } from "node:crypto";
import type { TaxYearInput } from "@/models/inputs.js";
import { validateCharitableCarryoverSources } from "@/engine/forms/charitable-carryover-source-validation.js";
import { charitableSourceDigest } from "@/utils/charitable-source-digest.js";
import { redactReviewIdentifiers } from "./redact-review-identifiers.js";

const brand = Symbol("prepared charitable review");
export interface PreparedCharitableReview { readonly [brand]: true }
const prepared = new WeakMap<PreparedCharitableReview, { originalDigest: string; redactedDigest: string }>();

function sourceDigest(input: TaxYearInput, redacted = false): string {
  const projection = { taxpayer: input.taxpayer, charitableCarryoverSources: input.charitableCarryoverSources,
    priorCharitableCarryforward: input.priorYear?.charitableCarryforward,
    priorCharitableCarryforwardByYear: input.priorYear?.charitableCarryforwardByYear,
    charitableDigest: charitableSourceDigest(input) };
  return createHash("sha256").update(JSON.stringify(redacted ? redactReviewIdentifiers(projection) : projection)).digest("hex");
}

/** Local only; never serialize a token or accept one from a client. */
export function prepareCharitableReview(input: TaxYearInput): PreparedCharitableReview {
  if (input.charitableCarryoverSources) validateCharitableCarryoverSources(input);
  const token: PreparedCharitableReview = Object.freeze({ [brand]: true as const });
  prepared.set(token, { originalDigest: sourceDigest(input), redactedDigest: sourceDigest(input, true) });
  return token;
}

export function assertCharitableReviewSource(input: TaxYearInput, token?: PreparedCharitableReview): void {
  if (token === undefined) {
    if (input.charitableCarryoverSources) validateCharitableCarryoverSources(input);
    return;
  }
  const context = prepared.get(token);
  if (!context) throw new Error("Charitable review requires an original prepared source context");
  const supplied = sourceDigest(input);
  if (supplied !== context.originalDigest && supplied !== context.redactedDigest) {
    throw new Error("Charitable review original source identity or history is stale or conflicting");
  }
}
