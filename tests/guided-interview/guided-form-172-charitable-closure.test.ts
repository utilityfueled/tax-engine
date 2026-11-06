// Spec: spec/federal/form-172-charitable-closure.yaml guided-originals.
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { guidedCharitableClosureState } from '../fixtures/guided-form-172-charitable-closure';

function actual<T>(value: T | undefined | null): T { if (value == null) throw Error('Missing fictional source'); return value; }
it('reaches original charitable and prior-history loss origins from actual guided records', () => {
  for (const kind of ['crypto', 'k1', 'prior'] as const) {
    const state = guidedCharitableClosureState(kind), before = JSON.stringify(state);
    expect(validateSection(state, 'adjustments').status).toBe('complete');
    expect(validateSection(state, 'deductions').status).toBe('complete');
    const input = TaxYearInputSchema.parse(actual(buildTaxInputFromGuidedData(state))), result = calculateFederalTax(input);
    expect([result.agi, result.scheduleA?.charitableTotal, result.form172?.regular.netOperatingLoss,
      result.form172?.alternativeTax.netOperatingLoss, result.carryforwards.charitableContributions,
      result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
      .toEqual(['10000', '3000', '13000', '0', kind === 'prior' ? '47000' : '57000', kind === 'prior' ? '0' : '57000']);
    expect(JSON.stringify(state)).toBe(before);
    const missing = structuredClone(state);
    actual(missing.sectionData.adjustments?.netOperatingLossSources?.alternativeTax).charitableCarryoverHistory = undefined;
    expect(validateSection(missing, 'adjustments').status).toBe('partial');
    expect(buildTaxInputFromGuidedData(missing)).toBeNull();
    const changed = structuredClone(actual(state.sectionData.deductions));
    if (kind === 'crypto') actual(changed.cryptoDonations)[0].charityName = 'Different actual fictional charity';
    else if (kind === 'k1') actual(actual(changed.k1CharitableSources?.statements)[0].receipts)[0].sourceReference = 'Different actual receipt';
    else actual(changed.charitableCarryoverSources).sourceReference = 'Different original prior worksheet';
    expect(updateSectionData(state, 'deductions', changed).sectionData.adjustments?.currentLossOrigin?.sourceFactsConfirmed).toBeNull();
  }
});
