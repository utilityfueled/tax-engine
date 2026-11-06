import {actualNoAdvanceAllocationData} from './guided-no-advance-allocation';
import type {PremiumTaxCreditData} from '@/lib/guided-premium-tax-credit-facts';
/** Fictional originals and independent monthly Marketplace records. */
export function actualNoAdvanceOverlapData():PremiumTaxCreditData {
 const data=actualNoAdvanceAllocationData(),packet=data.sharedPolicyAllocations!;
 const first=data.policies[0];first.coveredIndividuals!.forEach(person=>{person.lastMonth='1';});first.monthlyPremiums=first.monthlyPremiums.slice(0,1);first.monthlyPremiums[0].enrolleePremium='600';
 packet.policies[0].original=structuredClone(first);packet.policies[0].monthlyAllocations=[];packet.policies[0].noAdvanceAllocation!.monthlyBenchmarks=packet.policies[0].noAdvanceAllocation!.monthlyBenchmarks.slice(0,1);
 const second=structuredClone(first);second.policyNumber='actual-second-overlap';second.monthlyPremiums[0].enrolleePremium='900';data.policies.push(second);
 packet.policies.push({...structuredClone(packet.policies[0]),sourceId:'form1095A:1',original:structuredClone(second)});
 packet.noAdvanceCoverageFamilies={sourceTaxYear:'2025',sourceReference:'Actual full family benchmark record',sourceFactsConfirmed:true,allBenchmarkMonthsIncluded:true,
 months:[{month:'1',families:[{taxpayerName:'Jordan Example',taxpayerSsn:'111-22-3333',sourceReference:'Actual first family coverage',coveredIndividuals:[{name:'Jordan Example',ssn:'111-22-3333'}],allCoverageFamilyMembersIncludedConfirmed:true,allCoveragePoliciesIncludedConfirmed:true,
 groups:[{sourceId:'own-area',sourceReference:'Actual first family Marketplace benchmark',ratingArea:'WA-one',coveredIndividualSsns:['111-22-3333'],slcsp:'1200',allCoveredPeopleShareRatingAreaConfirmed:true}]},
 {taxpayerName:'Robin Other',taxpayerSsn:'444-55-6666',sourceReference:'Actual second family coverage',coveredIndividuals:[{name:'Robin Other',ssn:'444-55-6666'}],allCoverageFamilyMembersIncludedConfirmed:true,allCoveragePoliciesIncludedConfirmed:true,
 groups:[{sourceId:'other-area',sourceReference:'Actual second family Marketplace benchmark',ratingArea:'WA-one',coveredIndividualSsns:['444-55-6666'],slcsp:'600',allCoveredPeopleShareRatingAreaConfirmed:true}]}]}]};
 data.monthlyReconciliation=[{month:'1',enrolleePremium:'1000',slcsp:'1200',advancePremiumTaxCredit:'0',coverageEligible:true,incomeBasedSepEnrollment:false}];return data;
}
