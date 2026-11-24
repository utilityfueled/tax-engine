/** Spec: state/pa-2026-unemployment-source.yaml#government-unemployment-exclusion. */
import Decimal from 'decimal.js';
import { z } from 'zod';
import type { TaxYearInput } from '@/models/inputs.js';

const reference = z.string().trim().min(1);
const money = z.string().regex(/^\d+(?:\.\d+)?$/);
const original = z.strictObject({
  payer: reference, payerTin: reference.optional(), accountHolder: z.literal('primary'),
  sourceId: reference, accountReference: reference, taxYear: z.literal(2026), sourceFormRevision: z.literal('2026-12'),
  sourceFactsComplete: z.literal(true), sourceFactsConfirmed: z.literal(true), actualReceiptConfirmed: z.literal(true),
  additionalWorksheetRequired: z.literal(false), programType: z.literal('government-unemployment'),
  unemploymentCompensation: money, federalWithheld: money,
  stateOrLocalTaxRefund: money.optional(), stateLocalIncomeTaxRefund: money.optional(),
  rtaaPayments: money, taxableGrants: money, agriculturePayments: money, marketGain: money, familyLeaveBenefits: money,
  tradeOrBusinessRefund: z.literal(false), currentYearRepaid: money, priorYearRepaid: money,
  unrecoveredAfterTaxContributions: money, stateTaxReporting: z.literal('none'), stateWithheld: money.optional(),
}).refine(form => form.stateOrLocalTaxRefund !== undefined || form.stateLocalIncomeTaxRefund !== undefined);
const originalProof = z.strictObject({
  sourceId: reference, sourceReference: reference,
  recipient: z.strictObject({ firstName: reference, lastName: reference, ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/) }),
  currentUncorrectedNonvoidOriginalConfirmed: z.literal(true), allOriginalBoxesKnownConfirmed: z.literal(true),
  ordinaryNoncontributoryStateUnemploymentConfirmed: z.literal(true), noStateWithholdingConfirmed: z.literal(true),
});

export interface PA2026GovernmentUnemploymentContext {
  readonly method: 'pa-2026-government-unemployment-v1';
}

const originals = new WeakMap<PA2026GovernmentUnemploymentContext, {
  input: TaxYearInput; snapshot: string; box1: string; proof: z.infer<typeof originalProof>;
}>();
const snapshot = (input: TaxYearInput) => JSON.stringify([input.taxpayer.taxYear, input.taxpayer.primary, input.form1099G]);
const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toUpperCase();
const fail = (message: string): never => { throw new Error(`PA 2026 ordinary government unemployment: ${message}`); };

export function qualifyPA2026GovernmentUnemployment(input: TaxYearInput, rawProof: unknown): PA2026GovernmentUnemploymentContext {
  if (input.taxpayer.taxYear !== 2026) return fail('requires actual2026 originals');
  if (!Array.isArray(input.form1099G) || input.form1099G.length !== 1) return fail('one current original Form 1099-G is required');
  const form = original.safeParse(input.form1099G[0]);
  const proof = originalProof.safeParse(rawProof);
  if (!form.success || !proof.success) return fail('complete supported original and primary recipient proof are required');
  const actual = input.taxpayer.primary;
  const { recipient } = proof.data;
  if (form.data.sourceId !== proof.data.sourceId || normalizeName(recipient.firstName) !== normalizeName(actual.firstName)
    || normalizeName(recipient.lastName) !== normalizeName(actual.lastName) || recipient.ssn.replace(/-/g, '') !== actual.ssn.replace(/-/g, '')) {
    return fail('original Form 1099-G reference or recipient differs from the confirmed owner');
  }
  const box1 = new Decimal(form.data.unemploymentCompensation);
  const otherAmounts = [form.data.stateOrLocalTaxRefund, form.data.stateLocalIncomeTaxRefund, form.data.rtaaPayments,
    form.data.taxableGrants, form.data.agriculturePayments, form.data.marketGain, form.data.familyLeaveBenefits,
    form.data.currentYearRepaid, form.data.priorYearRepaid, form.data.unrecoveredAfterTaxContributions, form.data.stateWithheld];
  if (!box1.gt(0) || new Decimal(form.data.federalWithheld).gt(box1)
    || otherAmounts.some(value => value !== undefined && !new Decimal(value).isZero())) {
    return fail('positive gross Box 1 and known-zero other income, adjustments and state withholding are required');
  }
  const context: PA2026GovernmentUnemploymentContext = Object.freeze({ method: 'pa-2026-government-unemployment-v1' });
  originals.set(context, { input, snapshot: snapshot(input), box1: box1.toFixed(), proof: proof.data });
  return context;
}

export function readPA2026GovernmentUnemployment(input: TaxYearInput, context: PA2026GovernmentUnemploymentContext) {
  const current = originals.get(context);
  if (!current || current.input !== input || current.snapshot !== snapshot(input)) return fail('current original proof is missing, stale or forged');
  return { box1: current.box1, proof: current.proof };
}
