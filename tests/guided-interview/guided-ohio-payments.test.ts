/** Spec: state/ohio-payments.yaml. No calculated result is a source oracle. */
import { it, expect, vi } from 'vitest';
import * as ohioPaymentSource from '@/engine/state/oh-payment-source';
import { emptyOhioPaymentDraft, confirmGuidedOhioPaymentFacts, buildGuidedOhioPaymentFacts, ohioPaymentFactErrors, type OhioPaymentDraft } from '../../apps/web/src/lib/guided-ohio-payment-facts.js';
import { guidedResidentCreditFixture } from '../fixtures/guided-oh-resident-credit-complete.js';
import { schoolPyHeaderPacket, schoolPyPaperCases } from '../fixtures/oh-school-district-part-year-official-review.js';
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

const paymentSourceCases = ['refund100', 'covered', 'distinct', 'cents'] as const;
function paymentSourceFixture(sourceCase: typeof paymentSourceCases[number]) {
    if (sourceCase === 'distinct' || sourceCase === 'cents') {
        const { input, payments } = guidedResidentCreditFixture(sourceCase);
        return { input, draft: payments };
    }
    const { original, canonical } = schoolPyHeaderPacket(schoolPyPaperCases.find(fixture => fixture.name === sourceCase));
    const draft = confirmGuidedOhioPaymentFacts(original, {
        ...canonical.ohioPayments, taxYear: '2025',
        specialFacts: { farmingFishingIncome: 'known_none', militaryDisasterRelief: 'known_none' },
    });
    return { input: original, draft };
}

it.each(paymentSourceCases)('reuses the current canonical payment facts for the %s source case', (sourceCase) => {
    const { input, draft } = paymentSourceFixture(sourceCase);
    const originalDraft = structuredClone(draft);
    const projection = vi.spyOn(ohioPaymentSource, 'buildOhioPaymentSource');
    try {
        const facts = buildGuidedOhioPaymentFacts(draft, input);
        expect(facts).toEqual(projection.mock.results[0]?.value?.facts);
        expect(projection).toHaveBeenCalledTimes(1);
        expect(facts.originalFederalSources).not.toBe(draft.originalFederalSources);

        expect(buildGuidedOhioPaymentFacts(draft, input)).toEqual(facts);
        expect(projection).toHaveBeenCalledTimes(2);
        expect(draft).toEqual(originalDraft);

        draft.taxYear = '2026';
        draft.specialFacts.farmingFishingIncome = '';
        const message = 'Enter the actual source year matching this return.';
        expect(ohioPaymentFactErrors(draft, 2025, input)).toEqual({ 'ohio-payment-year': message });
        expect(() => buildGuidedOhioPaymentFacts(draft, input)).toThrow(message);
        expect(projection).toHaveBeenCalledTimes(2);
    } finally {
        projection.mockRestore();
    }
});

it('retains the canonical reconciliation message after fresh guided validation', () => {
    const input = ohioPaymentFixture(), draft = confirmedDraft();
    draft.currentTiming.expectedDate = '2026-04-16';
    const message = 'Ohio actual payment sources: actual late or early-year timing needs its separate method';
    expect(ohioPaymentFactErrors(draft, 2025)).toEqual({});
    expect(ohioPaymentFactErrors(draft, 2025, input)).toEqual({ 'ohio-payment-reconciliation': message });
    expect(() => buildGuidedOhioPaymentFacts(draft, input)).toThrow(message);
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
