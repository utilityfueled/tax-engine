/** Private original education evidence survives render-only identity removal.
 * Specs: form-1099-q-in-kind-room-board.yaml; form-1099-q-in-kind-assistance.yaml. */
import { createHash } from 'node:crypto';
import type Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import type { Form1099Q, QualifiedEducationExpenseSummary, TaxYearInput } from '@/models/inputs.js';
import type { Form1099QResult } from '@/engine/forms/form-1099-q.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';

const brand = Symbol('prepared actual education review');
export interface PreparedEducationReview { readonly [brand]: true }
const contexts = new WeakMap<PreparedEducationReview, {
  original: string; redacted: string; calculation: string; taxpayer: string; redactedTaxpayer: string;
  annualLoanInterest?: { original: string; redacted: string; deduction: string };
}>();
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function hasInKindEducationReviewSources(input: TaxYearInput): boolean {
  return (input.form1099Q ?? []).some(form => form.distributionMedium === 'in_kind_prepaid_tuition')
    || input.qualifiedEducationExpenses?.sourceFacts?.roomBoardPeriods !== undefined
    || (input.form1099Q ?? []).some(form => form.accountType === '529' && form.distributionMedium === 'cash'
      && (input.form1099Q ?? []).filter(other => other.beneficiaryId === form.beneficiaryId && other.accountType === '529' && other.distributionMedium === 'cash').length > 1);
}
/** Recompute from original facts; caller-supplied flags/results cannot certify themselves. */
export function prepareEducationReview(input: TaxYearInput): PreparedEducationReview {
  if (!hasInKindEducationReviewSources(input)) throw new Error('Education review requires actual prepaid, academic-period or annual cash education sources');
  const calculated = calculateFederalTax(input);
  const result = calculated.form1099Q;
  if (!result?.sourceFactsVerified) throw new Error('Education review requires the original source calculation');
  const sources = { forms: input.form1099Q, summary: input.qualifiedEducationExpenses };
  // Section 221 also consumes the return's income and adjustment facts for MAGI.
  // Keep the entire original return private, permitting only its exact redaction.
  const annualLoanInterest = result.loanInterestSourceAdjustments.some(source => source.annualInterestOnlyReporting)
    ? { original: digest(input), redacted: digest(redactReviewIdentifiers(input)),
      deduction: calculated.schedule1?.studentLoanInterest.toFixed() ?? '0' } : undefined;
  const token: PreparedEducationReview = Object.freeze({ [brand]: true as const });
  contexts.set(token, { original: digest(sources), redacted: digest(redactReviewIdentifiers(sources)), calculation: digest(redactReviewIdentifiers(result)),
    taxpayer: digest(input.taxpayer), redactedTaxpayer: digest(redactReviewIdentifiers(input.taxpayer)), annualLoanInterest });
  return token;
}
/** Only validates; no original identifier or its digest leaves this private map. */
export function assertPreparedEducationReview(forms: Form1099Q[], summary: QualifiedEducationExpenseSummary | undefined,
  result: Form1099QResult, token: PreparedEducationReview): void {
  const context = contexts.get(token);
  if (!context) throw new Error('Education review requires an original prepared context');
  const sources = digest({ forms, summary });
  if (sources !== context.original && sources !== context.redacted) throw new Error('Education review original source records are stale or conflicting');
  if (digest(redactReviewIdentifiers(result)) !== context.calculation) throw new Error('Education review retained calculation and audits do not reconcile');
}

/** Renderers that receive taxpayer facts must also retain the original recipient. */
export function assertPreparedEducationReturn(input: TaxYearInput, result: Form1099QResult, token: PreparedEducationReview,
  studentLoanInterest?: Decimal): void {
  assertPreparedEducationReview(input.form1099Q ?? [], input.qualifiedEducationExpenses, result, token);
  const context = contexts.get(token);
  const taxpayer = digest(input.taxpayer);
  if (!context || (taxpayer !== context.taxpayer && taxpayer !== context.redactedTaxpayer)) {
    throw new Error('Education review rendering taxpayer identity and filing facts are stale or conflicting');
  }
  if (context.annualLoanInterest) {
    const sources = digest(input);
    if (sources !== context.annualLoanInterest.original && sources !== context.annualLoanInterest.redacted)
      throw new Error('Annual interest-only education review original return and lender sources are stale or conflicting');
    if ((studentLoanInterest?.toFixed() ?? '0') !== context.annualLoanInterest.deduction)
      throw new Error('Annual interest-only education review student loan deduction does not reconcile');
  }
}
