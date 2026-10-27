import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildGuidedK1CharitableSources, updateK1CharitableSources } from '@/lib/guided-k1-charitable-sources';
import { guidedK1PassiveCapitalState } from '../../fixtures/guided-k1-passive-capital';
import { requireRiskSource } from '../../fixtures/k1-charitable-at-risk';
import browserOriginal from '../../fixtures/guided-k1-passive-capital-browser.json';

it('builds linked actual capital originals and independent prior balances once', () => {
    // Spec: K1 Passive Capital Sources, guided-originals.
    expect(guidedK1PassiveCapitalState('8000')).toEqual(browserOriginal);
    const state = guidedK1PassiveCapitalState('8,000.00');
    const packet = requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources);
    const source = requireRiskSource(requireRiskSource(packet.statements)[0].capitalCharacter);
    requireRiskSource(source.currentShortTerm).originalAmount = '10,000.00';
    const before = JSON.stringify(state), built = requireRiskSource(buildGuidedK1CharitableSources(state));
    expect(built.scheduleK1).toHaveLength(2); expect(built.suspendedPassiveLosses[0].amount).toBe('8000');
    expect(built.k1CharitableSources?.statements?.[0].capitalCharacter?.currentShortTerm?.originalAmount).toBe('10000.00');
    expect(built.k1CharitableSources?.statements?.[0].capitalCharacter?.priorPassiveCapital?.shortTermLoss).toBe('8000.00');
    expect(built.qbiLossSources?.form461Classification).toBeUndefined();
    const input = TaxYearInputSchema.parse(requireRiskSource(buildTaxInputFromGuidedData(state))), result = calculateFederalTax(input);
    expect(result.agi.toDecimalPlaces(8).toString()).toBe('100000');
    expect(result.capitalGainLoss.toDecimalPlaces(8).toString()).toBe('1333.33333333');
    expect(result.carryforwards.k1PassiveByCharacter?.[0].shortTermCapital.toString()).toBe('0');
    expect(JSON.stringify(state)).toBe(before);
});
it('preserves unknown false and original edit invalidation', () => {
    // Spec: K1 Passive Capital Sources, guided-unknown.
    const state = guidedK1PassiveCapitalState();
    const packet = requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources);
    for (const value of [undefined, null, false]) {
        const changed = structuredClone(state);
        requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(changed.sectionData.deductions).k1CharitableSources).statements)[0].capitalCharacter).sourceFactsConfirmed = value;
        expect(() => buildGuidedK1CharitableSources(changed)).toThrow(/original|source|capital/i);
    }
    const missing = structuredClone(state);
    delete requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(missing.sectionData.deductions).k1CharitableSources).statements)[0].capitalCharacter).priorPassiveCapital).longTermLoss;
    expect(() => buildGuidedK1CharitableSources(missing)).toThrow(/original|source|capital/i);
    const replacement = structuredClone(packet), original = requireRiskSource(requireRiskSource(replacement.statements)[0].capitalCharacter);
    original.sourceReference = 'Actual replacement original';
    const edited = updateK1CharitableSources(packet, replacement);
    expect(edited.sourceFactsConfirmed).toBeNull(); expect(edited.statements?.[0].capitalCharacter?.sourceFactsConfirmed).toBeNull();
    expect(edited.statements?.[0].capitalCharacter?.priorPassiveCapital?.sourceFactsConfirmed).toBeNull();
    expect(edited.statements?.[0].capitalCharacter?.currentShortTerm).toEqual(original.currentShortTerm);
});
