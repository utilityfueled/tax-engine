// Spec: spec/federal/guided-shared-policy.yaml.
import { expect, it } from 'vitest';
import { buildPremiumTaxCreditInputs } from '@/lib/guided-premium-tax-credit-facts';
import { deriveSharedPolicyMonths, guidedMarketplaceHousehold, resolveGuidedSharedPolicy } from '@/lib/guided-shared-policy';
import { calculateFederalTax } from '@/engine/federal';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyCreditsData, validateSection } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';
import { actualSeparateReturnData } from '../fixtures/guided-separate-return';

it('derives a separate return allocation from the guided answers', () => {
  expect(deriveSharedPolicyMonths(actualSeparateReturnData(true), 2025, 'mfs', completePersonalInfo)[0]).toMatchObject({ enrolleePremium: '500', slcsp: '420', advancePremiumTaxCredit: '250' });
  const repaid = deriveSharedPolicyMonths(actualSeparateReturnData(false), 2025, 'mfs', completePersonalInfo)[0];
  expect(repaid).toMatchObject({ enrolleePremium: '0', slcsp: '0', advancePremiumTaxCredit: '250' });
  expect(buildPremiumTaxCreditInputs(actualSeparateReturnData(false), 2025, 'mfs', completePersonalInfo).form8962?.sharedPolicyAllocations?.policies?.[0]?.separateReturn?.ownCoverageFamilySlcsp).toEqual([]);
  const missing = actualSeparateReturnData(true); missing.sharedPolicyAllocations!.policies[0]!.separateReturn!.ownCoverageFamilySlcsp[3]!.slcsp = '';
  expect(() => deriveSharedPolicyMonths(missing, 2025, 'mfs', completePersonalInfo)).toThrow(/benchmark/i);
});
it('checks the other taxpayer against the guided spouse', () => {
  const spouse = { ...completePersonalInfo, spouse: { ...completePersonalInfo.spouse!, firstName: 'Casey', ssn: '555-66-7777' } };
  expect(() => deriveSharedPolicyMonths(actualSeparateReturnData(false), 2025, 'mfs', spouse)).toThrow(/actual spouse/);
  expect(deriveSharedPolicyMonths(actualSeparateReturnData(false), 2025, 'mfs', completePersonalInfo)[0]).toMatchObject({ advancePremiumTaxCredit: '250' });
  const blank = { ...completePersonalInfo, spouse: { ...completePersonalInfo.spouse!, ssn: ' ' } };
  expect(deriveSharedPolicyMonths(actualSeparateReturnData(false), 2025, 'mfs', blank)[0]).toMatchObject({ advancePremiumTaxCredit: '250' });
});
it('calculates Exception 1 through the actual guided return', () => {
  const state = startCompleteInterview({ filingStatus: 'hoh', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '30000', socialSecurityWages: '30000', medicareWages: '30000', socialSecurityWithheld: '1860', medicareWithheld: '435' }] };
  const data = actualSeparateReturnData(true); delete data.marriedFilingSeparatelyExceptionConfirmed;
  const evidence = data.sharedPolicyAllocations!.policies[0]!.separateReturn!; evidence.livingApartExceptionConfirmed = true;
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: data };
  expect(validateSection(state, 'credits').status).toBe('complete');
  const form = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).form8962!;
  expect(form.annualSLCSP.toFixed()).toBe('5040'); expect(form.advancePTCTotal.toFixed()).toBe('3000'); expect(form.ptcAllowed.gt(0)).toBe(true);
});
it('keeps the spouse away from other separate-return Marketplace routes', () => {
  expect(guidedMarketplaceHousehold(completePersonalInfo, 'mfs', 2025).taxpayer.spouse).toBeUndefined();
  expect(guidedMarketplaceHousehold(completePersonalInfo, 'mfj', 2025).taxpayer.spouse?.ssn).toBe('222-33-4444');
  expect(resolveGuidedSharedPolicy(actualSeparateReturnData(false), 2025, 'mfs', completePersonalInfo).sourceInput.taxpayer.spouse?.ssn).toBe('222-33-4444');
  const living = actualSeparateReturnData(true); living.sharedPolicyAllocations!.policies[0]!.separateReturn!.livingApartExceptionConfirmed = true;
  expect(resolveGuidedSharedPolicy(living, 2025, 'hoh', completePersonalInfo).sourceInput.taxpayer.spouse).toBeUndefined();
});
it('calculates a separate return through the actual guided return', () => {
  for (const [exception, allowed, advance, repayment] of [[false, '0', '3000', '750'], [true, null, '3000', null]] as const) {
    const state = startCompleteInterview({ filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
    state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '30000', socialSecurityWages: '30000', medicareWages: '30000', socialSecurityWithheld: '1860', medicareWithheld: '435' }] };
    state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: actualSeparateReturnData(exception) };
    expect(validateSection(state, 'credits').status).toBe('complete');
    const form = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).form8962!;
    expect(form.advancePTCTotal.toFixed()).toBe(advance);
    if (allowed !== null) expect(form.ptcAllowed.toFixed()).toBe(allowed); else expect(form.annualSLCSP.toFixed()).toBe('5040');
    if (repayment !== null) expect(form.excessAPTCRepayment.toFixed()).toBe(repayment);
  }
});
