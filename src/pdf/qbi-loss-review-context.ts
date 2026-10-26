/** Original QBI loss records remain verifiable after render-only redaction.
 * Spec: qbi-loss-review.yaml. No source or calculated allowance is invented. */
import { createHash } from 'node:crypto';
import { calculateFederalTax } from '@/engine/federal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';

const brand = Symbol('prepared QBI loss review');
export interface PreparedQbiLossReview { readonly [brand]: true }
const contexts = new WeakMap<PreparedQbiLossReview, {
  original: TaxYearInput; originalDigest: string; redactedDigest: string; calculationDigest: string;
}>();
function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function calculationDigest(result: TaxReturnResult): string {
  return digest(redactReviewIdentifiers({ taxYear: result.taxYear, filingStatus: result.filingStatus, agi: result.agi,
    taxableIncome: result.taxableIncome, scheduleE: result.scheduleE, scheduleSE: result.scheduleSE,
    form8582: result.form8582, form461: result.form461, form8995: result.form8995, form8995A: result.form8995A,
    netOperatingLoss: result.netOperatingLoss, qbiEblNol: result.qbiEblNol, codNolReduction: result.codNolReduction,
    carryforwards: result.carryforwards, allLines: result.allLines }));
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
/** Recompute using actual complete identity/income before redaction. The
 * supplied retained result cannot be evidence for its own source correctness. */
export function prepareQbiLossReview(input: TaxYearInput): PreparedQbiLossReview {
  if (!input.qbiLossSources) throw new Error('QBI loss review requires original loss sources');
  const calculation = calculateFederalTax(input);
  const token: PreparedQbiLossReview = Object.freeze({ [brand]: true as const });
  contexts.set(token, { original: freeze(structuredClone(input)), originalDigest: digest(input),
    redactedDigest: digest(redactReviewIdentifiers(input)), calculationDigest: calculationDigest(calculation) });
  return token;
}
/** The private clone is for validation and static ordinal rows only. */
export function qbiLossReviewOriginalSourceInput(input: TaxYearInput, result: TaxReturnResult, token?: PreparedQbiLossReview): TaxYearInput {
  const context = contexts.get(token ?? prepareQbiLossReview(input));
  if (!context) throw new Error('QBI losses require an original prepared review context');
  const actual = digest(input);
  if (actual !== context.originalDigest && actual !== context.redactedDigest) throw new Error('QBI loss review original sources are stale or conflicting');
  if (calculationDigest(result) !== context.calculationDigest) throw new Error('QBI loss review retained calculation and carry ledgers do not reconcile');
  return structuredClone(context.original);
}
