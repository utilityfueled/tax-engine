import { TaxYearInputSchema } from '@/models/inputs.js';
import { marketplaceMarriageHealthInput } from './marketplace-marriage-health.js';
import { sharedMarriageHealthInput } from './marketplace-shared-marriage-health.js';

/** Actual fictional month-specific sources; no production defaults or calculated input. */
export function marriageCoverageFamilyInput(shared = false, partialFirstMonth = false) {
  const input = shared ? sharedMarriageHealthInput() : marketplaceMarriageHealthInput();
  const plan=input.form7206!.plans![0], original=input.form1095A[0];
  const ineligible=new Set(partialFirstMonth ? [1,2,12] : [2,12]);
  plan.allCoveredPersonsInCoverageFamilyConfirmed=false;
  if(plan.sharedMarketplaceSources)plan.sharedMarketplaceSources.allThisReturnPersonsInCoverageFamilyConfirmed=false;
  for(const row of original.monthlyPremiums) {
    row.advancePremiumTaxCredit=ineligible.has(row.month)?'0':shared?'1400':'700';
    if(shared&&ineligible.has(row.month))row.slcsp='0';
  }
  if(input.form8962!.sharedPolicyAllocations)input.form8962!.sharedPolicyAllocations.policies![0].original=structuredClone(original);
  const marriage=input.form8962!.marriageSources!;
  marriage.policies![0].original=structuredClone(original);
  marriage.policies![0].allCoveredIndividualsEligibleForPtcConfirmed=false;
  marriage.policies![0].fullMonthCoverageConfirmed=!partialFirstMonth;
  marriage.benchmarks=marriage.benchmarks!.filter(row=>!partialFirstMonth||row.month!==1).map(row=>({...row,
    slcsp:ineligible.has(row.month!)?'0':'800',coveredIndividualSsns:ineligible.has(row.month!)?[]:[input.taxpayer.primary.ssn]}));
  input.form8962!.monthlyReconciliation=input.form8962!.monthlyReconciliation!.map(row=>({...row,
    slcsp:ineligible.has(row.month)?'0':'800',advancePremiumTaxCredit:ineligible.has(row.month)?'0':'700',coverageEligible:!ineligible.has(row.month)}));
  for(const payment of plan.payments!) {
    const excluded=ineligible.has(payment.coverageMonth!);
    payment.ownerOrBusinessPaid=excluded?'1000':'300';
    payment.otherPersonPaid=shared?(excluded?'1000':'300'):'0';
    payment.advancePremiumTaxCredit=excluded?'0':shared?'1400':'700';
    for(const person of payment.personAmounts!) {
      person.amountPaid=person.personId==='primary'?(excluded?'1000':'300'):'0';
      person.advancePremiumTaxCredit=excluded?'0':'700';
    }
  }
  plan.coverageFamilySources={sourceTaxYear:2025,sourceReference:'Actual original person and monthly eligibility records',sourceFactsConfirmed:true,allPolicySourcesIncluded:true,
    policies:[{sourceId:'form1095A:0',original:structuredClone(original)}],
    persons:[{personId:'primary',coveredIndividualSsn:input.taxpayer.primary.ssn},...(shared?[{personId:'outside',coveredIndividualSsn:'234-56-7890'}]:[])],
    months:original.monthlyPremiums.map(row=>({month:row.month,sourceReference:`Actual eligibility month ${row.month}`,allCoveredPersonsIncludedConfirmed:true,
      personFacts:[{personId:'primary',sourceReference:`Actual primary enrollment and MEC month ${row.month}`,fullCoverageMonthConfirmed:!(partialFirstMonth&&row.month===1),otherMecEligible:row.month===2||row.month===12}],
      coverageFamilySlcsp:ineligible.has(row.month)?'0':'800',nonCoverageFamilySlcsp:ineligible.has(row.month)?'800':'0',
      coverageFamilySourceReference:`Actual complete coverage benchmark ${row.month}`,nonCoverageFamilySourceReference:`Actual noncoverage benchmark ${row.month}`,
      coverageFamilyMemberSsns:ineligible.has(row.month)?[]:[input.taxpayer.primary.ssn],nonCoverageFamilyMemberSsns:ineligible.has(row.month)?[input.taxpayer.primary.ssn]:[],
      allCoverageFamilyMembersIncludedConfirmed:true,allNonCoverageFamilyMembersIncludedConfirmed:true}))};
  return TaxYearInputSchema.parse(input);
}

/** Actual own child qualifies before marriage but has other government MEC. */
export function marriageMixedCoveragePeopleInput() {
  const input=marriageCoverageFamilyInput(), childSsn='222-33-4444';
  input.scheduleC!.grossReceipts='60000';
  input.taxpayer.dependents=[{firstName:'Casey',lastName:'Example',ssn:childSsn,relationship:'child',dateOfBirth:'2015-03-12',monthsLivedWithYou:12,qualifiesForCTC:true,ctcSsnEligible:true,qualifiesForODC:false,qualifiesForEIC:false}];
  const original=input.form1095A[0], marriage=input.form8962!.marriageSources!, health=input.form7206!, plan=health.plans![0];
  original.coveredIndividuals!.push({name:'Casey Example',ssn:childSsn,firstMonth:1,lastMonth:12});
  for(const row of original.monthlyPremiums)Object.assign(row,{enrolleePremium:'1250',slcsp:'1000',advancePremiumTaxCredit:'1000'});
  input.form8962!.taxFamilySize=3;
  input.form8962!.monthlyReconciliation=original.monthlyPremiums.map(row=>({...row,coverageEligible:true,incomeBasedSepEnrollment:false}));
  marriage.dependents=[{name:'Casey Example',ssn:childSsn,alternativeFamilyOwner:'primary',qualifiesForPrimary:true,qualifiesForSpouse:false,sourceReference:'Actual separate primary-child dependency records before marriage'}];
  marriage.policies![0].original=structuredClone(original);
  marriage.benchmarks=original.monthlyPremiums.filter(row=>row.month<=7).map(row=>({owner:'primary',month:row.month,slcsp:'1000',sourceReference:'Actual primary-only eligible premarriage benchmark',sourceFactsConfirmed:true,coveredIndividualSsns:[input.taxpayer.primary.ssn]}));
  health.persons!.push({personId:'child',name:'Casey Example',householdRole:'other',attainedAgeAtYearEnd:10});
  plan.coveredPersons!.push({personId:'child',relationshipToOwner:'dependent',dependencyEligibilityConfirmed:true});
  for(const payment of plan.payments!)Object.assign(payment,{grossPremium:'1250',ownerOrBusinessPaid:'250',advancePremiumTaxCredit:'1000',personAmounts:[
    {personId:'primary',payer:'owner_after_tax',amountPaid:'0',advancePremiumTaxCredit:'1000',excludedPublicSafetyOfficerAmount:'0',otherTaxFreeFunding:'0'},
    {personId:'child',payer:'owner_after_tax',amountPaid:'250',advancePremiumTaxCredit:'0',excludedPublicSafetyOfficerAmount:'0',otherTaxFreeFunding:'0'},
  ]});
  const family=plan.coverageFamilySources!;
  family.policies![0].original=structuredClone(original);
  family.persons!.push({personId:'child',coveredIndividualSsn:childSsn});
  family.months=original.monthlyPremiums.map(row=>({month:row.month,sourceReference:`Actual primary and child coverage month ${row.month}`,allCoveredPersonsIncludedConfirmed:true,
    personFacts:[{personId:'primary',sourceReference:'Actual full QHP primary eligibility',fullCoverageMonthConfirmed:true,otherMecEligible:false},
      {personId:'child',sourceReference:'Actual child government MEC eligibility',fullCoverageMonthConfirmed:true,otherMecEligible:true}],
    coverageFamilySlcsp:'1000',nonCoverageFamilySlcsp:'500',coverageFamilySourceReference:'Actual complete primary benchmark',nonCoverageFamilySourceReference:'Actual complete child benchmark',
    coverageFamilyMemberSsns:[input.taxpayer.primary.ssn],nonCoverageFamilyMemberSsns:[childSsn],allCoverageFamilyMembersIncludedConfirmed:true,allNonCoverageFamilyMembersIncludedConfirmed:true}));
  return TaxYearInputSchema.parse(input);
}
