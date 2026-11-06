/** Original-validated cancellation sources survive identifier-redacted rendering.
 * Spec: cod-nol-reductions.yaml review/review-conservation. */
import { createHash } from 'node:crypto';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateCodNolReduction } from '@/engine/forms/cod-nol-reductions.js';
import { calculateNetOperatingLoss } from '@/engine/forms/net-operating-loss.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';

const brand = Symbol('prepared COD NOL review');
export interface PreparedCodNolReview { readonly [brand]: true }
const contexts = new WeakMap<PreparedCodNolReview, { original: TaxYearInput; originalDigest: string; redactedDigest: string; calculationDigest: string }>();
function digest(input: TaxYearInput): string { return createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
function calculationDigest(result: TaxReturnResult): string {
  // The source replay is the complete current federal return, including actual credit,
  // Form6251, Schedule3/Form1040 audits and final tax/payment transfers. A
  // selected carry-only projection cannot prove those physical output values.
  // Redaction preserves acceptance of the canonical render copy; it never
  // permits an amount override or a separately manufactured current credit.
  // The workspace separately calculates/attaches stateReturns after the federal
  // call. State sources, applicability and review exports keep their own gates;
  // this federal proof neither validates nor replaces that state-owned object.
  // Exclude only that object, preserving every federal scalar and audit.
  const federalResult = { ...result };
  delete federalResult.stateReturns;
  return createHash('sha256').update(JSON.stringify(redactReviewIdentifiers(federalResult))).digest('hex');
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Only complete original records can create this local, nonpersistable token.
 * The complete input digest also binds every current-tax/carry source. */
export function prepareCodNolReview(input: TaxYearInput): PreparedCodNolReview {
  calculateCodNolReduction(input);
  const facts = input.netOperatingLoss;
  if (!facts?.alternativeTax) throw new Error('COD review requires original independent loss sources');
  const params = { taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus, taxpayer: input.taxpayer, facts };
  calculateNetOperatingLoss(params);
  calculateNetOperatingLoss({ ...params, facts: { ...facts, ...facts.alternativeTax } });
  const token: PreparedCodNolReview = Object.freeze({ [brand]: true as const });
  // Carry absorption depends on the complete original income/deduction sources.
  // Recompute from those actual records once, before redaction; never accept a
  // client-provided calculation as proof of its own retained carry context.
  const calculation = calculateFederalTax(input);
  contexts.set(token, { original: freeze(structuredClone(input)), originalDigest: digest(input), redactedDigest: digest(redactReviewIdentifiers(input)),
    calculationDigest: calculationDigest(calculation) });
  return token;
}
/** Private source replay only: no computed amount override and no invented IDs.
 * Renderers must output only numeric/static statement rows from this clone. */
export function codNolReviewOriginalSourceInput(input: TaxYearInput, result: TaxReturnResult, token?: PreparedCodNolReview): TaxYearInput {
  const context = contexts.get(token ?? prepareCodNolReview(input));
  if (!context) throw new Error('COD requires an original prepared review context');
  const actual = digest(input);
  if (actual !== context.originalDigest && actual !== context.redactedDigest) throw new Error('COD review original source records are stale or conflicting');
  if (calculationDigest(result) !== context.calculationDigest) throw new Error('COD review retained current-tax and loss calculation contexts do not reconcile');
  return structuredClone(context.original);
}
