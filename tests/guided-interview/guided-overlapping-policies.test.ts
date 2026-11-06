// Spec: spec/federal/form-8962-overlapping-policies.yaml.
import { expect, it } from 'vitest';
import { captureOverlappingBenchmarkSources, copyBenchmarkGroupPeople, deriveSharedPolicyMonths } from '@/lib/guided-shared-policy';
import { buildPremiumTaxCreditInputs } from '@/lib/guided-premium-tax-credit-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyCreditsData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualOverlappingPolicyData } from '../fixtures/guided-overlapping-policy';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';

it('captures actual benchmark groups and transfers one household month', () => {
  const data = actualOverlappingPolicyData(), before = structuredClone(data), packet = data.sharedPolicyAllocations!;
  expect(captureOverlappingBenchmarkSources(packet)).toEqual({ sourceTaxYear: '2025', sourceReference: '', sourceFactsConfirmed: null, allBenchmarkMonthsIncluded: null, months: [{ month: '1', groups: [] }] });
  expect(copyBenchmarkGroupPeople(packet, '1', ['form1095A:1', 'form1095A:2'])).toEqual(['111-22-3333']);
  const derived = deriveSharedPolicyMonths(data, 2025, 'single', completePersonalInfo);
  expect(derived).toEqual([{ month: '1', enrolleePremium: '1450', slcsp: '750', advancePremiumTaxCredit: '250', coverageEligible: true, incomeBasedSepEnrollment: false }]);
  const built = buildPremiumTaxCreditInputs(data, 2025, 'single', completePersonalInfo);
  expect(built.form8962?.sharedPolicyAllocations?.overlappingCoverage?.months?.[0]?.groups?.[0]?.coveredIndividualSsns).toEqual(['111-22-3333']);
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '20000', socialSecurityWages: '20000', socialSecurityWithheld: '1240', medicareWages: '20000', medicareWithheld: '290' }] };
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: data };
  expect(validateSection(state, 'credits').status).toBe('complete');
  const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).form8962!;
  expect([result.ptcAllowed.toFixed(), result.advancePTCTotal.toFixed(), result.netPTC.toFixed()]).toEqual(['750', '250', '500']);
  expect(data).toEqual(before);
  const unknown = structuredClone(data); unknown.monthlyReconciliation[0]!.coverageEligible = null;
  expect(deriveSharedPolicyMonths(unknown, 2025, 'single', completePersonalInfo)[0]?.coverageEligible).toBeNull();
  expect(() => buildPremiumTaxCreditInputs(unknown, 2025, 'single', completePersonalInfo)).toThrow(/coverage/i);
  const changed = structuredClone(data); changed.sharedPolicyAllocations!.overlappingCoverage!.months[0]!.groups[0]!.sourceReference = 'Replacement record';
  const updated = updateSectionData(state, 'credits', { ...state.sectionData.credits, premiumTaxCredit: changed });
  expect(updated.sectionData.credits?.premiumTaxCredit?.sharedPolicyAllocations?.overlappingCoverage?.sourceFactsConfirmed).toBeNull();
  expect(updated.sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBeNull();
  expect(() => buildPremiumTaxCreditInputs(updated.sectionData.credits?.premiumTaxCredit, 2025, 'single', completePersonalInfo)).toThrow();
});
