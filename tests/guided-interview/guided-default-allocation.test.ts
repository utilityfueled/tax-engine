// Spec: spec/federal/form-8962-default-allocation.yaml.
import { expect, it } from 'vitest';
import { captureSharedPolicySources, deriveSharedPolicyMonths } from '@/lib/guided-shared-policy';
import { buildPremiumTaxCreditInputs } from '@/lib/guided-premium-tax-credit-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyCreditsData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualDefaultAllocationData } from '../fixtures/guided-default-allocation';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';

it('preserves actual enrollment evidence and derives a default allocation once', () => {
  const data = actualDefaultAllocationData(), before = JSON.stringify(data);
  const copied = captureSharedPolicySources(data, completePersonalInfo, 'single');
  expect(copied.policies[0]?.agreementConfirmed).toBeNull(); expect(copied.policies[0]?.defaultAllocation).toBeUndefined();
  const built = buildPremiumTaxCreditInputs(data, 2025, 'single', completePersonalInfo);
  expect(built.form8962?.sharedPolicyAllocations?.policies?.[0]?.defaultAllocation).toMatchObject({ enrollingTaxpayerSsn: '111-22-3333', allCoveredPeopleEnrolledByTaxpayerConfirmed: true });
  expect(JSON.stringify(data)).toBe(before);
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '30000', socialSecurityWages: '30000', socialSecurityWithheld: '1860', medicareWages: '30000', medicareWithheld: '435' }] };
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: data };
  expect(validateSection(state, 'credits').status).toBe('complete');
  const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  expect([result.form8962?.ptcAllowed.toFixed(), result.form8962?.advancePTCTotal.toFixed(), result.form8962?.netPTC.toFixed()]).toEqual(['2976', '1980', '996']);
  const huge = actualDefaultAllocationData(); huge.policies[0]!.monthlyPremiums[0]!.enrolleePremium = '9007199254740993.01';
  huge.sharedPolicyAllocations!.policies[0]!.original!.monthlyPremiums[0]!.enrolleePremium = '9007199254740993.01';
  huge.monthlyReconciliation = deriveSharedPolicyMonths(huge, 2025, 'single', completePersonalInfo);
  expect(huge.monthlyReconciliation[0]?.enrolleePremium).toBe('2972375754064527.6933');
  const unknown = actualDefaultAllocationData(); unknown.sharedPolicyAllocations!.policies[0]!.defaultAllocation!.allCoveredPeopleEnrolledByTaxpayerConfirmed = null;
  expect(() => deriveSharedPolicyMonths(unknown, 2025, 'single', completePersonalInfo)).toThrow(/who enrolled every covered person/i);
  unknown.sharedPolicyAllocations!.policies[0]!.defaultAllocation!.allCoveredPeopleEnrolledByTaxpayerConfirmed = true;
  unknown.monthlyReconciliation = []; expect(deriveSharedPolicyMonths(unknown, 2025, 'single', completePersonalInfo)[0]?.coverageEligible).toBeNull();
  const changed = structuredClone(data); changed.sharedPolicyAllocations!.policies[0]!.defaultAllocation!.enrollingTaxpayerSsn = '444-55-6666';
  const updated = updateSectionData(state, 'credits', { ...state.sectionData.credits, premiumTaxCredit: changed });
  expect(updated.sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBeNull(); expect(updated.sectionData.credits?.premiumTaxCredit?.sharedPolicyAllocations?.sourceFactsConfirmed).toBeNull();
  expect(() => buildPremiumTaxCreditInputs(updated.sectionData.credits?.premiumTaxCredit, 2025, 'single', completePersonalInfo)).toThrow(/confirm|checked/i);
});
