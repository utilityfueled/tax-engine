// Spec: spec/federal/form-8962-shared-unshared.yaml.
import { expect, it } from 'vitest';
import { captureSharedPolicySources, deriveSharedPolicyMonths } from '@/lib/guided-shared-policy';
import { buildPremiumTaxCreditInputs } from '@/lib/guided-premium-tax-credit-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyCreditsData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualSharedUnsharedData } from '../fixtures/guided-shared-unshared';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';

it('preserves actual unshared classifications and canonical monthly amounts', () => {
  const data = actualSharedUnsharedData(), before = structuredClone(data);
  const copied = captureSharedPolicySources(data, completePersonalInfo, 'single');
  expect(copied.policies[1]?.situation).toBe('');
  expect(copied.policies[1]?.allCoveredPeopleInThisTaxFamilyConfirmed).toBeNull();
  expect(copied.policies[1]?.unsharedSourceReference).toBe('');
  const built = buildPremiumTaxCreditInputs(data, 2025, 'single', completePersonalInfo);
  expect(built.form1095A?.[1]?.monthlyPremiums[0]).toMatchObject({ month: 7, enrolleePremium: '700', slcsp: '650', advancePremiumTaxCredit: '300' });
  expect(built.form8962?.sharedPolicyAllocations?.policies?.[1]?.situation).toBe('not_shared');
  expect(deriveSharedPolicyMonths(data, 2025, 'single', completePersonalInfo)[6]).toMatchObject({ month: '7', enrolleePremium: '700', coverageEligible: true });
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '30000', socialSecurityWages: '30000', socialSecurityWithheld: '1860', medicareWages: '30000', medicareWithheld: '435' }] };
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: data };
  expect(validateSection(state, 'credits').status).toBe('complete');
  const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  expect([result.form8962?.ptcAllowed.toFixed(), result.form8962?.advancePTCTotal.toFixed(), result.form8962?.netPTC.toFixed()]).toEqual(['6012', '3300', '2712']);
  expect(data).toEqual(before);
  for (const value of [undefined, null, false]) {
    const changed = structuredClone(data); changed.sharedPolicyAllocations!.policies[1]!.allCoveredPeopleInThisTaxFamilyConfirmed = value;
    expect(() => buildPremiumTaxCreditInputs(changed, 2025, 'single', completePersonalInfo)).toThrow();
  }
  const changed = structuredClone(data); changed.sharedPolicyAllocations!.policies[1]!.unsharedSourceReference = 'Replacement source';
  const updated = updateSectionData(state, 'credits', { ...state.sectionData.credits, premiumTaxCredit: changed });
  expect(updated.sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBeNull();
  expect(updated.sectionData.credits?.premiumTaxCredit?.sharedPolicyAllocations?.sourceFactsConfirmed).toBeNull();
  expect(() => buildPremiumTaxCreditInputs(updated.sectionData.credits?.premiumTaxCredit, 2025, 'single', completePersonalInfo)).toThrow(/confirm/i);
});
