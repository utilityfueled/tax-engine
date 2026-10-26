// Spec: spec/federal/shared-owner-marketplace-health.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { guidedMarketplaceHealthOwnersState } from '../fixtures/guided-marketplace-health-owners';
import { guidedSharedOwnerHealthRecords } from '../fixtures/guided-shared-owner-health-records';

it('transfers complete separate-plan owner sources and invalidates edits', () => {
  for (const second of ['shared', 'household'] as const) {
    const state = guidedMarketplaceHealthOwnersState(), records = guidedSharedOwnerHealthRecords(second);
    state.sectionData.adjustments!.healthInsuranceFacts = records.health; state.sectionData.credits!.premiumTaxCredit = records.coverage;
    const before = structuredClone(state);
    expect(healthInsuranceSourceErrors(state)).toEqual({});
    expect(validateSection(state, 'adjustments').status).toBe('complete'); expect(validateSection(state, 'credits').status).toBe('complete');
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
    // C30000 minus half2119 plus actual spouse wages20000 gives47881.
    // W9000 ->38881/190%/.016 ->52 monthly; PTC7776. Health1224.
    // Final46657/228%/.0312 ->121 monthly; finalPTC6948.
    expect([result.marketplaceHealthInsurance!.step2Credit, result.schedule1!.seHealthInsurance, result.agi, result.form8962!.ptcAllowed].map(row => row.toFixed())).toEqual(['7776', '1224', '46657', '6948']);
    expect(result.allLines.filter(row => row.form === 'Pub974 Owner Allocation' && row.line.endsWith(':deduction')).map(row => [row.line, row.value.toDecimalPlaces(2).toFixed()])).toEqual([['primary:deduction', '816'], ['spouse:deduction', '408']]);
    expect(input.form1095A[1]!.monthlyPremiums[0]!.enrolleePremium).toBe(second === 'shared' ? '500' : '250');
    expect(state).toEqual(before);
    const health = structuredClone(records.health); health.plans[1]!.sharedMarketplaceSources!.sourceReference += ' edited';
    const changed = updateSectionData(state, 'adjustments', { ...state.sectionData.adjustments!, healthInsuranceFacts: health });
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.plans.every(plan => plan.sharedMarketplaceSources!.sourceFactsConfirmed === null)).toBe(true);
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.plans[1]!.payments).toEqual(before.sectionData.adjustments!.healthInsuranceFacts!.plans[1]!.payments);
    const missing = structuredClone(state); missing.sectionData.adjustments!.healthInsuranceFacts!.plans[1]!.sharedMarketplaceSources = undefined;
    expect(buildTaxInputFromGuidedData(missing)).toBeNull();
    const blank = structuredClone(state); blank.sectionData.adjustments!.healthInsuranceFacts!.plans[1]!.payments[0]!.otherPersonPaid = '';
    expect(buildTaxInputFromGuidedData(blank)).toBeNull();
  }
});
