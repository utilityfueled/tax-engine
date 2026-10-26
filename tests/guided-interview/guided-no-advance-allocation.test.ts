// Spec: spec/federal/form-8962-no-advance-allocation.yaml.
import { expect,it } from 'vitest';
import { captureSharedPolicySources,captureNoAdvanceBenchmarkSources,deriveSharedPolicyMonths } from '@/lib/guided-shared-policy';
import { buildPremiumTaxCreditInputs } from '@/lib/guided-premium-tax-credit-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyCreditsData,updateSectionData,validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualNoAdvanceAllocationData } from '../fixtures/guided-no-advance-allocation';
import { completePersonalInfo,completeW2Entry,startCompleteInterview } from './complete-facts';
it('preserves original blank and independent family benchmark facts through canonical intake',()=>{
 const data=actualNoAdvanceAllocationData(),before=JSON.stringify(data),policy=data.sharedPolicyAllocations!.policies[0]!;
 const copied=captureSharedPolicySources(data,completePersonalInfo,'single');expect(copied.policies[0]?.agreementConfirmed).toBeNull();expect(copied.policies[0]?.original?.monthlyPremiums[0]?.slcspReportedBlank).toBe(true);
 const rows=captureNoAdvanceBenchmarkSources(policy);expect(rows.sourceTaxYear).toBe('2025');expect(rows.sourceReference).toBe('');expect(rows.sourceFactsConfirmed).toBeNull();expect(rows.allCoveredPeopleInCoverageFamiliesConfirmed).toBeNull();expect(rows.monthlyBenchmarks[0]).toMatchObject({thisReturnSlcsp:'',otherReturnSlcsp:'',thisReturnCoveredIndividualSsns:['111-22-3333'],otherReturnCoveredIndividualSsns:['444-55-6666']});
 const built=buildPremiumTaxCreditInputs(data,2025,'single',completePersonalInfo);expect(built.form1095A?.[0]?.monthlyPremiums[0]?.slcsp).toBeNull();expect(built.form8962?.monthlyReconciliation?.[0]).toMatchObject({enrolleePremium:'1000',slcsp:'1200',advancePremiumTaxCredit:'0'});expect(JSON.stringify(data)).toBe(before);
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'30000',socialSecurityWages:'30000',socialSecurityWithheld:'1860',medicareWages:'30000',medicareWithheld:'435'}]};state.sectionData.credits={...emptyCreditsData,premiumTaxCredit:data};expect(validateSection(state,'credits').status).toBe('complete');const result=calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));expect([result.form8962?.ptcAllowed.toFixed(),result.form8962?.netPTC.toFixed()]).toEqual(['12000','12000']);
 for(const value of [undefined,null,false]){const unknown=structuredClone(data);unknown.policies[0]!.monthlyPremiums[0]!.slcspReportedBlank=value;expect(()=>buildPremiumTaxCreditInputs(unknown,2025,'single',completePersonalInfo)).toThrow(/SLCSP/);}
 const contradictory=structuredClone(data);contradictory.policies[0]!.monthlyPremiums[0]!.slcsp='0';expect(()=>buildPremiumTaxCreditInputs(contradictory,2025,'single',completePersonalInfo)).toThrow(/blank|contradict/i);
 const changed=structuredClone(data);changed.sharedPolicyAllocations!.policies[0]!.noAdvanceAllocation!.monthlyBenchmarks[0]!.otherReturnSlcsp='601';const updated=updateSectionData(state,'credits',{...state.sectionData.credits,premiumTaxCredit:changed});const saved=updated.sectionData.credits!.premiumTaxCredit!;expect(saved.sourceFactsConfirmed).toBeNull();expect(saved.sharedPolicyAllocations!.sourceFactsConfirmed).toBeNull();expect(saved.sharedPolicyAllocations!.policies[0]!.noAdvanceAllocation!.sourceFactsConfirmed).toBeNull();expect(()=>buildPremiumTaxCreditInputs(saved,2025,'single',completePersonalInfo)).toThrow(/confirm/i);
 const missing=structuredClone(data);missing.monthlyReconciliation=[];expect(deriveSharedPolicyMonths(missing,2025,'single',completePersonalInfo)[0]?.coverageEligible).toBeNull();
});
