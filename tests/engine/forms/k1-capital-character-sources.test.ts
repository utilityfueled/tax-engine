import { describe, expect, it } from 'vitest';
import { calculateK1CapitalCharacterSources } from '@/engine/forms/k1-capital-character-sources.js';
import type { K1CapitalCharacterSources } from '@/models/k1-capital-character-sources.js';
import { k1CharitableAtRiskFixture, requireRiskSource } from '../../fixtures/k1-charitable-at-risk.js';

const source = (): K1CapitalCharacterSources => ({
    sourceTaxYear: 2025, sourceReference: 'Fictional original capital attachment', sourceFactsConfirmed: true,
    accountHolder: 'primary', entityName: 'K1 Charity Source', entityEIN: '12-3456789',
    allCapitalItemsIncludedConfirmed: true, ordinaryCapitalTreatmentConfirmed: true,
    currentShortTerm: { originalAmount: '-1000.25', character: 'portfolio', sourceReference: 'Original Box8 attachment' },
    currentLongTerm: { originalAmount: '2000.75', character: 'passive_activity', sourceReference: 'Original Box9a passive statement' },
    samePassiveActivityConfirmed: true, priorAtRiskCapital: [],
    priorPassiveCapital: { sourceTaxYear: 2024, sourceReference: 'Fictional filed capital worksheet', sourceFactsConfirmed: true,
        sameOwnerAndActivityConfirmed: true, shortTermLoss: '0', longTermLoss: '0' },
});
function input() {
    const k1 = k1CharitableAtRiskFixture().scheduleK1[0], facts = source();
    Object.assign(k1, { isPassiveActivity: true, netShortTermCapitalGain: '-1000.25', netLongTermCapitalGain: '2000.75' });
    facts.entityName = k1.partnershipName; facts.entityEIN = k1.partnershipEIN; facts.accountHolder = k1.accountHolder;
    return { taxYear: 2025, k1, source: facts, priorAtRisk: [] as Array<{ sourceId: string; character: 'short_term_capital' | 'long_term_capital' }> };
}
describe('original K1 capital sources (spec/federal/k1-passive-capital-sources.yaml)', () => {
    it('validates actual portfolio and passive classification without deriving it from the activity flag', () => {
        const original = input(), before = JSON.stringify(original), result = calculateK1CapitalCharacterSources(original);
        expect(result.currentShortTerm).toBe('portfolio'); expect(result.currentLongTerm).toBe('passive_activity');
        expect(result.priorShortTermLoss.toString()).toBe('0'); expect(result.priorLongTermLoss.toString()).toBe('0');
        expect(JSON.stringify(original)).toBe(before);
        original.k1.netShortTermCapitalGain = '0'; original.source.currentShortTerm = { originalAmount: '0' };
        expect(calculateK1CapitalCharacterSources(original).currentShortTerm).toBeUndefined();
    });
    it('preserves original prior risk character and known prior passive capital balances', () => {
        const original = input();
        original.priorAtRisk = [{ sourceId: 'prior-st', character: 'short_term_capital' }, { sourceId: 'prior-lt', character: 'long_term_capital' }];
        original.source.priorAtRiskCapital = [{ sourceId: 'prior-lt', character: 'portfolio', sourceReference: 'Actual old portfolio source' },
            { sourceId: 'prior-st', character: 'passive_activity', sourceReference: 'Actual old passive source' }];
        Object.assign(requireRiskSource(original.source.priorPassiveCapital), { shortTermLoss: '123.45', longTermLoss: '678.90' });
        const result = calculateK1CapitalCharacterSources(original);
        expect(result.priorAtRisk).toEqual({ 'prior-lt': 'portfolio', 'prior-st': 'passive_activity' });
        expect(result.priorShortTermLoss.toString()).toBe('123.45'); expect(result.priorLongTermLoss.toString()).toBe('678.9');
        original.source.priorAtRiskCapital.reverse();
        expect(calculateK1CapitalCharacterSources(original).priorAtRisk).toEqual(result.priorAtRisk);
    });
    it('rejects unknown false missing conflicting and stale original classification', () => {
        const changes: Array<(value: ReturnType<typeof input>) => void> = [
            value => { value.source.sourceFactsConfirmed = undefined; }, value => { value.source.sourceFactsConfirmed = false; },
            value => { value.source.allCapitalItemsIncludedConfirmed = false; }, value => { value.source.ordinaryCapitalTreatmentConfirmed = undefined; },
            value => { value.source.sourceTaxYear = 2024; }, value => { value.source.entityEIN = '98-7654321'; },
            value => { value.source.accountHolder = 'spouse'; }, value => { value.source.entityName = 'Different actual original'; },
            value => { requireRiskSource(value.source.currentShortTerm).originalAmount = '-1000.24'; }, value => { requireRiskSource(value.source.currentLongTerm).character = undefined; },
            value => { value.source.samePassiveActivityConfirmed = false; }, value => { value.source.priorAtRiskCapital = undefined; },
            value => { requireRiskSource(value.source.priorPassiveCapital).shortTermLoss = undefined; }, value => { requireRiskSource(value.source.priorPassiveCapital).sourceFactsConfirmed = false; },
            value => { requireRiskSource(value.source.priorPassiveCapital).sourceTaxYear = 2023; }, value => { requireRiskSource(value.source.priorPassiveCapital).sameOwnerAndActivityConfirmed = undefined; },
            value => { value.source.priorAtRiskCapital = [{ sourceId: 'unknown', character: 'portfolio', sourceReference: 'Unknown old record' }]; },
            value => { value.k1.isPassiveActivity = false; }, value => { value.k1.isPubliclyTradedPartnership = true; },
        ];
        for (const change of changes) { const original = input(); change(original); expect(() => calculateK1CapitalCharacterSources(original)).toThrow(/K1 capital character/); }
    });
});
