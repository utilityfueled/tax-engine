// Spec: spec/state/guided-pa-digital-complete.yaml
import { expect, it } from 'vitest';
import { guidedPACompleteDigital } from '../fixtures/guided-pa-digital-complete';
import { assertPAGuidedPaymentBoundary } from '../fixtures/assert-pa-guided-payment-boundary';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculateFederalTax } from '@/engine/federal';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return';
import { calculatePAOrdinaryDigitalSources } from '@/engine/state/pa-ordinary-digital-sources';
it('complete fictional digital sources retain every original withholding and gain amount', () => {
  const f = guidedPACompleteDigital();
  expect(f.input.w2s[0].stateTaxWithheld).toBe('0.40');
  expect(f.input.form1099DA.map(s => [s.state, s.stateWithheld])).toEqual([['PA', '0.10'], ['PA', '0.20'], ['VA', '0.30']]);
  expect(f.input.form1099DA.map(s => s.transactions.map(t => [t.proceeds, t.costBasis, t.paCostBasis]))).toEqual([
    [['100.49', '90.24', '80.24']], [['100.49', '90.24', '80.24']], [['100.49', '90.24', '80.24']],
  ]);
  const digital = calculatePAOrdinaryDigitalSources(f.input, f.digital, { status: 'resident' });
  expect(digital.rawGainOrLoss.toFixed()).toBe('60.75'); expect(digital.reportedGainOrLoss.toFixed()).toBe('61');
  expect(digital.paWithholding.toFixed()).toBe('0.3');
  expect(digital.stateWithholding.map(s => [s.state, s.amount.toFixed()])).toEqual([['PA', '0.1'], ['PA', '0.2'], ['VA', '0.3']]);
  expect(calculateFederalTax(f.input).totalIncome.toFixed()).toBe('50030.75');
  assertPAGuidedPaymentBoundary(f.state, '0.7', '1');
  expect(f.vaRefundOriginals).toMatchObject({ filedReturn: { finalTax: '0', totalPayments: '0', refundRequested: '0' }, specialWrittenApplication: { amountRequested: '0.30', actuallySubmittedConfirmed: true }, agencyAward: { finalTaxDetermined: '0', refundAwarded: '0.30', actualAgencyDeterminationConfirmed: true }, refund: { amount: '0.30', actuallyReceivedConfirmed: true }, account: { netTaxPaymentsReported: '0', unpaidTaxReported: '0', overpaymentOutstandingReported: '0' } });
});
it('complete fictional PA digital sources with actual VA refund preserve the positive preview', () => {
  const f = guidedPACompleteDigital(), original = structuredClone(f.state);
  expect(computeGuidedPreview(f.state)?.state?.stateWithholding).toBe('1');
  expect(computeGuidedPreview(f.state)?.totalIncome).toBe('50030.75');
  expect(f.state).toEqual(original);
});
it('complete fictional digital evidence requires actual canonical refund admission', () => {
  const f = guidedPACompleteDigital();
  // The full independent VA originals are retained by this source fixture, but
  // current canonical completion has no typed admission for them. This is the
  // actual unsupported method, not evidence that the positive should be denied.
  expect(f.vaRefundOriginals.withholding.amount).toBe('0.30');
  expect(f.vaRefundOriginals.refund.amount).toBe('0.30');
  const result = calculatePAOrdinaryReturn(f.input, f.facts, f.completion);
  expect(result.pa40.stateWithholding.toFixed()).toBe('1');
  expect(result.pa40.residentCredit.toFixed()).toBe('0');
});

it('canonical completion reconciles the actual refund and gross jurisdiction history', () => {
  for (const change of ['missingProof', 'nonePaid', 'wrongGrossWithholding', 'nonzeroNetPaid', 'missingJurisdiction']) {
    const f = guidedPACompleteDigital(), completion = structuredClone(f.completion);
    if (change === 'missingProof') delete completion.otherStateTaxes.refundedDigitalSources;
    if (change === 'nonePaid') completion.otherStateTaxes.status = 'none_paid';
    if (change === 'wrongGrossWithholding') completion.otherStateTaxes.jurisdictions[0].incomeTaxWithheld = '0';
    if (change === 'nonzeroNetPaid') completion.otherStateTaxes.jurisdictions[0].taxPaid = '0.30';
    if (change === 'missingJurisdiction') completion.otherStateTaxes.jurisdictions = [];
    expect(() => calculatePAOrdinaryReturn(f.input, f.facts, completion), change).toThrow();
    expect(f.input.form1099DA[2].stateWithheld).toBe('0.30');
  }
});
it('canonical reads do not repair missing stale or unreceived refund sources', () => {
  for (const change of ['unknown', 'unreceived', 'staleFacts', 'missingActualFacts']) {
    const f = guidedPACompleteDigital(), section = f.state.sectionData['state-return'];
    const proof = section?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedDigitalSources;
    if (!section || !proof) throw new Error('Fictional current complete refund source required');
    if (change === 'unknown') proof.sourceFactsConfirmed = null;
    if (change === 'unreceived') proof.refund.actuallyReceivedConfirmed = false;
    if (change === 'staleFacts') Object.assign(proof.originalPAFacts ?? {}, { sourceCorruption: true });
    if (change === 'missingActualFacts') delete section.paOrdinaryReturnFacts;
    const before = JSON.stringify(f.state);
    expect(computeGuidedPreview(f.state)?.state ?? null, change).toBeNull();
    expect(JSON.stringify(f.state)).toBe(before);
  }
});
