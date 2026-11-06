import type { PremiumTaxCreditData } from '@/lib/guided-premium-tax-credit-facts';
import { actualSharedPolicyData } from './guided-shared-policy';
/** Synthetic original source blank and independently supplied family benchmarks. */
export function actualNoAdvanceAllocationData(): PremiumTaxCreditData {
 const data=actualSharedPolicyData(),policy=data.sharedPolicyAllocations!.policies[0]!;
 data.policies[0]!.monthlyPremiums.forEach(row=>Object.assign(row,{enrolleePremium:'1500',slcsp:'',slcspReportedBlank:true,advancePremiumTaxCredit:'0'}));
 policy.original=structuredClone(data.policies[0]);policy.situation='no_advance_credit';policy.agreementConfirmed=null;policy.agreementReference='';policy.monthlyAllocations.forEach(row=>{row.fraction='';});policy.originalSlcspCorrectConfirmed=null;
 policy.noAdvanceAllocation={sourceTaxYear:'2025',sourceReference:'Synthetic separate benchmark worksheet',sourceFactsConfirmed:true,allCoveredPeopleInCoverageFamiliesConfirmed:true,
  monthlyBenchmarks:data.policies[0]!.monthlyPremiums.map(row=>({month:row.month,thisReturnSlcsp:'1200',otherReturnSlcsp:'600',thisReturnSourceReference:'Synthetic own benchmark',otherReturnSourceReference:'Synthetic other benchmark',thisReturnCoveredIndividualSsns:['111-22-3333'],otherReturnCoveredIndividualSsns:['444-55-6666']}))};
 data.monthlyReconciliation.forEach(row=>Object.assign(row,{enrolleePremium:'1000',slcsp:'1200',advancePremiumTaxCredit:'0'}));return data;
}
