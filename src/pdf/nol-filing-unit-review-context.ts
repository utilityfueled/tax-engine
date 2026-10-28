/** Original-only NOL ownership proof retained before render-time ID removal. */
import { createHash } from 'node:crypto';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { nolFilingUnitSourceDigest } from '@/utils/nol-filing-unit-source-digest.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';

const brand = Symbol('prepared NOL filing-unit review');
export interface PreparedNolFilingUnitReview { readonly [brand]: true }
const contexts = new WeakMap<PreparedNolFilingUnitReview, {
  original: TaxYearInput; originalDigest: string; redactedDigest: string; calculationDigest: string;
}>();
function calculationDigest(result: TaxReturnResult): string {
  const { stateReturns: _state, ...federal } = result;
  return createHash('sha256').update(JSON.stringify(redactReviewIdentifiers(federal))).digest('hex');
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function requiresNolFilingUnitReview(input: TaxYearInput, result?: TaxReturnResult): boolean {
  return input.netOperatingLoss?.returnMembership === 'changed_membership'
    || input.netOperatingLoss?.sameCoupleJointHistory !== undefined || input.netOperatingLoss?.alternativeTax?.sameCoupleJointHistory !== undefined
    || input.netOperatingLoss?.filingUnitHistory !== undefined || input.netOperatingLoss?.alternativeTax?.filingUnitHistory !== undefined
    || result?.netOperatingLoss?.filingUnitSourceDigest !== undefined
    || !!result?.allLines.some(row => row.form === 'Section172 Filing Unit History');
}
export function prepareNolFilingUnitReview(input: TaxYearInput): PreparedNolFilingUnitReview {
  if (input.netOperatingLoss?.returnMembership !== 'changed_membership' || !input.netOperatingLoss.filingUnitHistory
    || !input.netOperatingLoss.alternativeTax?.filingUnitHistory) {
    throw new Error('NOL filing-unit review requires both actual original source histories');
  }
  const calculation = calculateFederalTax(input), digest = nolFilingUnitSourceDigest(input);
  if (calculation.netOperatingLoss?.filingUnitSourceDigest !== digest) throw new Error('NOL filing-unit calculation lacks its original source binding');
  const token: PreparedNolFilingUnitReview = Object.freeze({ [brand]: true as const });
  contexts.set(token, { original: freeze(structuredClone(input)), originalDigest: digest,
    redactedDigest: nolFilingUnitSourceDigest(redactReviewIdentifiers(input)), calculationDigest: calculationDigest(calculation) });
  return token;
}
export function nolFilingUnitReviewOriginalSourceInput(input: TaxYearInput, result: TaxReturnResult, token?: PreparedNolFilingUnitReview): TaxYearInput {
  if (input.netOperatingLoss?.returnMembership !== 'changed_membership' || !input.netOperatingLoss.filingUnitHistory
    || !input.netOperatingLoss.alternativeTax?.filingUnitHistory || !result.netOperatingLoss?.filingUnitSourceDigest) {
    throw new Error('NOL filing-unit review requires its original ownership sources and retained source-bound result');
  }
  const actual = token ?? prepareNolFilingUnitReview(input), context = contexts.get(actual);
  if (!context) throw new Error('NOL filing-unit review requires an original private context');
  const supplied = nolFilingUnitSourceDigest(input);
  if (supplied !== context.originalDigest && supplied !== context.redactedDigest) throw new Error('NOL filing-unit original source or permitted redaction is stale');
  if (result.netOperatingLoss.filingUnitSourceDigest !== context.originalDigest || calculationDigest(result) !== context.calculationDigest) {
    throw new Error('NOL filing-unit retained calculation and original sources do not reconcile');
  }
  return structuredClone(context.original);
}
