// Spec: spec/federal/marketplace-business-credit-method.yaml.
import { expect, it } from 'vitest';
import { buildHealthInsuranceInput } from '@/lib/guided-health-insurance-facts';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { guidedCoverageFamilyHealthState } from '../fixtures/guided-coverage-family-health';
import { guidedMarketplaceBusinessCreditMethodState } from '../fixtures/guided-marketplace-business-credit-method';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';

it('retains the actual method choice and invalidates it after consumed edits', () => {
  const state = guidedCoverageFamilyHealthState();
  const choice = { sourceTaxYear: '2025', sourceReference: 'Actual recorded choice', sourceFactsConfirmed: true,
    method: 'monthly_eligible_plan_enrollment', sameMethodForAllCalculationsConfirmed: true };
  Object.assign(state.sectionData.adjustments!.healthInsuranceFacts!, { marketplaceCreditAllocation: choice });
  const actual = state.sectionData.adjustments!.healthInsuranceFacts!, before = structuredClone(actual);
  expect(buildHealthInsuranceInput(actual, 'mfj', 2025)?.marketplaceCreditAllocation).toEqual({ ...choice, sourceTaxYear: 2025 });
  for (const [key, value] of [['sourceTaxYear',''],['sourceTaxYear','2026'],['sourceReference',''],['sourceFactsConfirmed',null],['sourceFactsConfirmed',false],['method',''],['sameMethodForAllCalculationsConfirmed',null],['sameMethodForAllCalculationsConfirmed',false]] as const) {
    const data = structuredClone(actual);
    Object.assign(data, { marketplaceCreditAllocation: { ...choice, [key]: value } });
    expect(() => buildHealthInsuranceInput(data, 'mfj', 2025)).toThrow(/method|choice|source|allocation/i);
  }
  for (const edit of ['personal','policy','payment','method']) {
    let next = structuredClone(state);
    if (edit === 'personal') next = updateSectionData(next, 'personal-info', { ...next.sectionData['personal-info']!, firstName: 'Different' });
    else if (edit === 'policy') next = updateSectionData(next, 'credits', { ...next.sectionData.credits!, premiumTaxCredit: { ...next.sectionData.credits!.premiumTaxCredit!, sourceReference: 'Changed original policy' } });
    else {
      const data = structuredClone(next.sectionData.adjustments!);
      if (edit === 'payment') data.healthInsuranceFacts!.plans[0].payments[0].sourceId = 'Changed actual receipt';
      else Object.assign(data.healthInsuranceFacts!, { marketplaceCreditAllocation: { ...choice, sourceReference: 'Changed choice source' } });
      next = updateSectionData(next, 'adjustments', data);
    }
    const record = next.sectionData.adjustments!.healthInsuranceFacts! as unknown as { marketplaceCreditAllocation: { sourceFactsConfirmed: boolean | null } };
    expect(record.marketplaceCreditAllocation.sourceFactsConfirmed).toBeNull();
    expect(next.sectionData.adjustments!.healthInsuranceFacts!.sourceFactsConfirmed).toBeNull();
  }
  expect(actual).toEqual(before);
});
it('calculates separate actual business owners from the saved method and original plans', () => {
  const state = guidedMarketplaceBusinessCreditMethodState(), before = structuredClone(state);
  expect(validateSection(state,'adjustments').status).toBe('complete'); expect(validateSection(state,'credits').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
  expect(input?.form7206?.marketplaceCreditAllocation?.method).toBe('monthly_eligible_plan_enrollment');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect([result.totalIncome.toFixed(),result.schedule1!.seHealthInsurance.toFixed(),result.agi.toFixed(),result.form8962!.ptcAllowed.toFixed()]).toEqual(['40000','3000','35587','11658']);
  expect(result.allLines.find(row => row.form === 'QBI Source Deductions' && row.line === 'scheduleC')?.inputs['SE health insurance'].toString()).toBe('1800');
  expect(state).toEqual(before);
});
