/** Preserve original source validation across render-only redaction.
 * Specs: schedule-e-physical-review.yaml, schedule-e-passive-distribution-review.yaml,
 * and k1-charitable-at-risk.yaml. */
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateK1PassiveDistributionSources } from '@/engine/forms/k1-passive-distribution-sources.js';
import { calculateK1PassiveCapitalSources } from '@/engine/forms/k1-passive-capital-sources.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';
const brand = Symbol('prepared Schedule E source review');
export interface PreparedScheduleEReview { readonly [brand]: true }
export type ScheduleEPassiveDistributionSource = ReturnType<typeof calculateK1PassiveDistributionSources>['rows'][number];
export interface ScheduleEPassiveCapitalSource {
 k1Index: number; passiveIndex: number;
 ordinaryIncome: Decimal; ordinaryAllowedLoss: Decimal;
 sourceCurrentIncome: Decimal; sourceCurrentLoss: Decimal; sourcePriorLoss: Decimal;
}
interface Context {
 originalDigest: string;
 redactedDigest: string;
 calculationDigest: string;
 passiveDistributions: ScheduleEPassiveDistributionSource[];
 passiveCapital: ScheduleEPassiveCapitalSource[];
}
const contexts = new WeakMap<PreparedScheduleEReview, Context>();
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function calculationDigest(result: TaxReturnResult): string {
 return digest(redactReviewIdentifiers({ taxYear: result.taxYear, filingStatus: result.filingStatus, agi: result.agi,
  scheduleE: result.scheduleE, form8582: result.form8582, schedule1: result.schedule1, form8960: result.form8960,
  scheduleD: result.scheduleD, k1AtRiskByCharacter: result.carryforwards.k1AtRiskByCharacter,
  k1PassiveByCharacter: result.carryforwards.k1PassiveByCharacter,
  passiveCapitalLines: result.allLines.filter(row => row.form === 'Form 8582 Part IX'),
  passiveDistributionLines: result.allLines.filter(row => row.form === 'K1 Passive Distribution'),
  charitableAtRiskLines: result.allLines.filter(row => row.form === 'K1 Charitable At Risk') }));
}
export function hasScheduleEReviewSources(input: TaxYearInput): boolean {
 return Boolean(input.royaltyPropertySources || input.k1CharitableSources?.statements?.some(
  row => row.cashDistribution?.activityCharacter === 'single_passive_business'
   || row.atRisk?.activityAllocation !== undefined || row.capitalCharacter !== undefined));
}
/** Retained original-source evidence cannot bypass validation by losing its attachment. */
export function requiresScheduleEReview(input: TaxYearInput, result: TaxReturnResult): boolean {
 return hasScheduleEReviewSources(input) || result.carryforwards.k1AtRiskByCharacter !== undefined
  || result.carryforwards.k1PassiveByCharacter !== undefined
  || result.allLines.some(row => row.form === 'K1 Passive Distribution' || row.form === 'K1 Charitable At Risk' || row.form === 'Form 8582 Part IX');
}
/** Tokens stay within the request; no original identifiers are exposed by them. */
export function prepareScheduleEReview(input: TaxYearInput): PreparedScheduleEReview {
 if (!hasScheduleEReviewSources(input)) throw new Error('Schedule E original royalty, passive distribution, or charitable activity sources are required');
 const calculated = calculateFederalTax(input);
 const passiveDistributions = calculated.scheduleE ? calculateK1PassiveDistributionSources(input, calculated.scheduleE).rows : [];
 const passiveCapital = calculated.scheduleE ? (calculateK1PassiveCapitalSources(input, calculated.scheduleE)?.rows ?? []).map(row => ({
  k1Index: row.k1Index, passiveIndex: row.passiveIndex, ordinaryIncome: row.ordinaryIncome,
  ordinaryAllowedLoss: row.ordinaryAllowedLoss, sourceCurrentIncome: row.currentIncome,
  sourceCurrentLoss: row.currentLoss, sourcePriorLoss: row.priorLoss,
 })) : [];
 const token: PreparedScheduleEReview = Object.freeze({ [brand]: true as const });
 contexts.set(token, { originalDigest: digest(input), redactedDigest: digest(redactReviewIdentifiers(input)),
  calculationDigest: calculationDigest(calculated), passiveDistributions, passiveCapital });
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
 return scheduleEReviewSourceDetails(input, result, token).passiveDistributions;
}
/** Only indexes and derived amounts cross this private rendering boundary. */
export function scheduleEReviewSourceDetails(input: TaxYearInput, result: TaxReturnResult, token?: PreparedScheduleEReview) {
 const context = validatedContext(input, result, token);
 return { passiveDistributions: context.passiveDistributions.map(row => ({
  k1Index: row.k1Index, passiveIndex: row.passiveIndex, gain: new Decimal(row.gain),
  sourceIncome: new Decimal(row.sourceIncome), ordinaryTransferExclusion: new Decimal(row.ordinaryTransferExclusion),
 })), passiveCapital: context.passiveCapital.map(row => ({
  k1Index: row.k1Index, passiveIndex: row.passiveIndex, ordinaryIncome: new Decimal(row.ordinaryIncome),
  ordinaryAllowedLoss: new Decimal(row.ordinaryAllowedLoss), sourceCurrentIncome: new Decimal(row.sourceCurrentIncome),
  sourceCurrentLoss: new Decimal(row.sourceCurrentLoss), sourcePriorLoss: new Decimal(row.sourcePriorLoss),
 })) };
}
