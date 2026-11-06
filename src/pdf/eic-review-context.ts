/** Original Rule3 sources for final2025 review. Spec: eic-separated-review.yaml. */
import { createHash } from 'node:crypto';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateEicSeparatedSpouseSources } from '@/engine/forms/eic-separated-spouse-sources.js';
import { calculateForm8862 } from '@/engine/forms/form-8862.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';

const brand = Symbol('prepared actual EIC child review');
export interface PreparedEicReview { readonly [brand]: true }
const contexts = new WeakMap<PreparedEicReview, {
  original: TaxYearInput; originalDigest: string; redactedDigest: string; calculationDigest: string;
}>();
function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function calculationDigest(result: TaxReturnResult): string {
  return digest(redactReviewIdentifiers({ taxYear: result.taxYear, filingStatus: result.filingStatus, agi: result.agi,
    totalIncome: result.totalIncome, earnedIncomeCredit: result.earnedIncomeCredit, scheduleEIC: result.scheduleEIC,
    lines: result.allLines.filter(row => row.form === 'EIC' || row.form === 'Schedule EIC' || row.form === '8862'
      || (row.form === '1040' && row.line === '27a')) }));
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function hasEicReviewSources(input: TaxYearInput): boolean { return input.eic?.separatedSpouseSources !== undefined || input.eic?.recertificationSources !== undefined; }
/** Calculate once from complete original records, before identifier redaction. */
export function prepareEicReview(input: TaxYearInput): PreparedEicReview {
  if (!hasEicReviewSources(input)) throw new Error('EIC review requires original qualifying-child or current recertification sources');
  const calculation = calculateFederalTax(input);
  const token: PreparedEicReview = Object.freeze({ [brand]: true as const });
  contexts.set(token, { original: freeze(structuredClone(input)), originalDigest: digest(input),
    redactedDigest: digest(redactReviewIdentifiers(input)), calculationDigest: calculationDigest(calculation) });
  return token;
}
/** Private clone for validation. Render identities only from the rendering input. */
export function eicReviewOriginalSourceInput(input: TaxYearInput, result: TaxReturnResult, token?: PreparedEicReview): TaxYearInput {
  const context = contexts.get(token ?? prepareEicReview(input));
  if (!context) throw new Error('EIC review requires an original prepared context');
  const actual = digest(input);
  if (actual !== context.originalDigest && actual !== context.redactedDigest) throw new Error('EIC review original source records are stale or conflicting');
  if (calculationDigest(result) !== context.calculationDigest) throw new Error('EIC review retained calculation and source audit do not reconcile');
  return structuredClone(context.original);
}
export interface EicReviewChild {
  dependentIndex: number;
  line4a: boolean | undefined;
  line4b: boolean | undefined;
  months: number;
  bornAndDeceasedWithoutSsn?: boolean;
}
/** Source IDs select the original dependents, never filtered-array positions. */
export function eicReviewChildren(original: TaxYearInput): EicReviewChild[] | undefined {
  if (original.taxpayer.taxYear !== 2025) throw new Error('Actual Schedule EIC review is available only for 2025');
  const current = original.eic?.recertificationSources === undefined ? undefined
    : calculateForm8862({ ...original, sources: original.eic.recertificationSources });
  // An income-only shortcut can leave the new child packet unknown. Preserve
  // the existing child source route; do not manufacture an actual empty list.
  if (current?.qualifyingChildSourceIds === undefined && original.eic?.separatedSpouseSources === undefined) return undefined;
  const actual = current?.qualifyingChildSourceIds !== undefined ? {
    sourceFactsComplete: true, qualifyingChildSourceIds: current.qualifyingChildSourceIds,
    ssnCountedChildSourceIds: current.ssnCountedChildSourceIds ?? [],
  } : calculateEicSeparatedSpouseSources(original);
  if (!actual.sourceFactsComplete) throw new Error('EIC review needs actual qualifying-child sources');
  const ids = actual.ssnCountedChildSourceIds.length > 0
    ? actual.ssnCountedChildSourceIds.slice(0, 3) : actual.qualifyingChildSourceIds.slice(0, 1);
  return ids.map(id => {
    const dependentIndex = Number(id.slice('dependent:'.length));
    const child = original.taxpayer.dependents[dependentIndex];
    const currentFacts = current?.qualifyingChildSourceIds === undefined ? undefined : original.eic?.recertificationSources?.children?.find(row => row.sourceId === id);
    const facts = currentFacts ?? original.eic?.separatedSpouseSources?.children?.find(row => row.sourceId === id);
    if (!child || !facts) throw new Error('EIC review original child source is missing');
    const younger = child.dateOfBirth > original.taxpayer.primary.dateOfBirth || (original.taxpayer.filingStatus === 'married_filing_jointly'
      && original.taxpayer.spouse !== undefined && child.dateOfBirth > original.taxpayer.spouse.dateOfBirth);
    const skip = Number(child.dateOfBirth.slice(0, 4)) > 2006 && younger;
    const age24 = new Date(`${child.dateOfBirth}T00:00:00Z`);
    age24.setUTCFullYear(age24.getUTCFullYear() + 24); age24.setUTCDate(age24.getUTCDate() - 1);
    const under24 = new Date('2025-12-31T00:00:00Z') < age24;
    const line4a = skip ? undefined : under24 && younger && facts.fullTimeStudentForFiveMonths === true;
    const line4b = skip || line4a ? undefined : facts.permanentlyAndTotallyDisabled === true;
    if (line4b === false) throw new Error('EIC review actual child age sources do not establish qualification');
    const birthDeathPeriod = currentFacts !== undefined && (child.dateOfBirth.startsWith('2025-') || currentFacts.deathDate?.startsWith('2025-') === true)
      && facts.livedWithTaxpayerInUnitedStatesMoreThanHalfYear === true;
    return { dependentIndex, line4a, line4b,
      bornAndDeceasedWithoutSsn: current?.requiredChildEvidenceSourceIds?.includes(id),
      months: birthDeathPeriod ? 12 : child.monthsLivedWithYou === 6 && facts.livedWithTaxpayerInUnitedStatesMoreThanHalfYear === true ? 7 : child.monthsLivedWithYou };
  });
}
