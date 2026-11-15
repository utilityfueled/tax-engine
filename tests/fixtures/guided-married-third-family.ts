import type {PremiumTaxCreditData,MarketplacePolicyData} from '@/lib/guided-premium-tax-credit-facts';
import {marriedThirdFamilyFixture} from './married-third-family-policy';
import {actualSharedPolicyData} from './guided-shared-policy';
import {completePersonalInfo,completeW2Entry,startCompleteInterview} from '../guided-interview/complete-facts';
function required<T>(value:T|null|undefined):T{if(value==null)throw Error('Missing explicit fictional original');return value;}
function editable(value:unknown,key=''):unknown{
 if(typeof value==='number'&&['sourceTaxYear','taxYear','month','firstMonth','lastMonth'].includes(key))return String(value);
 if(Array.isArray(value))return value.map(v=>editable(v));
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,editable(v,k)]));
 return value;
}
export function guidedThirdFamilyFixture(oneMonth=false,year=2025){
 const canonical=marriedThirdFamilyFixture(year),proof=canonical.form8962.sharedPolicyAllocations.marriedThirdFamily;
 if(oneMonth){for(const policy of [canonical.form1095A[0],canonical.form8962.sharedPolicyAllocations.policies[0]?.original]){const actual=required(policy);required(actual.coveredIndividuals).forEach(person=>{person.firstMonth=1;person.lastMonth=1;});actual.monthlyPremiums=[required(actual.monthlyPremiums[0])];}proof.monthlySources=[required(proof.monthlySources[0])];canonical.form8962.monthlyReconciliation=[required(canonical.form8962.monthlyReconciliation[0])];}
 const personal=structuredClone(completePersonalInfo);Object.assign(personal,canonical.taxpayer.primary);Object.assign(required(personal.spouse),required(canonical.taxpayer.spouse));
 const data:PremiumTaxCreditData=actualSharedPolicyData();data.sourceTaxYear=String(year);data.marriedFilingSeparatelyExceptionConfirmed=false;
 data.policies=editable(canonical.form1095A) as MarketplacePolicyData[];
 data.monthlyReconciliation=data.policies[0]?.monthlyPremiums.map(row=>({...row,enrolleePremium:'0',slcsp:'0',advancePremiumTaxCredit:'34',coverageEligible:true,incomeBasedSepEnrollment:false}))??[];
 const packet=required(data.sharedPolicyAllocations),original=required(data.policies[0]),policy=required(packet.policies[0]);packet.sourceTaxYear=String(year);packet.primaryName='Jane Doe';packet.primarySsn='123-45-6789';
 Object.assign(policy,{original:structuredClone(original),otherTaxpayerName:'Robin Other',otherTaxpayerSsn:'234-56-7890',situation:'married_separate',twoTaxFamiliesConfirmed:false,allCoveredPeopleAssignedConfirmed:true,noCurrentYearMarriageOrDivorceConfirmed:null,originalSlcspCorrectConfirmed:null,agreementConfirmed:null,agreementReference:'',coveredFamilyAssignments:[],monthlyAllocations:[],separateReturn:{sourceReference:'Fictional year-end married separate return source',marriedAtYearEndConfirmed:true,onlySpouseTaxFamiliesConfirmed:false,livingApartExceptionConfirmed:false,ownCoverageFamilySlcsp:[]}});
 // First genuine regression uses complete editable originals at the existing guide boundary.
 Object.assign(packet,{marriedThirdFamily:editable(proof)});
 return{canonical,personal,data};
}

import {emptyCreditsData} from '@/lib/guided-interview-flow';
import {confirmMarriedThirdFamilySources} from '@/lib/guided-married-third-family';
export function guidedThirdFamilyState(oneMonth=true,year=2025){
 const {personal,data}=guidedThirdFamilyFixture(oneMonth,year),state=startCompleteInterview({filingStatus:'mfs',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});state.taxYear=year;state.sectionData['personal-info']=personal;
 state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'30000',socialSecurityWages:'30000',socialSecurityWithheld:'1860',medicareWages:'30000',medicareWithheld:'435',federalWithheld:'5000'}]};
 required(data.sharedPolicyAllocations).marriedThirdFamily=confirmMarriedThirdFamilySources(data,year,'mfs',personal);state.sectionData.credits={...structuredClone(emptyCreditsData),premiumTaxCredit:data};return state;
}
export function worksheetEVisibleEntries():Array<readonly[string,string]>{
 const proof=required(guidedThirdFamilyFixture(true).data.sharedPolicyAllocations?.marriedThirdFamily),entries:Array<readonly[string,string]>=[];
 entries.push(['Worksheet E: Original source year',required(proof.sourceTaxYear)],['Worksheet E: Original worksheet reference',required(proof.sourceReference)],['Worksheet E: No other allocations are required','true'],['Worksheet E: All agreements and covered months are included','true']);
 required(proof.families).forEach((row,index)=>{const label=`Worksheet E family ${index+1}`;for(const[field,title]of[['role','Role'],['filingStatus','Actual filing status'],['sourceTaxYear','Source year'],['sourceReference','Source reference'],['taxpayerName','Taxpayer name'],['taxpayerSsn','Taxpayer SSN']]as const)entries.push([`${label}: ${title}`,required(row[field])]);entries.push([`${label}: All tax family members included`,'true']);required(row.dependents).forEach((person,i)=>entries.push([`${label}: Dependent ${i+1} name`,required(person.name)],[`${label}: Dependent ${i+1} SSN`,required(person.ssn)]));});
 required(proof.coverageFamilyAssignments).forEach((row,index)=>entries.push([`Worksheet E covered person ${index+1}: SSN`,required(row.ssn)],[`Worksheet E covered person ${index+1}: Actual spouse coverage family`,required(row.family)]));
 required(proof.monthlySources).forEach((row,index)=>{const label=`Worksheet E month ${index+1}`;entries.push([`${label}: Actual month (1–12)`,required(row.month)]);for(const owner of['primary','spouse']as const)entries.push([`${label}: ${owner} benchmark amount`,required(row[`${owner}Benchmark`])],[`${label}: ${owner} benchmark source reference`,required(row[`${owner}BenchmarkSourceReference`])],[`${label}: ${owner} agreement fraction`,required(row[`${owner}AgreementFraction`])],[`${label}: ${owner} agreement source reference`,required(row[`${owner}AgreementSourceReference`])],[`${label}: ${owner} actual agreement confirmed`,'true']);});return entries;
}
