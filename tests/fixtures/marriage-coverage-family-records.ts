import { marketplaceMarriageHealthRecords } from './marketplace-marriage-health-records';
import { sharedMarriageHealthRecords } from './marketplace-shared-marriage-health-records';

/** Actual fictional plain records, shared by guide and real browser controls. */
export function marriageCoverageFamilyRecords(shared=false,partialFirstMonth=true) {
  const records=shared?sharedMarriageHealthRecords():marketplaceMarriageHealthRecords();
  const {coverage,health,personal}=records,plan=health.plans[0],original=coverage.policies[0];
  const ineligible=new Set(partialFirstMonth?['1','2','12']:['2','12']);
  plan.allCoveredPersonsInCoverageFamilyConfirmed=false;
  if(plan.sharedMarketplaceSources)plan.sharedMarketplaceSources.allThisReturnPersonsInCoverageFamilyConfirmed=false;
  for(const row of original.monthlyPremiums){row.advancePremiumTaxCredit=ineligible.has(row.month)?'0':shared?'1400':'700';if(shared&&ineligible.has(row.month))row.slcsp='0';}
  if(coverage.sharedPolicyAllocations)coverage.sharedPolicyAllocations.policies[0].original=structuredClone(original);
  const marriage=coverage.marriageSources!;
  marriage.policies[0].original=structuredClone(original);marriage.policies[0].allCoveredIndividualsEligibleForPtcConfirmed=false;marriage.policies[0].fullMonthCoverageConfirmed=!partialFirstMonth;
  marriage.benchmarks=marriage.benchmarks.filter(row=>!partialFirstMonth||row.month!=='1').map(row=>({...row,slcsp:ineligible.has(row.month)?'0':'800',coveredIndividualSsns:ineligible.has(row.month)?[]:[personal.ssn]}));
  coverage.monthlyReconciliation=coverage.monthlyReconciliation.map(row=>({...row,slcsp:ineligible.has(row.month)?'0':'800',advancePremiumTaxCredit:ineligible.has(row.month)?'0':'700',coverageEligible:!ineligible.has(row.month)}));
  for(const payment of plan.payments){const excluded=ineligible.has(payment.coverageMonth);payment.ownerOrBusinessPaid=excluded?'1000':'300';payment.otherPersonPaid=shared?(excluded?'1000':'300'):'0';payment.advancePremiumTaxCredit=excluded?'0':shared?'1400':'700';
    for(const person of payment.personAmounts){person.amountPaid=person.personId==='primary'?(excluded?'1000':'300'):'0';person.advancePremiumTaxCredit=excluded?'0':'700';}}
  plan.coverageFamilySources={sourceTaxYear:'2025',sourceReference:'Actual original person and monthly eligibility records',sourceFactsConfirmed:true,allPolicySourcesIncluded:true,
    policies:[{sourceId:'form1095A:0',original:structuredClone(original)}],persons:[{personId:'primary',coveredIndividualSsn:personal.ssn},...(shared?[{personId:'outside',coveredIndividualSsn:'234-56-7890'}]:[])],
    months:original.monthlyPremiums.map(row=>({month:row.month,sourceReference:`Actual eligibility month ${row.month}`,allCoveredPersonsIncludedConfirmed:true,
      personFacts:[{personId:'primary',sourceReference:`Actual primary enrollment and MEC month ${row.month}`,fullCoverageMonthConfirmed:!(partialFirstMonth&&row.month==='1'),otherMecEligible:row.month==='2'||row.month==='12'}],
      coverageFamilySlcsp:ineligible.has(row.month)?'0':'800',nonCoverageFamilySlcsp:ineligible.has(row.month)?'800':'0',coverageFamilySourceReference:`Actual complete coverage benchmark ${row.month}`,nonCoverageFamilySourceReference:`Actual noncoverage benchmark ${row.month}`,
      coverageFamilyMemberSsns:ineligible.has(row.month)?[]:[personal.ssn],nonCoverageFamilyMemberSsns:ineligible.has(row.month)?[personal.ssn]:[],allCoverageFamilyMembersIncludedConfirmed:true,allNonCoverageFamilyMembersIncludedConfirmed:true}))};
  return records;
}
