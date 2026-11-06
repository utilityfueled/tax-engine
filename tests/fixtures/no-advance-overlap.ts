import { TaxYearInputSchema } from '@/models/inputs.js';
import { sharedNoAdvanceFixture } from './shared-no-advance-policy.js';
/** Fictional complete two-family sources; no derived input allowance. */
export function noAdvanceOverlapRaw() {
 const input=sharedNoAdvanceFixture();
 input.taxpayer.filingStatus='married_filing_jointly';input.taxpayer.spouse={firstName:'Sam',lastName:'Doe',ssn:'345-67-8901',dateOfBirth:'1991-05-01'};
 input.standardDeductionFacts={...input.standardDeductionFacts,spouseCanBeClaimedAsDependent:false};
 input.form8962!.taxFamilySize=2;
 const packet=input.form8962!.sharedPolicyAllocations!,policy=packet.policies![0],first=input.form1095A[0];
 packet.spouseName='Sam Doe';packet.spouseSsn='345-67-8901';
 first.coveredIndividuals!.forEach(person=>{person.firstMonth=1;person.lastMonth=1;});
 first.monthlyPremiums=[{month:1,enrolleePremium:'600',slcsp:null,advancePremiumTaxCredit:'0'}];policy.original=structuredClone(first);
 const second=structuredClone(first);second.policyNumber='ACTUAL-SECOND-NO-ADVANCE';second.recipientName='Sam Doe';second.recipientSsn='345-67-8901';
 second.coveredIndividuals=[{name:'Sam Doe',ssn:'345-67-8901',firstMonth:1,lastMonth:1},{name:'Taylor Roe',ssn:'456-78-9012',firstMonth:1,lastMonth:1}];
 second.monthlyPremiums=[{month:1,enrolleePremium:'900',slcsp:null,advancePremiumTaxCredit:'0'}];input.form1095A.push(second);
 packet.policies!.push({...structuredClone(policy),sourceId:'form1095A:1',original:structuredClone(second),coveredFamilyAssignments:[{ssn:'345-67-8901',family:'this_return'},{ssn:'456-78-9012',family:'other_return'}]});
 for(const row of packet.policies!)row.noAdvanceAllocation!.monthlyBenchmarks=[{month:1,thisReturnSlcsp:'1200',otherReturnSlcsp:'600',thisReturnSourceReference:'Actual full Jane/Sam benchmark',otherReturnSourceReference:'Actual full Robin/Taylor benchmark',thisReturnCoveredIndividualSsns:['123-45-6789','345-67-8901'],otherReturnCoveredIndividualSsns:['234-56-7890','456-78-9012']}];
 input.form8962!.monthlyReconciliation=[{month:1,enrolleePremium:'1000',slcsp:'1200',advancePremiumTaxCredit:'0',coverageEligible:true,incomeBasedSepEnrollment:false}];
 const group=(sourceId:string,ratingArea:string,coveredIndividualSsns:string[],slcsp:string)=>({sourceId,sourceReference:`Actual Marketplace lookup ${sourceId}`,ratingArea,coveredIndividualSsns,slcsp,allCoveredPeopleShareRatingAreaConfirmed:true});
 return {...input,form8962:{...input.form8962,sharedPolicyAllocations:{...packet,noAdvanceCoverageFamilies:{sourceTaxYear:2025,sourceReference:'Actual full monthly coverage-family benchmark records',sourceFactsConfirmed:true,allBenchmarkMonthsIncluded:true,
  months:[{month:1,families:[{taxpayerName:'Jane Doe',taxpayerSsn:'123-45-6789',sourceReference:'Actual Jane/Sam monthly coverage record',allCoverageFamilyMembersIncludedConfirmed:true,allCoveragePoliciesIncludedConfirmed:true,groups:[group('own-wa','WA-area-1',['123-45-6789','345-67-8901'],'1200')]},
   {taxpayerName:policy.otherTaxpayerName!,taxpayerSsn:policy.otherTaxpayerSsn!,sourceReference:'Actual Robin/Taylor monthly coverage record',allCoverageFamilyMembersIncludedConfirmed:true,allCoveragePoliciesIncludedConfirmed:true,groups:[group('other-wa','WA-area-1',['234-56-7890','456-78-9012'],'600')]}]}]}}}};
}
export function noAdvanceOverlapFixture(){return TaxYearInputSchema.parse(noAdvanceOverlapRaw());}
