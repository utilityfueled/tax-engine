// Spec: spec/state/guided-ohio-digital-complete.yaml
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { guidedOhioCompleteDigital, originalIncompleteOhioDigital } from '../fixtures/guided-ohio-digital-complete';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildGuidedStateOriginals } from '@/lib/guided-state-engine-inputs';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculateFederalTax } from '@/engine/federal';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return';
import { TaxYearInputSchema } from '@/models/inputs';

it('complete fictional Ohio sources expose the historical cents preview oracle', () => {
  const f = guidedOhioCompleteDigital();
  // Actual1-vs-historical.7 failure retained in red-v2; official printed contract is1.
  expect(computeGuidedPreview(f.state)?.state?.stateWithholding).toBe('1');
});
it('complete fictional Ohio digital sources retain exact cents and reported withholding', () => {
  const f = guidedOhioCompleteDigital(), original = structuredClone(f.state);
  expect(f.input.w2s[0].stateTaxWithheld).toBe('0.40');
  expect(f.input.form1099DA.map(row => [row.state, row.stateWithheld])).toEqual([['OH', '0.10'], ['OH', '0.20'], ['VA', '0.30']]);
  expect(f.input.form1099DA.map(row => row.transactions.map(tx => [tx.proceeds, tx.costBasis, tx.paCostBasis]))).toEqual([
    [['100.49', '90.24', '80.24']], [['100.49', '90.24', '80.24']], [['100.49', '90.24', '80.24']],
  ]);
  const federal = calculateFederalTax(f.input);
  expect(federal.totalIncome.toFixed()).toBe('50030.75');
  expect(buildOhioResidentReturnInput(f.input, federal).ohioWithholding?.toString()).toBe('0.7');
  expect(new Decimal('0.40').plus('0.10').plus('0.20').toFixed()).toBe('0.7');
  const canonical = buildGuidedStateOriginals(f.input, f.state), adapted = buildOhioResidentReturnInput(canonical, federal);
  expect(adapted.ohioWithholding?.toString()).toBe('1');
  const result = calculateOhioResidentReturn(adapted);
  expect(result.it1040.line4_exemptions.toFixed()).toBe('2150');
  expect(result.it1040.line10_taxAfterCredits.toFixed()).toBe('942');
  expect(result.it1040.line14_ohioWithholding.toFixed()).toBe('1');
  expect(computeGuidedPreview(f.state)?.state?.stateWithholding).toBe('1');
  expect(computeGuidedPreview(f.state)?.totalIncome).toBe('50030.75');
  expect(f.state).toEqual(original);
});
it('original incomplete Ohio digital flow remains blocked with exact raw source cents', () => {
  const state = originalIncompleteOhioDigital(), original = structuredClone(state), raw = buildTaxInputFromGuidedData(state);
  expect(raw).not.toBeNull(); if (!raw) throw new Error('Original fictional federal source required');
  const input = TaxYearInputSchema.parse(raw), federal = calculateFederalTax(input);
  expect(buildOhioResidentReturnInput(input, federal).ohioWithholding?.toString()).toBe('0.7');
  expect(computeGuidedPreview(state)?.totalIncome).toBe('50030.75');
  expect(computeGuidedPreview(state)?.state).toBeNull();
  expect(state.sectionData['state-return']).toBeUndefined(); expect(state).toEqual(original);
});
it('Ohio digital reads preserve unknown missing and stale actual sources', () => {
  for (const change of ['missing', 'unknown', 'stale', 'year', 'paymentUnknown']) {
    const f = guidedOhioCompleteDigital(), data = f.state.sectionData['state-return'];
    if (!data?.ohioResidency || !data.ohioPayments) throw new Error('Fictional complete Ohio originals required');
    const residency = data.ohioResidency, payments = data.ohioPayments;
    if (change === 'missing') delete data.ohioResidency;
    if (change === 'unknown') residency.sourceFactsConfirmed = null;
    if (change === 'stale') {
      // Stale OH owner snapshot only: current federal/W2 originals remain valid.
      const stale = structuredClone(f.input); stale.taxpayer.primary.lastName = 'Changed';
      residency.originalFederalSources = { ...stale };
    }
    if (change === 'year') payments.taxYear = '2026';
    if (change === 'paymentUnknown') payments.specialFacts.farmingFishingIncome = '';
    const original = structuredClone(f.state);
    expect(computeGuidedPreview(f.state)?.totalIncome).toBe('50030.75');
    expect(computeGuidedPreview(f.state)?.state ?? null, change).toBeNull();
    expect(f.state).toEqual(original);
  }
});
