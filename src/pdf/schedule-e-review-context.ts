/** Preserve original source validation across render-only redaction.
 * Specs: schedule-e-physical-review.yaml, schedule-e-passive-distribution-review.yaml,
 * and k1-charitable-at-risk.yaml. */
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateK1PassiveDistributionSources } from '@/engine/forms/k1-passive-distribution-sources.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';
const brand = Symbol('prepared Schedule E source review');
export interface PreparedScheduleEReview { readonly [brand]: true }
export type ScheduleEPassiveDistributionSource = ReturnType<typeof calculateK1PassiveDistributionSources>['rows'][number];
interface Context {
 originalDigest: string;
 redactedDigest: string;
 calculationDigest: string;
 passiveDistributions: ScheduleEPassiveDistributionSource[];
}
const contexts = new WeakMap<PreparedScheduleEReview, Context>();
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function calculationDigest(result: TaxReturnResult): string {
 return digest(redactReviewIdentifiers({ taxYear: result.taxYear, filingStatus: result.filingStatus, agi: result.agi,
  scheduleE: result.scheduleE, form8582: result.form8582, schedule1: result.schedule1, form8960: result.form8960,
  scheduleD: result.scheduleD, k1AtRiskByCharacter: result.carryforwards.k1AtRiskByCharacter,
  passiveDistributionLines: result.allLines.filter(row => row.form === 'K1 Passive Distribution'),
  charitableAtRiskLines: result.allLines.filter(row => row.form === 'K1 Charitable At Risk') }));
}
export function hasScheduleEReviewSources(input: TaxYearInput): boolean {
 return Boolean(input.royaltyPropertySources || input.k1CharitableSources?.statements?.some(
  row => row.cashDistribution?.activityCharacter === 'single_passive_business'
   || row.atRisk?.activityAllocation !== undefined));
}
/** Retained original-source evidence cannot bypass validation by losing its attachment. */
export function requiresScheduleEReview(input: TaxYearInput, result: TaxReturnResult): boolean {
 return hasScheduleEReviewSources(input) || result.carryforwards.k1AtRiskByCharacter !== undefined
  || result.allLines.some(row => row.form === 'K1 Passive Distribution' || row.form === 'K1 Charitable At Risk');
}
/** Tokens stay within the request; no original identifiers are exposed by them. */
export function prepareScheduleEReview(input: TaxYearInput): PreparedScheduleEReview {
 if (!hasScheduleEReviewSources(input)) throw new Error('Schedule E original royalty, passive distribution, or charitable activity sources are required');
 const calculated = calculateFederalTax(input);
 const passiveDistributions = calculated.scheduleE ? calculateK1PassiveDistributionSources(input, calculated.scheduleE).rows : [];
 const token: PreparedScheduleEReview = Object.freeze({ [brand]: true as const });
 contexts.set(token, { originalDigest: digest(input), redactedDigest: digest(redactReviewIdentifiers(input)),
  calculationDigest: calculationDigest(calculated), passiveDistributions });
 return token;
}
function validatedContext(input: TaxYearInput, result: TaxReturnResult, token?: PreparedScheduleEReview): Context {
 const context = contexts.get(token ?? prepareScheduleEReview(input));
 if (!context) throw new Error('Schedule E requires an original prepared review context');
 const actual = digest(input);
 if (actual !== context.originalDigest && actual !== context.redactedDigest) throw new Error('Schedule E original source facts are stale or conflicting');
 if (calculationDigest(result) !== context.calculationDigest) throw new Error('Schedule E retained source calculation does not reconcile');
 return context;
}
export function assertScheduleEReview(input: TaxYearInput, result: TaxReturnResult, token?: PreparedScheduleEReview): void {
 validatedContext(input, result, token);
}
/** Only source indexes and freshly copied amounts cross the render boundary. */
export function scheduleEReviewPassiveDistributionSources(input: TaxYearInput, result: TaxReturnResult,
 token?: PreparedScheduleEReview): ScheduleEPassiveDistributionSource[] {
 return validatedContext(input, result, token).passiveDistributions.map(row => ({
  k1Index: row.k1Index, passiveIndex: row.passiveIndex, gain: new Decimal(row.gain),
  sourceIncome: new Decimal(row.sourceIncome), ordinaryTransferExclusion: new Decimal(row.ordinaryTransferExclusion),
 }));
}
