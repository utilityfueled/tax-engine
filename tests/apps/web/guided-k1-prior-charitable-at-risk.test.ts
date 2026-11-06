import { expect, it } from 'vitest';
import { d } from '@/utils/decimal';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildGuidedK1CharitableSources, updateK1CharitableSources } from '@/lib/guided-k1-charitable-sources';
import { guidedK1PriorRiskState } from '../../fixtures/guided-k1-prior-charitable-at-risk';
import { requireRiskSource } from '../../fixtures/k1-charitable-at-risk';
import { guidedK1PriorRiskSources } from '../../fixtures/k1-prior-charitable-at-risk-guide-sources';

it('uses actual linked prior records without an entered current allowance', () => {
    // Spec: K1 Prior Charitable At Risk, guided-originals.
    const state = guidedK1PriorRiskState();
    const packet = requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources);
    const browserOriginals = guidedK1PriorRiskSources();
    expect(browserOriginals.charity).toEqual(packet);
    expect(browserOriginals.qualifiedLoss).toEqual(state.sectionData.adjustments?.k1LossSources);
    const records = requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(packet.statements)[0].atRisk).priorLossHistory).characterSources).records;
    requireRiskSource(records)[0].originalPostBasisDeduction = '60,000.00';
    requireRiskSource(requireRiskSource(records)[0].useHistory)[0].amountAllowed = '10,000.00';
    const before = JSON.stringify(state), sources = requireRiskSource(buildGuidedK1CharitableSources(state));
    expect(sources.scheduleK1).toHaveLength(1);
    const actual = requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(sources.k1CharitableSources?.statements)[0].atRisk).priorLossHistory).characterSources).records;
    expect(requireRiskSource(actual)[0].originalPostBasisDeduction).toBe('60000.00');
    expect(requireRiskSource(requireRiskSource(actual)[1].gift).basisOriginTaxYear).toBe(2024);
    const input = TaxYearInputSchema.parse(requireRiskSource(buildTaxInputFromGuidedData(state))), result = calculateFederalTax(input);
    expect(result.agi.toFixed(0)).toBe('85714'); expect(requireRiskSource(result.scheduleA).cashCharitable.toFixed(25)).toBe(d(110000).div(7).toFixed(25));
    expect(result.carryforwards.qbiLossCarryforward.toFixed(0)).toBe('11429'); expect(JSON.stringify(state)).toBe(before);
});
it('retains unknown and false source history and invalidates original edits', () => {
    // Spec: K1 Prior Charitable At Risk, guided-invalidation.
    const state = guidedK1PriorRiskState(), packet = requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources);
    const statement = requireRiskSource(packet.statements)[0], history = requireRiskSource(requireRiskSource(statement.atRisk).priorLossHistory);
    const originals = requireRiskSource(history.characterSources);
    for (const confirmation of [false, null, undefined]) {
        const changed = structuredClone(state);
        requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(changed.sectionData.deductions).k1CharitableSources).statements)[0].atRisk).priorLossHistory).characterSources = { ...originals, sourceFactsConfirmed: confirmation };
        expect(() => buildGuidedK1CharitableSources(changed)).toThrow(/history|source|confirm/i);
    }
    const replacement = structuredClone(packet); requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(replacement.statements)[0].atRisk).priorLossHistory).characterSources).sourceReference = 'Equal-money replacement';
    const edited = updateK1CharitableSources(packet, replacement);
    expect(edited.sourceFactsConfirmed).toBeNull();
    expect(edited.statements?.[0].atRisk?.priorLossHistory?.characterSources?.sourceFactsConfirmed).toBeNull();
    expect(edited.statements?.[0].atRisk?.priorLossHistory?.characterSources?.records).toEqual(originals.records);
});
