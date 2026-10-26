// Spec: spec/federal/form-8962-no-advance-overlap.yaml.
import {expect,it} from 'vitest';
import {captureNoAdvanceCoverageFamilies,captureNoAdvanceBenchmarkSources,deriveSharedPolicyMonths} from '@/lib/guided-shared-policy';
import {buildPremiumTaxCreditInputs} from '@/lib/guided-premium-tax-credit-facts';
import {emptyCreditsData,updateSectionData,validateSection} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
import {actualNoAdvanceOverlapData} from '../fixtures/guided-no-advance-overlap';
import {completePersonalInfo,completeW2Entry,startCompleteInterview} from './complete-facts';
it('copies full coverage families and preserves unknown sources through canonical intake',()=>{
 const data=actualNoAdvanceOverlapData(),before=JSON.stringify(data),packet=data.sharedPolicyAllocations!;
 const copied=captureNoAdvanceCoverageFamilies(packet);expect(copied.sourceTaxYear).toBe('2025');expect(copied.sourceReference).toBe('');expect(copied.sourceFactsConfirmed).toBeNull();expect(copied.months[0].families.map(f=>[f.taxpayerName,f.groups,f.allCoveragePoliciesIncludedConfirmed])).toEqual([['Jordan Example',[],null],['Robin Other',[],null]]);
 const benchmarks=captureNoAdvanceBenchmarkSources(packet.policies[0],packet);expect(benchmarks.monthlyBenchmarks[0]).toMatchObject({thisReturnSlcsp:'',thisReturnCoveredIndividualSsns:['111-22-3333']});
 const inputs=buildPremiumTaxCreditInputs(data,2025,'single',completePersonalInfo);expect(inputs.form8962?.sharedPolicyAllocations?.noAdvanceCoverageFamilies?.months?.[0].families?.[0].groups?.[0].slcsp).toBe('1200');expect(inputs.form8962?.monthlyReconciliation).toHaveLength(1);expect(JSON.stringify(data)).toBe(before);
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'30000',socialSecurityWages:'30000',socialSecurityWithheld:'1860',medicareWages:'30000',medicareWithheld:'435'}]};state.sectionData.credits={...emptyCreditsData,premiumTaxCredit:data};expect(validateSection(state,'credits').status).toBe('complete');expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).form8962?.ptcAllowed.toFixed()).toBe('1000');
 const changed=structuredClone(data);changed.sharedPolicyAllocations!.noAdvanceCoverageFamilies!.months[0].families[0].groups[0].ratingArea='Actual changed area';const next=updateSectionData(state,'credits',{...state.sectionData.credits,premiumTaxCredit:changed});const saved=next.sectionData.credits!.premiumTaxCredit!;expect(saved.sourceFactsConfirmed).toBeNull();expect(saved.sharedPolicyAllocations!.sourceFactsConfirmed).toBeNull();expect(saved.sharedPolicyAllocations!.noAdvanceCoverageFamilies!.sourceFactsConfirmed).toBeNull();
 for(const value of ['', 'NaN','-1']){const invalid=structuredClone(data);invalid.sharedPolicyAllocations!.noAdvanceCoverageFamilies!.months[0].families[0].groups[0].slcsp=value;expect(()=>buildPremiumTaxCreditInputs(invalid,2025,'single',completePersonalInfo)).toThrow();}
 const unknown=structuredClone(data);unknown.monthlyReconciliation=[];expect(deriveSharedPolicyMonths(unknown,2025,'single',completePersonalInfo)[0].coverageEligible).toBeNull();
});
