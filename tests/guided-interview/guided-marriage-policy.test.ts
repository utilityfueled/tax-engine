// Spec: spec/federal/guided-marriage-policy.yaml.
import { expect, it } from 'vitest';
import { captureMarriageSources, copyMarriageBenchmarkGroups } from '@/lib/guided-marriage-policy';
import { buildPremiumTaxCreditInputs, type PremiumTaxCreditData } from '@/lib/guided-premium-tax-credit-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyCreditsData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { completeW2Entry, startCompleteInterview } from './complete-facts';
import { actualMarriagePersonal, actualMarriagePolicyData } from '../fixtures/guided-marriage-policy';
function present<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw new Error('Missing actual fixture source');return value;}
const packet=(data:PremiumTaxCreditData)=>present(data.marriageSources);
const build=(data:PremiumTaxCreditData,year=2025)=>buildPremiumTaxCreditInputs(data,year,'mfj',actualMarriagePersonal());
it('captures originals without inventing marriage facts',()=>{
  const data=actualMarriagePolicyData(),before=JSON.stringify(data),copy=captureMarriageSources(data,actualMarriagePersonal(),'mfj');
  expect(copy.primarySsn).toBe('111-22-3333');expect(copy.spouseName).toBe('Quentin Example');expect(copy.sourceTaxYear).toBe('2025');
  expect(copy.marriageDate).toBe('');expect(copy.primaryUnmarriedOnJanuary1).toBeNull();expect(copy.sourceFactsConfirmed).toBeNull();expect(copy.dependents[0]?.alternativeFamilyOwner).toBe('');expect(copy.policies[0]?.original).toEqual(data.policies[0]);expect(copy.benchmarks).toEqual([]);expect(JSON.stringify(data)).toBe(before);
  const bad=actualMarriagePolicyData();present(bad.policies[0]).recipientSsn='';expect(()=>captureMarriageSources(bad,actualMarriagePersonal(),'mfj')).toThrow(/recipient|SSN/i);
  expect(()=>captureMarriageSources(data,actualMarriagePersonal(),'single')).toThrow(/joint|married/i);
});
it('copies benchmark groups while keeping amounts unknown',()=>{
  const data=actualMarriagePolicyData(),before=JSON.stringify(data),rows=copyMarriageBenchmarkGroups(data,actualMarriagePersonal(),'mfj');
  expect(rows).toHaveLength(14);expect(rows[0]).toEqual({owner:'primary',month:'1',slcsp:'',sourceReference:'',sourceFactsConfirmed:null,coveredIndividualSsns:['111-22-3333']});
  expect(rows[7]?.coveredIndividualSsns).toEqual(['444-55-6666','777-88-1111','777-88-2222']);expect(JSON.stringify(data)).toBe(before);
  present(packet(data).dependents[0]).qualifiesForPrimary=true;present(packet(data).dependents[0]).alternativeFamilyOwner='primary';
  expect(copyMarriageBenchmarkGroups(data,actualMarriagePersonal(),'mfj')[7]?.coveredIndividualSsns).toEqual(['444-55-6666','777-88-1111','777-88-2222']);
  present(packet(data).dependents[0]).alternativeFamilyOwner='';expect(()=>copyMarriageBenchmarkGroups(data,actualMarriagePersonal(),'mfj')).toThrow(/dependent|assignment/i);
});
it('calculates actual marriage sources once through the guided return',()=>{
  const state=startCompleteInterview({filingStatus:'mfj',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});state.sectionData['personal-info']=actualMarriagePersonal();
  state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'117000',socialSecurityWages:'117000',socialSecurityWithheld:'7254',medicareWages:'117000',medicareWithheld:'1696.50'}]};state.sectionData.credits={...emptyCreditsData,premiumTaxCredit:actualMarriagePolicyData()};
  expect(validateSection(state,'credits').status).toBe('complete');const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)),before=JSON.stringify(input),result=calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe('117000');expect(result.form8962?.ptcAllowed.toFixed()).toBe('7021');expect(result.form8962?.advancePTCTotal.toFixed()).toBe('8423');expect(result.form8962?.netPTC.toFixed()).toBe('0');expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe('1402');expect(JSON.stringify(input)).toBe(before);
  expect(build(actualMarriagePolicyData(2026),2026).form8962?.marriageSources?.sourceTaxYear).toBe(2026);
  expect(()=>calculateFederalTax({...input,taxpayer:{...input.taxpayer,taxYear:2026}})).toThrow(/2026/);
});
it('rejects missing stale and contradictory marriage source facts',()=>{
  for(const mutate of [
    (x:PremiumTaxCreditData)=>{x.marriageSources=undefined},
    (x:PremiumTaxCreditData)=>{x.alternativeMarriageCalculationElected=false},
    (x:PremiumTaxCreditData)=>{packet(x).primaryUnmarriedOnJanuary1=null},
    (x:PremiumTaxCreditData)=>{packet(x).spouseUnmarriedOnJanuary1=false},
    (x:PremiumTaxCreditData)=>{present(x.policies[0]).policyNumber='equal-money replacement'},
    (x:PremiumTaxCreditData)=>{present(present(x.policies[0]).monthlyPremiums[0]).enrolleePremium='500.001'},
    (x:PremiumTaxCreditData)=>{present(packet(x).benchmarks[0]).coveredIndividualSsns=[]},
    (x:PremiumTaxCreditData)=>{present(packet(x).benchmarks[0]).slcsp=''},
    (x:PremiumTaxCreditData)=>{packet(x).marriageDate='2025-07-01'},
    (x:PremiumTaxCreditData)=>{x.selfEmployedHealthInsuranceCoordinationRequired=true},
  ]){const bad=actualMarriagePolicyData();mutate(bad);expect(()=>build(bad)).toThrow();}
  const exact=actualMarriagePolicyData();present(packet(exact).benchmarks[0]).slcsp='9,007,199,254,740,993.01';expect(build(exact).form8962?.marriageSources?.benchmarks?.[0]?.slcsp).toBe('9007199254740993.01');
  present(packet(exact).benchmarks[0]).slcsp='0';expect(build(exact).form8962?.marriageSources?.benchmarks?.[0]?.slcsp).toBe('0');
});
it('invalidates nested confirmations after actual source edits',()=>{
  const state=startCompleteInterview({filingStatus:'mfj',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});state.sectionData['personal-info']=actualMarriagePersonal();state.sectionData.credits={...emptyCreditsData,premiumTaxCredit:actualMarriagePolicyData()};
  const changed=updateSectionData(state,'personal-info',{...actualMarriagePersonal(),lastName:'Replacement'}),data=present(present(changed.sectionData.credits).premiumTaxCredit);
  expect(data.sourceFactsConfirmed).toBeNull();expect(packet(data).sourceFactsConfirmed).toBeNull();expect(packet(data).benchmarks.every(row=>row.sourceFactsConfirmed===null)).toBe(true);
  data.sourceFactsConfirmed=true;packet(data).sourceFactsConfirmed=true;for(const row of packet(data).benchmarks)row.sourceFactsConfirmed=true;
  expect(()=>buildPremiumTaxCreditInputs(data,2025,'mfj',changed.sectionData['personal-info'])).toThrow(/identit/i);
  const confirmation=updateSectionData(state,'credits',structuredClone(state.sectionData.credits));expect(packet(present(present(confirmation.sectionData.credits).premiumTaxCredit)).sourceFactsConfirmed).toBe(true);
});
