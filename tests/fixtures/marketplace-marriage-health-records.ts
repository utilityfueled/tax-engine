import type { PersonalInfoData } from '@/lib/guided-interview-flow';
import type { HealthInsuranceData } from '@/lib/guided-health-insurance-facts';
import type { PremiumTaxCreditData } from '@/lib/guided-premium-tax-credit-facts';

/** Explicit fictional original records; plain data also usable by the browser. */
export function marketplaceMarriageHealthRecords() {
  const months = Array.from({length:12},(_,index)=>String(index+1));
  const personal: PersonalInfoData = {
    firstName:'Avery',lastName:'Example',ssn:'111-22-3333',dateOfBirth:'1990-01-15',usResidencyMonths:'12',stateResidency:'full-year',
    addressLine1:'42 Example Road',addressLine2:'',city:'Austin',state:'TX',zip:'78701',dependentCount:'0',dependents:[],
    employmentValidSsnIssuedByDueDate:true,tinIssuedByDueDate:true,livedWithSpouseAtAnyTimeDuringYear:true,
    standardDeductionFacts:{primaryBlind:false,spouseBlind:false,primaryCanBeClaimedAsDependent:false,spouseCanBeClaimedAsDependent:false,primaryDeceased:false,spouseDeceased:false,dualStatusAlien:false,nonresidentAlien:false,shortTaxYear:false,spouseItemizes:false,claimSpouseAdditionalDeduction:false},
    spouse:{firstName:'Blair',lastName:'Example',ssn:'444-55-6666',dateOfBirth:'1990-01-15',usResidencyMonths:'12',employmentValidSsnIssuedByDueDate:true,tinIssuedByDueDate:true},
  };
  const policy = {taxYear:'2025',marketplace:'Fictional actual Marketplace',policyNumber:'MARRIAGE-HEALTH-ORIGINAL',recipientName:'Avery Example',recipientSsn:personal.ssn,
    coveredIndividuals:[{name:'Avery Example',ssn:personal.ssn,firstMonth:'1',lastMonth:'12'}],
    monthlyPremiums:months.map(month=>({month,enrolleePremium:'1000',slcsp:'800',advancePremiumTaxCredit:'700'}))};
  const coverage: PremiumTaxCreditData = {
    sourceTaxYear:'2025',sourceReference:'Actual original marriage Marketplace worksheet',sourceFactsConfirmed:true,allPoliciesIncluded:true,
    taxFamilySize:'2',fplRegion:'contiguous',requiredFilingDependentsModifiedAGI:'0',householdFactsConfirmed:true,canBeClaimedAsDependent:false,
    belowPovertyException:'none',coverageFactsConfirmed:true,allocationRequired:false,alternativeMarriageCalculationElected:true,
    selfEmployedHealthInsuranceCoordinationRequired:true,lawfulPresenceReconciliationRequired:false,qsehraAffected:false,
    policies:[policy],monthlyReconciliation:policy.monthlyPremiums.map(row=>({...row,coverageEligible:true,incomeBasedSepEnrollment:false})),
    marriageSources:{sourceTaxYear:'2025',sourceReference:'Actual marriage and original policy records',sourceFactsConfirmed:true,allPoliciesIncluded:true,
      primaryName:'Avery Example',primarySsn:personal.ssn,spouseName:'Blair Example',spouseSsn:'444-55-6666',marriageDate:'2025-07-15',
      primaryUnmarriedOnJanuary1:true,spouseUnmarriedOnJanuary1:true,marriedToEachOtherOnDecember31:true,allDependentAssignmentsIncluded:true,dependents:[],
      policies:[{sourceId:'form1095A:0',sourceReference:'Actual original Form1095A',original:structuredClone(policy),fullMonthCoverageConfirmed:true,allCoveredIndividualsEligibleForPtcConfirmed:true}],
      benchmarks:months.slice(0,7).map(month=>({owner:'primary',month,slcsp:'800',sourceReference:'Actual pre-marriage single-person benchmark',sourceFactsConfirmed:true,coveredIndividualSsns:[personal.ssn]}))},
  };
  const health: HealthInsuranceData = {
    sourceTaxYear:'2025',sourceReference:'Actual independent business and payment ledger',sourceFactsConfirmed:true,allPlansIncluded:true,
    persons:[{personId:'primary',name:'Avery Example',householdRole:'primary',attainedAgeAtYearEnd:'35'}],longTermCareAllocations:[],
    plans:[{planId:'medical',policyReference:'Actual health policy',accountHolder:'primary',businessSourceId:'scheduleC',businessKind:'self_employed',kind:'medical',policyHolder:'individual',
      establishedUnderBusiness:true,insuranceQualificationConfirmed:true,premiumsIncludedInOwnerIncome:null,moreThanTwoPercentShareholder:null,
      marketplaceCoverage:true,premiumTaxCreditInvolved:true,marketplacePolicySourceIds:['form1095A:0'],allCoveredPersonsInCoverageFamilyConfirmed:true,clergySpecialRules:false,
      coveredPersons:[{personId:'primary',relationshipToOwner:'self',dependencyEligibilityConfirmed:null}],
      months:months.map(month=>({month,employerSubsidizedPlanEligible:false})),
      payments:months.map(month=>({sourceId:`original-payment-${month}`,datePaid:`2025-${month.padStart(2,'0')}-01`,coverageTaxYear:'2025',coverageMonth:month,
        grossPremium:'1000',ownerOrBusinessPaid:'300',otherPersonPaid:'0',advancePremiumTaxCredit:'700',
        personAmounts:[{personId:'primary',payer:'owner_after_tax',amountPaid:'300',advancePremiumTaxCredit:'700',excludedPublicSafetyOfficerAmount:'0',publicSafetyOfficerAccountHolder:'',otherTaxFreeFunding:'0'}]}))}],
  };
  return {personal,coverage,health};
}
