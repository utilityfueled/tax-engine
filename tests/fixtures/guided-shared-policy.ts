import type { PremiumTaxCreditData } from '@/lib/guided-premium-tax-credit-facts';
/** Synthetic actual records and independently supplied monthly agreement. */
export function actualSharedPolicyData(): PremiumTaxCreditData {
 const original = { taxYear:'2025',marketplace:'Actual Marketplace',policyNumber:'policy-123',recipientName:'Jordan Example',recipientSsn:'111-22-3333',
  coveredIndividuals:[{name:'Jordan Example',ssn:'111-22-3333',firstMonth:'1',lastMonth:'12'},{name:'Robin Other',ssn:'444-55-6666',firstMonth:'1',lastMonth:'12'}],
  monthlyPremiums:Array.from({length:12},(_,i)=>({month:String(i+1),enrolleePremium:'1000',slcsp:'900',advancePremiumTaxCredit:'500'})) };
 return { sourceTaxYear:'2025',sourceReference:'Synthetic actual coverage worksheet',sourceFactsConfirmed:true,allPoliciesIncluded:true,
  taxFamilySize:'1',fplRegion:'contiguous',requiredFilingDependentsModifiedAGI:'0',householdFactsConfirmed:true,canBeClaimedAsDependent:false,
  belowPovertyException:'none',coverageFactsConfirmed:true,allocationRequired:true,alternativeMarriageCalculationElected:false,
  selfEmployedHealthInsuranceCoordinationRequired:false,qsehraAffected:false,lawfulPresenceReconciliationRequired:false,policies:[original],
  monthlyReconciliation:Array.from({length:12},(_,i)=>({month:String(i+1),enrolleePremium:'500',slcsp:'450',advancePremiumTaxCredit:'250',coverageEligible:true,incomeBasedSepEnrollment:false})),
  sharedPolicyAllocations:{sourceTaxYear:'2025',sourceReference:'Synthetic actual agreement worksheet',sourceFactsConfirmed:true,allSharedPoliciesIncluded:true,
   primaryName:'Jordan Example',primarySsn:'111-22-3333',policies:[{sourceId:'form1095A:0',original:structuredClone(original),otherTaxpayerName:'Robin Other',otherTaxpayerSsn:'444-55-6666',situation:'other_two_tax_families',
    noCurrentYearMarriageOrDivorceConfirmed:true,twoTaxFamiliesConfirmed:true,allCoveredPeopleAssignedConfirmed:true,originalSlcspCorrectConfirmed:true,agreementConfirmed:true,agreementReference:'Synthetic signed annual agreement',
    coveredFamilyAssignments:[{ssn:'111-22-3333',family:'this_return'},{ssn:'444-55-6666',family:'other_return'}],monthlyAllocations:Array.from({length:12},(_,i)=>({month:String(i+1),fraction:'0.50'}))}]}
 };
}
