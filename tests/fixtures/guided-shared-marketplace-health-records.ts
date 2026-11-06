import type { HealthInsuranceData } from '@/lib/guided-health-insurance-facts';
import { actualSharedPolicyData } from './guided-shared-policy';
/** Explicit fictional records shared by unit and production-browser checks. */
export function guidedSharedMarketplaceHealthRecords() {
  const coverage = actualSharedPolicyData();
  coverage.selfEmployedHealthInsuranceCoordinationRequired = true;
  coverage.policies[0]!.monthlyPremiums.forEach(row => { row.slcsp = '1000'; row.advancePremiumTaxCredit = '600'; });
  coverage.sharedPolicyAllocations!.policies[0]!.original = structuredClone(coverage.policies[0]!);
  coverage.monthlyReconciliation.forEach(row => { row.slcsp = '500'; row.advancePremiumTaxCredit = '300'; });
  const health: HealthInsuranceData = {
    sourceTaxYear:'2025',sourceReference:'Actual complete policy and payment records',sourceFactsConfirmed:true,allPlansIncluded:true,
    persons:[{personId:'primary',name:'Jordan Example',householdRole:'primary',attainedAgeAtYearEnd:'35'},{personId:'other',name:'Robin Other',householdRole:'other',attainedAgeAtYearEnd:'40'}],
    plans:[{planId:'actual-plan',policyReference:'policy-123',accountHolder:'primary',businessSourceId:'scheduleC',businessKind:'self_employed',kind:'medical',policyHolder:'individual',
      establishedUnderBusiness:true,insuranceQualificationConfirmed:true,premiumsIncludedInOwnerIncome:null,moreThanTwoPercentShareholder:null,marketplaceCoverage:true,premiumTaxCreditInvolved:true,clergySpecialRules:false,
      marketplacePolicySourceIds:['form1095A:0'],allCoveredPersonsInCoverageFamilyConfirmed:false,
      coveredPersons:[{personId:'primary',relationshipToOwner:'self',dependencyEligibilityConfirmed:null},{personId:'other',relationshipToOwner:'other',dependencyEligibilityConfirmed:null}],
      sharedMarketplaceSources:{sourceTaxYear:'2025',sourceReference:'Actual original person and payment reconciliation',sourceFactsConfirmed:true,allCoveredPersonsLinkedConfirmed:true,allThisReturnPersonsInCoverageFamilyConfirmed:true,
        persons:[{personId:'primary',coveredIndividualSsn:'111-22-3333'},{personId:'other',coveredIndividualSsn:'444-55-6666'}]},
      months:Array.from({length:12},(_,i)=>({month:String(i+1),employerSubsidizedPlanEligible:false})),
      payments:Array.from({length:12},(_,i)=>({sourceId:`premium-${i+1}`,datePaid:`2025-${String(i+1).padStart(2,'0')}-15`,coverageTaxYear:'2025',coverageMonth:String(i+1),grossPremium:'1000',ownerOrBusinessPaid:'200',otherPersonPaid:'200',advancePremiumTaxCredit:'600',
        personAmounts:[{personId:'primary',payer:'owner_after_tax',amountPaid:'200',advancePremiumTaxCredit:'300',excludedPublicSafetyOfficerAmount:'0',publicSafetyOfficerAccountHolder:'',otherTaxFreeFunding:'0'},
          {personId:'other',payer:'owner_after_tax',amountPaid:'0',advancePremiumTaxCredit:'300',excludedPublicSafetyOfficerAmount:'0',publicSafetyOfficerAccountHolder:'',otherTaxFreeFunding:'0'}]})),
    }],longTermCareAllocations:[],
  };
  return {health,coverage};
}
