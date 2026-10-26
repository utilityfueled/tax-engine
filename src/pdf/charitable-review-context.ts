/** Validate original charitable identity before making a render-only copy. */
import { createHash } from "node:crypto";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateK1CharitableReturnSources } from "@/engine/forms/k1-charitable-return-sources.js";
import { validateCharitableCarryoverSources } from "@/engine/forms/charitable-carryover-source-validation.js";
import { charitableSourceDigest } from "@/utils/charitable-source-digest.js";
import { hasPriorCharitableNolSources, readPriorCharitableNolSources } from "@/utils/charitable-prior-nol-source.js";
import { redactReviewIdentifiers } from "./redact-review-identifiers.js";

const brand = Symbol("prepared charitable review");
export interface PreparedCharitableReview { readonly [brand]: true }
const prepared = new WeakMap<PreparedCharitableReview, {
  originalDigest: string; redactedDigest: string; original?: TaxYearInput; calculationDigest?: string;
}>();
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function calculationDigest(result: TaxReturnResult): string {
  // A caller may append an independently calculated state return after the
  // federal calculation. All federal values and audits must still match.
  const { stateReturns: _states, ...federal } = result;
  return digest(redactReviewIdentifiers(federal));
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function sourceDigest(input: TaxYearInput, redacted = false): string {
  if (input.k1CharitableSources || input.netOperatingLoss && hasPriorCharitableNolSources(input)) return digest(redacted ? redactReviewIdentifiers(input) : input);
  const projection = { taxpayer: input.taxpayer, charitableCarryoverSources: input.charitableCarryoverSources,
    priorCharitableCarryforward: input.priorYear?.charitableCarryforward,
    priorCharitableCarryforwardByYear: input.priorYear?.charitableCarryforwardByYear,
    charitableDigest: charitableSourceDigest(input) };
  return createHash("sha256").update(JSON.stringify(redacted ? redactReviewIdentifiers(projection) : projection)).digest("hex");
}

/** Retained prior-NOL evidence also requires the original packet; removing a
 * source attachment must not turn off its render-time validation. */
export function requiresPriorCharitableNolReview(input: TaxYearInput, result?: TaxReturnResult): boolean {
  return !!(input.netOperatingLoss && hasPriorCharitableNolSources(input)
    || result?.netOperatingLoss?.priorCharitableCarryover || result?.netOperatingLoss?.priorAlternativeCharitableCarryover
    || result?.allLines.some(row => row.form === "Prior Charitable NOL Carry"));
}

/** Local only; never serialize a token or accept one from a client. */
export function prepareCharitableReview(input: TaxYearInput): PreparedCharitableReview {
  if (input.charitableCarryoverSources) validateCharitableCarryoverSources(input);
  if (requiresPriorCharitableNolReview(input)) readPriorCharitableNolSources(input);
  const calculation = input.k1CharitableSources || requiresPriorCharitableNolReview(input) ? calculateFederalTax(input) : undefined;
  const token: PreparedCharitableReview = Object.freeze({ [brand]: true as const });
  prepared.set(token, { originalDigest: sourceDigest(input), redactedDigest: sourceDigest(input, true),
    ...(calculation ? { original: freeze(structuredClone(input)), calculationDigest: calculationDigest(calculation) } : {}),
  });
  return token;
}

export function assertCharitableReviewSource(input: TaxYearInput, token?: PreparedCharitableReview): void {
  if (token === undefined) {
    if (input.charitableCarryoverSources) validateCharitableCarryoverSources(input);
    if (input.k1CharitableSources) calculateK1CharitableReturnSources(input);
    if (requiresPriorCharitableNolReview(input)) readPriorCharitableNolSources(input);
    return;
  }
  const context = prepared.get(token);
  if (!context) throw new Error("Charitable review requires an original prepared source context");
  const supplied = sourceDigest(input);
  if (supplied !== context.originalDigest && supplied !== context.redactedDigest) {
    throw new Error("Charitable review original source identity or history is stale or conflicting");
  }
}

/** A private clone is used only for source validation, never for rendering IDs.
 * The retained output is compared with an independent original calculation. */
export function charitableReviewOriginalSourceInput(input: TaxYearInput, result: TaxReturnResult, token?: PreparedCharitableReview): TaxYearInput {
  if (requiresPriorCharitableNolReview(input, result) && !input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources) {
    throw new Error("Prior charitable review requires its retained original independent history sources");
  }
  const actual = token ?? (input.k1CharitableSources || requiresPriorCharitableNolReview(input, result) ? prepareCharitableReview(input) : undefined);
  assertCharitableReviewSource(input, actual);
  const context = actual ? prepared.get(actual) : undefined;
  if (context?.calculationDigest !== undefined && calculationDigest(result) !== context.calculationDigest) {
    throw new Error("Charitable review retained calculation and source balances do not reconcile");
  }
  return structuredClone(context?.original ?? input);
}
