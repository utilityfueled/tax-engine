/** Original historical-adoption records remain verifiable after render redaction.
 * Spec: form-8839-history-review.yaml. No source amount or identity is invented. */
import { createHash } from 'node:crypto';
import { calculateFederalTax } from '@/engine/federal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { d } from '@/utils/decimal.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';

const brand = Symbol('prepared historical adoption review');
export interface PreparedAdoptionReview { readonly [brand]: true }
const contexts = new WeakMap<PreparedAdoptionReview, {
  original: TaxYearInput; originalDigest: string; redactedDigest: string; calculationDigest: string;
}>();
function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function calculationDigest(result: TaxReturnResult): string {
  return digest(redactReviewIdentifiers({ taxYear: result.taxYear, filingStatus: result.filingStatus, agi: result.agi,
    form8839: result.form8839, transfer: result.allLines.filter(row => row.form === '1040' && row.line === '1f') }));
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function hasHistoricalAdoptionSources(input: TaxYearInput): boolean {
  return input.form8839?.children.some(child => child.priorYearForeignBenefitHistory !== undefined || d(child.priorYearForeignBenefits).gt(0)) ?? false;
}
/** Full original income determines exclusion and credit MAGI. Validate it once
 * before redaction; the caller's retained result cannot certify itself. */
export function prepareAdoptionReview(input: TaxYearInput): PreparedAdoptionReview {
  if (!hasHistoricalAdoptionSources(input)) throw new Error('Adoption review requires original historical benefit sources');
  const calculation = calculateFederalTax(input);
  if (!calculation.form8839) throw new Error('Adoption review requires the completed original Form8839 calculation');
  const token: PreparedAdoptionReview = Object.freeze({ [brand]: true as const });
  contexts.set(token, { original: freeze(structuredClone(input)), originalDigest: digest(input),
    redactedDigest: digest(redactReviewIdentifiers(input)), calculationDigest: calculationDigest(calculation) });
  return token;
}
/** Only ordinal/static amount rows may be rendered from this private clone. */
export function adoptionReviewOriginalSourceInput(input: TaxYearInput, result: TaxReturnResult, token?: PreparedAdoptionReview): TaxYearInput {
  const context = contexts.get(token ?? prepareAdoptionReview(input));
  if (!context) throw new Error('Adoption requires an original prepared review context');
  const actual = digest(input);
  if (actual !== context.originalDigest && actual !== context.redactedDigest) throw new Error('Adoption review original source records are stale or conflicting');
  if (calculationDigest(result) !== context.calculationDigest) throw new Error('Adoption review retained calculation and signed transfer do not reconcile');
  return structuredClone(context.original);
}
