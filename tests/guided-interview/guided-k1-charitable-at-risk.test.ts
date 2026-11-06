import { requireRiskSource } from '../fixtures/k1-charitable-at-risk.js';
import { expect, it } from 'vitest';
import { guidedK1CharitableAtRiskState } from '../fixtures/guided-k1-charitable-at-risk';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildGuidedK1CharitableSources, updateK1CharitableSources } from '@/lib/guided-k1-charitable-sources';
it('uses actual linked activity assignment without entering a calculated allowance', () => {
    for (const gain of [false, true]) {
        const state = guidedK1CharitableAtRiskState(gain), before = JSON.stringify(state);
        expect(validateSection(state, 'deductions').status, JSON.stringify({ gain, validation: validateSection(state, 'deductions') })).toBe('complete');
        expect(validateSection(state, 'adjustments').status).toBe('complete');
        const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), r = calculateFederalTax(input);
        expect(input.scheduleK1).toHaveLength(1); expect(input.scheduleK1[0].ordinaryIncome).toBe('-80000'); expect(input.scheduleK1[0].charitableCash).toBe('20000');
        expect(input.k1CharitableSources?.statements?.[0].atRisk?.activityAllocation?.charitableSourceIds).toEqual([]);
        expect(r.scheduleE?.partnerships[0].netAmount.toFixed()).toBe('-25000'); expect(r.scheduleA?.cashCharitable.toFixed()).toBe('10000');
        expect(r.agi.toFixed()).toBe(gain ? '85000' : '75000'); expect(r.carryforwards.qbiLossCarryforward.toFixed()).toBe('25000');
        expect(JSON.stringify(state)).toBe(before);
    }
    const contradict = guidedK1CharitableAtRiskState(true); requireRiskSource(requireRiskSource(requireRiskSource(contradict.sectionData.adjustments).k1LossSources).activities)[0].allOtherNonCharitableAmountsZeroConfirmed = true;
    expect(() => buildGuidedK1CharitableSources(contradict)).toThrow(/zero|source|amount/i);
    const unknown = guidedK1CharitableAtRiskState(); delete requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(unknown.sectionData.deductions).k1CharitableSources).statements)[0].atRisk).activityAllocation).charitableSourceIds;
    expect(() => buildGuidedK1CharitableSources(unknown)).toThrow(/assignment|source/i);
    const edited = guidedK1CharitableAtRiskState(), data = requireRiskSource(requireRiskSource(edited.sectionData.deductions).k1CharitableSources);
    const changed = structuredClone(requireRiskSource(data.statements)); requireRiskSource(requireRiskSource(requireRiskSource(changed[0].atRisk).activityAllocation).charitableSourceIds)[0] = 'replaced-source';
    const invalid = updateK1CharitableSources(data, { statements: changed });
    expect(requireRiskSource(requireRiskSource(requireRiskSource(invalid.statements)[0].atRisk).activityAllocation).sourceFactsConfirmed).toBeNull();
    expect(invalid.sourceFactsConfirmed).toBeNull();
    const household = updateSectionData(edited, 'personal-info', { ...requireRiskSource(edited.sectionData['personal-info']), ssn: '111-22-3334' });
    expect(household.sectionData.deductions?.k1CharitableSources?.statements?.[0].atRisk?.activityAllocation?.sourceFactsConfirmed).toBeNull();
});
