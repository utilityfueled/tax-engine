import { required } from '../fixtures/foreign-tax-k3-ordinary';
// Spec: spec/federal/foreign-tax-k3-ordinary.yaml, guided.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal';
import { guidedOrdinaryK3 } from '../fixtures/foreign-tax-k3-ordinary';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { TaxYearInputSchema } from '@/models/inputs';
it('builds actual original K3 ordinary sources and rejects stale snapshots', () => {
    const { state } = guidedOrdinaryK3(), before = JSON.stringify(state), input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    expect(input?.scheduleK1[0].interestIncome).toBe('20000');
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(result.totalTax.toFixed()).toBe('12555');
    expect(input?.w2s[0].federalWithheld).toBe('12000');
    expect(result.totalPayments.toFixed()).toBe('12000');
    expect(result.estimatedTaxPenalty.toFixed()).toBe('0');
    expect(input?.form2210).toBeUndefined();
    expect(input?.priorYear).toBeUndefined();
    expect(result.form2210.sourceFactsVerified).toBe(false);
    expect(result.form2210.safeHarborReason).toBe('Tax shown minus withholding < $1,000');
    expect(result.amountOwed.toFixed()).toBe('555');
    expect(computeGuidedPreview(state)?.amountOwed).toBe('555');
    expect(JSON.stringify(state)).toBe(before);
    const stale = structuredClone(state);
    required(required(required(stale.sectionData['other-taxes']).foreignTaxElection).qualifiedK3Statements)[0].originalK1Reference = 'Changed original reference';
    expect(buildTaxInputFromGuidedData(stale)).toBeNull();
});
it('preserves unknown original facts current year source identity and isolated replay', () => {
    const mutations: Array<(row: ReturnType<typeof guidedOrdinaryK3>['original']) => void> = [r => { r.foreignDeductions = ''; }, r => { r.usdReportedPaidTaxesConfirmed = false; }, r => { r.sourceTaxYear = '2026'; }, r => { r.recipientName = 'Other Person'; }, r => { r.recipientTaxpayerIdLast4 = '4444'; }, r => { r.partnershipEIN = '98-7654321'; }, r => { r.entityPaidTaxPayments[0].date = '2024-09-15'; }, r => { Object.assign(r, { inventedTax: '0' }); }];
    for (const change of mutations) {
        const { state, original } = guidedOrdinaryK3();
        change(original);
        const before = JSON.stringify(state);
        expect(buildTaxInputFromGuidedData(state)).toBeNull();
        expect(JSON.stringify(state)).toBe(before);
    }
    const { state } = guidedOrdinaryK3();
    const first = required(buildTaxInputFromGuidedData(state));
    required(required(required(required(required(first.foreignTaxElection).creditWithForm1116).incomeSources)[0].qualifiedPartnership).entityPaidTaxPayments)[0].amountUsd = '1';
    first.scheduleK1[0].interestIncome = '1';
    const next = required(buildTaxInputFromGuidedData(state));
    expect(next.scheduleK1[0].interestIncome).toBe('20000');
    expect(required(required(required(required(required(next.foreignTaxElection).creditWithForm1116).incomeSources)[0].qualifiedPartnership).entityPaidTaxPayments)[0].amountUsd).toBe('900');
});
it('keeps the actual guided original packet out of hosted and provider projections', async () => {
    const { state, original } = guidedOrdinaryK3();
    const before = JSON.stringify(state);
    const { createWorkspaceRecord, syncGuidedFlowToWorkspace } = await import('@/lib/workspace-storage');
    const { buildGuidedFactAnswers, buildGuidedSyntheticDocuments } = await import('@/lib/guided-interview-bridge');
    const { sanitizeWorkspaceForHostedStorage } = await import('@/lib/hosted-privacy');
    const { buildProviderWorkspaceRequest } = await import('@/lib/provider-workspace-request');
    const workspace = syncGuidedFlowToWorkspace(createWorkspaceRecord('opaque-ordinary-k3', { now: '2026-11-15T00:00:00.000Z' }), buildGuidedSyntheticDocuments(state), buildGuidedFactAnswers(state), state);
    for (const payload of [JSON.stringify(sanitizeWorkspaceForHostedStorage(workspace)), JSON.stringify(buildProviderWorkspaceRequest(workspace, { now: '2026-11-15T00:00:00.000Z' }))])
        for (const marker of [original.partnershipName, original.partnershipEIN, original.recipientTaxpayerIdLast4, original.originalK1Reference, original.qualifiedK3Reference, original.usdPaidTaxSourceReference, 'entityPaidTaxPayments'])
            expect(payload).not.toContain(marker);
    expect(JSON.stringify(state)).toBe(before);
});

it('preserves direct method rejection of every ordinary-only original key', async () => {
    const { guidedForeignTaxK3Fixture } = await import('../fixtures/guided-foreign-tax-k3');
    const { buildGuidedForeignTaxK3Sources } = await import('@/lib/guided-foreign-tax-k3');
    const keys = ['foreignDeductions', 'foreignInterestExpense', 'otherExpenses', 'taxReduction', 'redeterminationAmount', 'calendarYearPartnershipConfirmed', 'usdReportedPaidTaxesConfirmed', 'usdPaidTaxSourceReference', 'entityPaidTaxPayments'];
    expect(buildGuidedForeignTaxK3Sources(guidedForeignTaxK3Fixture().state)).toHaveLength(1);
    for (const key of keys) for (const value of [undefined, null, '', '0', '1', false, [{ date: 'bad-date', amountUsd: '-1' }]]) {
        const { state, k3 } = guidedForeignTaxK3Fixture();
        Object.defineProperty(k3, key, { value, enumerable: true, writable: true, configurable: true });
        const before = JSON.stringify(state), beforeKeys = Object.keys(k3);
        expect(() => buildGuidedForeignTaxK3Sources(state)).toThrow(/unsupported source field/);
        expect(JSON.stringify(state)).toBe(before);
        expect(Object.keys(k3)).toEqual(beforeKeys);
    }
});
