/** Spec: state/guided-ohio-payments.yaml. No calculated result is a source oracle. */
import { it, expect } from 'vitest';
import { emptyOhioPaymentDraft, confirmGuidedOhioPaymentFacts, buildGuidedOhioPaymentFacts, ohioPaymentFactErrors, type OhioPaymentDraft } from '../../apps/web/src/lib/guided-ohio-payment-facts.js';
import { ohioPaymentFixture } from '../fixtures/oh-payments.js';
function confirmedDraft(): OhioPaymentDraft {
    const input = ohioPaymentFixture();
    const { originalFederalSources: _snapshot, ...facts } = input.ohioPayments;
    return confirmGuidedOhioPaymentFacts(input, { ...structuredClone(emptyOhioPaymentDraft), ...facts, taxYear: '2025', sourceFactsConfirmed: true, specialFacts: { farmingFishingIncome: 'known_none', militaryDisasterRelief: 'known_none' } });
}
it('preserves unknown Ohio payment answers versus confirmed actual zero', () => {
    const input = ohioPaymentFixture();
    expect(Object.keys(ohioPaymentFactErrors(undefined, 2025, input)).length).toBeGreaterThan(0);
    const draft = confirmedDraft();
    expect(ohioPaymentFactErrors(draft, 2025, input)).toEqual({});
    draft.balanceFacts.useTax = '';
    expect(Object.keys(ohioPaymentFactErrors(draft, 2025, input)).length).toBeGreaterThan(0);
    draft.balanceFacts.useTax = '0';
    draft.sourceFactsConfirmed = null;
    expect(() => buildGuidedOhioPaymentFacts(draft, input)).toThrow();
});
it('builds confirmed current Ohio payment sources without inventing prior or payment dates', () => {
    const input = ohioPaymentFixture(), draft = confirmedDraft(), actual = buildGuidedOhioPaymentFacts(draft, input);
    expect(actual.priorReturn.status).toBe('no_return');
    expect(actual.paymentRows).toEqual([]);
    expect(actual.currentTiming).toEqual({ kind: 'expected', expectedDate: '2026-04-15', asOfDate: '2026-04-01' });
    expect(actual.remainingTaxPayment).toMatchObject({ status: 'expected_payment', date: '2026-04-15', amountAppliedToTax: '2323' });
    expect(actual.originalFederalSources).not.toHaveProperty('ohioResidency');
    expect(actual.originalFederalSources).not.toHaveProperty('ohioPayments');
    expect(actual.originalFederalSources).toEqual(input.ohioPayments.originalFederalSources);
});
it('does not infer ordinary eligibility or payment dates from unknown answers', () => {
    const input = ohioPaymentFixture(), draft = confirmedDraft();
    draft.specialFacts.farmingFishingIncome = '';
    expect(() => buildGuidedOhioPaymentFacts(draft, input)).toThrow(/farming/i);
    draft.specialFacts.farmingFishingIncome = 'reported';
    expect(() => buildGuidedOhioPaymentFacts(draft, input)).toThrow(/separate/i);
    draft.specialFacts.farmingFishingIncome = 'known_none';
    draft.remainingTaxPayment.date = '';
    expect(() => buildGuidedOhioPaymentFacts(draft, input)).toThrow();
    draft.remainingTaxPayment.date = '2026-04-15';
    draft.currentTiming.expectedDate = '';
    expect(() => buildGuidedOhioPaymentFacts(draft, input)).toThrow();
});

it('rejects known-none answers contradicted by actual farming or fishing originals', async () => {
    const { ScheduleFInputSchema, Form1099MiscSchema } = await import('../../src/models/inputs.js');
    const input = ohioPaymentFixture(), draft = confirmedDraft();
    for (const actual of [
        { salesOfProductsRaised: '100' },
        { salesOfPurchasedLivestock: '100', costOfPurchasedLivestock: '200' },
        { accountingMethod: 'accrual', accrualSalesDuringYear: '100' },
    ]) {
        const current = { ...input, scheduleF: ScheduleFInputSchema.parse({ accountHolder: 'primary', expenses: {}, ...actual }) };
        expect(() => buildGuidedOhioPaymentFacts(draft, current)).toThrow(/farm|fish|contradict/i);
        expect(Object.keys(ohioPaymentFactErrors(draft, 2025, current)).length).toBeGreaterThan(0);
    }
    for (const actual of [{ fishingBoatProceeds: '100' }, { cropInsurance: '100' }]) {
        const current = { ...input, form1099Misc: [Form1099MiscSchema.parse({ payer: 'Synthetic actual agriculture payer', taxYear: 2025, accountHolder: 'primary', stateWithheld: '0', ...actual })] };
        expect(() => buildGuidedOhioPaymentFacts(draft, current)).toThrow(/farm|fish|contradict/i);
    }
    const zero = { ...input, scheduleF: ScheduleFInputSchema.parse({ accountHolder: 'primary', salesOfProductsRaised: '0', expenses: { supplies: '100' } }), form1099Misc: [Form1099MiscSchema.parse({ payer: 'Synthetic actual zero payer', taxYear: 2025, accountHolder: 'primary', stateWithheld: '0', fishingBoatProceeds: '0', cropInsurance: '0' })] };
    expect(() => buildGuidedOhioPaymentFacts(confirmGuidedOhioPaymentFacts(zero, draft), zero)).not.toThrow();
    expect(input).not.toHaveProperty('scheduleF');
});
