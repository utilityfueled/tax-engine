// Spec: spec/federal/guided-shared-policy.yaml.
import {expect,it} from 'vitest';
import {captureSharedPolicySources, deriveSharedPolicyMonths} from '@/lib/guided-shared-policy';
import {buildPremiumTaxCreditInputs, type PremiumTaxCreditData} from '@/lib/guided-premium-tax-credit-facts';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {emptyCreditsData,updateSectionData,validateSection} from '@/lib/guided-interview-flow';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
import {completePersonalInfo,completeW2Entry,startCompleteInterview} from './complete-facts';
import {actualSharedPolicyData} from '../fixtures/guided-shared-policy';
const build=(data:PremiumTaxCreditData)=>buildPremiumTaxCreditInputs(data,2025,'single',completePersonalInfo);
it('captures actual original policies without invented agreement facts',()=>{
 const data=actualSharedPolicyData(),before=JSON.stringify(data),copy=captureSharedPolicySources(data,completePersonalInfo,'single');
 expect(copy.primaryName).toBe('Jordan Example');expect(copy.primarySsn).toBe('111-22-3333');expect(copy.sourceTaxYear).toBe('2025');expect(copy.sourceFactsConfirmed).toBeNull();
 expect(copy.policies[0]?.monthlyAllocations[0]?.fraction).toBe('');expect(copy.policies[0]?.agreementConfirmed).toBeNull();expect(copy.policies[0]?.coveredFamilyAssignments.map(p=>p.family)).toEqual(['','']);
 expect(JSON.stringify(data)).toBe(before);
 const missing=actualSharedPolicyData();missing.policies[0]!.recipientSsn='';expect(()=>captureSharedPolicySources(missing,completePersonalInfo,'single')).toThrow(/recipient|SSN/i);
 missing.policies[0]!.taxYear='';expect(()=>captureSharedPolicySources(missing,completePersonalInfo,'single')).toThrow();
});
it('derives exact allocated source amounts and rejects contradictory snapshots',()=>{
 const data=actualSharedPolicyData(),before=JSON.stringify(data),input=build(data);expect(input.form1095A?.[0]?.monthlyPremiums[0]?.enrolleePremium).toBe('1000');expect(input.form8962?.monthlyReconciliation?.[0]).toMatchObject({enrolleePremium:'500',slcsp:'450',advancePremiumTaxCredit:'250'});expect(JSON.stringify(data)).toBe(before);
 const huge=actualSharedPolicyData();huge.policies[0]!.monthlyPremiums[0]!.enrolleePremium='9,007,199,254,740,993.01';huge.sharedPolicyAllocations!.policies[0]!.original!.monthlyPremiums[0]!.enrolleePremium='9007199254740993.01';huge.monthlyReconciliation=deriveSharedPolicyMonths(huge,2025,'single',completePersonalInfo);expect(build(huge).form8962?.monthlyReconciliation?.[0]?.enrolleePremium).toBe('4503599627370496.505');
 for(const mutate of [(x:PremiumTaxCreditData)=>{x.policies[0]!.policyNumber='replacement'},(x:PremiumTaxCreditData)=>{x.sharedPolicyAllocations!.policies[0]!.monthlyAllocations[0]!.fraction='0.501'},(x:PremiumTaxCreditData)=>{x.sharedPolicyAllocations!.policies[0]!.agreementConfirmed=null},(x:PremiumTaxCreditData)=>{x.monthlyReconciliation[0]!.advancePremiumTaxCredit='249.99'}]){const bad=actualSharedPolicyData();mutate(bad);expect(()=>build(bad)).toThrow();}
});
it('calculates shared coverage once through the actual guided return',()=>{
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'30000',socialSecurityWages:'30000',socialSecurityWithheld:'1860',medicareWages:'30000',medicareWithheld:'435'}]};state.sectionData.credits={...emptyCreditsData,premiumTaxCredit:actualSharedPolicyData()};
 expect(validateSection(state,'credits').status).toBe('complete');const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)),result=calculateFederalTax(input);expect(result.form8962?.ptcAllowed.toFixed()).toBe('4812');expect(result.form8962?.advancePTCTotal.toFixed()).toBe('3000');expect(result.form8962?.netPTC.toFixed()).toBe('1812');
 const next=actualSharedPolicyData();next.sourceTaxYear='2026';next.policies[0]!.taxYear='2026';next.sharedPolicyAllocations!.sourceTaxYear='2026';next.sharedPolicyAllocations!.policies[0]!.original!.taxYear='2026';expect(buildPremiumTaxCreditInputs(next,2026,'single',completePersonalInfo).form1095A?.[0]?.taxYear).toBe(2026);expect(()=>calculateFederalTax({...input,taxpayer:{...input.taxpayer,taxYear:2026}})).toThrow(/2026/);
});
it('preserves actual facts and invalidates stale source confirmations',()=>{
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});state.sectionData.credits={...emptyCreditsData,premiumTaxCredit:actualSharedPolicyData()};
 const changed=updateSectionData(state,'personal-info',{...completePersonalInfo,lastName:'Replacement'});expect(changed.sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBeNull();expect(changed.sectionData.credits?.premiumTaxCredit?.sharedPolicyAllocations?.sourceFactsConfirmed).toBeNull();
 const data=changed.sectionData.credits!.premiumTaxCredit!;data.sourceFactsConfirmed=true;data.sharedPolicyAllocations!.sourceFactsConfirmed=true;expect(()=>buildPremiumTaxCreditInputs(data,2025,'single',changed.sectionData['personal-info'])).toThrow(/identity/i);
 const confirmed=updateSectionData(state,'credits',{...state.sectionData.credits,premiumTaxCredit:{...state.sectionData.credits!.premiumTaxCredit!,sourceFactsConfirmed:true,sharedPolicyAllocations:{...state.sectionData.credits!.premiumTaxCredit!.sharedPolicyAllocations!,sourceFactsConfirmed:true}}});expect(confirmed.sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBe(true);expect(confirmed.sectionData.credits?.premiumTaxCredit?.sharedPolicyAllocations?.sourceFactsConfirmed).toBe(true);
});
it('preserves zero and full agreements while rejecting ambiguous household rows',()=>{
 const data=actualSharedPolicyData();data.sharedPolicyAllocations!.policies[0]!.monthlyAllocations[0]!.fraction='0';data.sharedPolicyAllocations!.policies[0]!.monthlyAllocations[1]!.fraction='1';data.monthlyReconciliation[0]!.coverageEligible=false;
 data.monthlyReconciliation=deriveSharedPolicyMonths(data,2025,'single',completePersonalInfo);
 expect(data.monthlyReconciliation[0]).toMatchObject({enrolleePremium:'0',slcsp:'0',advancePremiumTaxCredit:'0',coverageEligible:false});expect(data.monthlyReconciliation[1]).toMatchObject({enrolleePremium:'1000',slcsp:'900',advancePremiumTaxCredit:'500'});expect(build(data).form8962?.monthlyReconciliation?.[0]?.coverageEligible).toBe(false);
 const unknown=actualSharedPolicyData();unknown.monthlyReconciliation=[];expect(deriveSharedPolicyMonths(unknown,2025,'single',completePersonalInfo)[0]).toMatchObject({coverageEligible:null,incomeBasedSepEnrollment:null});
 const duplicate=actualSharedPolicyData();duplicate.monthlyReconciliation.push({...duplicate.monthlyReconciliation[0]!,month:'01',coverageEligible:false});expect(()=>deriveSharedPolicyMonths(duplicate,2025,'single',completePersonalInfo)).toThrow(/duplicate/i);
 const extra=actualSharedPolicyData();extra.monthlyReconciliation.push({...extra.monthlyReconciliation[0]!,month:'13'});expect(()=>deriveSharedPolicyMonths(extra,2025,'single',completePersonalInfo)).toThrow(/month/i);
 const conflicting=actualSharedPolicyData();conflicting.allocationRequired=false;expect(()=>build(conflicting)).toThrow(/reconcile/i);
 const health=actualSharedPolicyData();health.selfEmployedHealthInsuranceCoordinationRequired=true;expect(()=>build(health)).not.toThrow();
 for(const field of ['qsehraAffected','alternativeMarriageCalculationElected'] as const){const special=actualSharedPolicyData();special[field]=true;expect(()=>build(special)).toThrow();}
});
