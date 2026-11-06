// Spec: spec/state/guided-pa-w2-complete.yaml
import { describe, expect, it } from 'vitest';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { buildGuidedStateOriginals } from '@/lib/guided-state-engine-inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculatePAResidentCreditSources } from '@/engine/state/pa-resident-credit-sources';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedPAW2Complete } from '../fixtures/guided-pa-w2-complete';
import { assertPAGuidedPaymentBoundary } from '../fixtures/assert-pa-guided-payment-boundary';

describe('Complete fictional guided PA W2 originals', () => {
  it('complete fictional NY originals preserve PA withholding zero', () => {
    const f = guidedPAW2Complete('NY');
    expect(f.input.w2s[0]).toMatchObject({ taxYear: 2025, state: 'NY', stateTaxWithheld: '123.45', wages: '30000' });
    const credit = calculatePAResidentCreditSources(f.input, f.facts, f.creditSources);
    expect(credit.totalCredit.toFixed()).toBe('921');
    expect(credit.perState[0].actualNetPayments.toFixed()).toBe('1000');
    expect(credit.filingEligible).toBe(false);
    const claim = f.creditSources.claims[0];
    if (!claim) throw new Error('Fictional NY complete filed tax original is required');
    expect(claim.filedReturn.taxAfterNonpaymentCredits).toBe('1000');
    expect(claim.payments.map(p => p.amountAppliedToTax)).toEqual(['123.45', '876.55']);
    expect(claim.refunds).toEqual([]);
    expect(computeGuidedPreview(f.state)?.state?.stateWithholding).toBe('0');
  });
  it('complete fictional PA originals retain raw123.45 and printed123', () => {
    const f = guidedPAW2Complete('PA');
    expect(f.input.w2s[0]).toMatchObject({ state: 'PA', stateTaxWithheld: '123.45', wages: '30000' });
    assertPAGuidedPaymentBoundary(f.state, '123.45', '123');
    expect(f.facts.timing.remainingTaxPayment).toMatchObject({ amountAppliedToTax: '798', date: '2026-04-15' });
    expect(f.completion.otherStateTaxes).toMatchObject({ status: 'none_paid', jurisdictions: [{ state: 'NY', taxPaid: '0', incomeTaxWithheld: '0' }] });
    expect(computeGuidedPreview(f.state)?.state?.stateWithholding).toBe('123');
  });
  it('preview reads do not replace any privately retained original', () => {
    for (const jurisdiction of ['NY', 'PA'] as const) {
      const f = guidedPAW2Complete(jurisdiction), before = JSON.stringify(f.state);
      const raw = buildTaxInputFromGuidedData(f.state);
      if (!raw) throw new Error('Fictional complete input required');
      const current = buildGuidedStateOriginals(TaxYearInputSchema.parse(raw), f.state);
      expect(current.paOrdinaryReturnFacts).toEqual(f.facts);
      expect(current.paOrdinaryReturnCompletionSources).toEqual(f.completion);
      expect(computeGuidedPreview(f.state)?.state).not.toBeNull();
      expect(JSON.stringify(f.state)).toBe(before);
    }
  });
  it('editing the W2 does not silently rebind the canonical source', () => {
    for (const edit of ['state', 'amount', 'sourceYear', 'owner'] as const) {
      const f = guidedPAW2Complete('NY'), entries = f.state.sectionData['income-w2'];
      const row = entries?.entries[0];
      if (!row) throw new Error('Fictional guided W2 required');
      const original = JSON.stringify(row.stateLocalSources);
      if (edit === 'state') row.state = 'PA';
      if (edit === 'amount') row.stateWithheld = '123.46';
      if (edit === 'sourceYear') row.sourceTaxYear = '2024';
      if (edit === 'owner') row.accountHolder = 'spouse';
      expect(computeGuidedPreview(f.state)?.state ?? null, edit).toBeNull();
      expect(JSON.stringify(row.stateLocalSources)).toBe(original);
    }
  });
  it('NY withholding cannot substitute for complete final tax and payment records', () => {
    for (const change of ['filed', 'payment', 'owner', 'year', 'asof', 'account'] as const) {
      const f = guidedPAW2Complete('NY'), packet = structuredClone(f.creditSources), claim = packet.claims[0];
      if (!claim) throw new Error('Fictional NY claim required');
      if (change === 'filed') claim.filedReturn.completeFiledReturnAndSchedulesConfirmed = null;
      if (change === 'payment') claim.payments.pop();
      if (change === 'owner') claim.account.accountSsn = '999-77-0011';
      if (change === 'year') claim.filedReturn.sourceTaxYear = 2024;
      if (change === 'asof') claim.account.completeThroughDate = '2026-02-28';
      if (change === 'account') claim.account.netTaxPaymentsReported = '999.99';
      expect(() => calculatePAResidentCreditSources(f.input, f.facts, packet), change).toThrow();
      expect(f.creditSources.claims[0]?.payments.map(p => p.amountAppliedToTax)).toEqual(['123.45', '876.55']);
    }
  });
});
