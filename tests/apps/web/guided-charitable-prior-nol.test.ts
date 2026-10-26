// Spec: charitable-prior-net-operating-loss.yaml actual-guide.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { priorCharitableNolInterview } from '../../fixtures/guided-charitable-prior-nol';
it('transfers independently confirmed prior charity histories through the actual guide', () => {
    const state = priorCharitableNolInterview(), original = structuredClone(state);
    expect(validateSection(state, 'adjustments').status).toBe('complete');
    const input = buildTaxInputFromGuidedData(state);
    if (!input)
        throw new Error('Complete original charity history must reach the canonical calculation');
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect([result.agi, result.carryforwards.charitableContributions, required(result.form6251).amti].map(row => row.toFixed())).toEqual(['44000', '23360', '90000']);
    expect(required(required(required(required(required(input.netOperatingLoss).alternativeTax).charitableCarryoverHistory).alternativeCarryoverSources).vintages)[0].openingCarryforward).toBe('10000');
    expect(state).toEqual(original);
    const zero = priorCharitableNolInterview('0');
    expect(buildTaxInputFromGuidedData(zero)?.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources?.vintages).toEqual([]);
    for (const mutation of ['missing', 'false', 'opening', 'identity', 'regular', 'year'] as const) {
        const bad = priorCharitableNolInterview(), history = required(required(required(required(bad.sectionData.adjustments).netOperatingLossSources).alternativeTax).charitableCarryoverHistory);
        if (mutation === 'missing')
            history.alternativeCarryoverSources = undefined;
        if (mutation === 'false')
            required(history.alternativeCarryoverSources).sourceFactsConfirmed = false;
        if (mutation === 'opening')
            required(required(history.alternativeCarryoverSources).vintages)[0].openingCarryforward = '10000.01';
        if (mutation === 'identity')
            required(history.alternativeCarryoverSources).primaryTaxpayerIdLast4 = '1111';
        if (mutation === 'regular')
            required(bad.sectionData.deductions).charitableCarryoverSources = undefined;
        if (mutation === 'year')
            bad.taxYear = 2026;
        expect(validateSection(bad, 'adjustments').status).toBe('partial');
        expect(buildTaxInputFromGuidedData(bad)).toBeNull();
    }
    const changed = updateSectionData(state, 'personal-info', { ...required(state.sectionData['personal-info']), lastName: 'Changed' });
    const history = required(required(required(required(changed.sectionData.adjustments).netOperatingLossSources).alternativeTax).charitableCarryoverHistory);
    expect(history.sourceFactsConfirmed).toBeNull();
    expect(required(history.alternativeCarryoverSources).sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
});

function required<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) throw new Error("Missing fictional source or expected calculation");
  return value;
}
