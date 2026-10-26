/** Actual shared-policy sources stay private and verifiable after render redaction.
 * Spec: form-8962-shared-policy-review.yaml. */
import { createHash } from 'node:crypto';
import { calculateFederalTax } from '@/engine/federal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';

const brand = Symbol('prepared actual premium tax credit review');
export interface PreparedPremiumTaxCreditReview { readonly [brand]: true }
const contexts = new WeakMap<PreparedPremiumTaxCreditReview, {
  original: TaxYearInput; originalDigest: string; redactedDigest: string; calculationDigest: string;
}>();
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function calculationDigest(result: TaxReturnResult): string {
  return digest(redactReviewIdentifiers({ taxYear: result.taxYear, filingStatus: result.filingStatus, agi: result.agi,
    form8962: result.form8962, transfers: result.allLines.filter(row => /^Form\s?8962/.test(row.form)
      || (row.form === 'Schedule 2' && row.line === '1a') || (row.form === 'Schedule 3' && row.line === '9')) }));
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function hasSharedPremiumTaxCreditSources(input: TaxYearInput): boolean {
  return input.form8962?.allocationRequired === true || input.form8962?.sharedPolicyAllocations !== undefined;
}
/** Full original return income determines the credit. Retained results cannot
 * certify themselves, and a plain source/validation flag cannot create a token. */
export function preparePremiumTaxCreditReview(input: TaxYearInput): PreparedPremiumTaxCreditReview {
  if (!hasSharedPremiumTaxCreditSources(input)) throw new Error('Form8962 review requires original shared-policy sources');
  const calculation = calculateFederalTax(input);
  if (!calculation.form8962?.sharedPolicyAllocation || !calculation.form8962.sourceFactsVerified) throw new Error('Form8962 review requires the actual completed shared-policy calculation');
  const token: PreparedPremiumTaxCreditReview = Object.freeze({ [brand]: true as const });
  contexts.set(token, { original: freeze(structuredClone(input)), originalDigest: digest(input),
    redactedDigest: digest(redactReviewIdentifiers(input)), calculationDigest: calculationDigest(calculation) });
  return token;
}
/** Only source ordinals and actual monetary values may be rendered from this
 * private clone; original taxpayer identifiers are never printed by this map. */
export function premiumTaxCreditReviewOriginalSourceInput(input: TaxYearInput, result: TaxReturnResult,
  token?: PreparedPremiumTaxCreditReview): TaxYearInput {
  const context = contexts.get(token ?? preparePremiumTaxCreditReview(input));
  if (!context) throw new Error('Form8962 requires an original prepared review context');
  const actual = digest(input);
  if (actual !== context.originalDigest && actual !== context.redactedDigest) throw new Error('Form8962 review original source records are stale or conflicting');
  if (calculationDigest(result) !== context.calculationDigest) throw new Error('Form8962 review retained calculation and transfer audits do not reconcile');
  return structuredClone(context.original);
}
