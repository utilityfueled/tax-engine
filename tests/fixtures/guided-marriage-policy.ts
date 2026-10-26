import type { PersonalInfoData } from '@/lib/guided-interview-flow';
import type { PremiumTaxCreditData } from '@/lib/guided-premium-tax-credit-facts';

/** Explicit fictional original records. No production defaults or calculated tax. */
export function actualMarriagePersonal(): PersonalInfoData {
  return {
    firstName:'Paulette',lastName:'Example',ssn:'111-22-3333',dateOfBirth:'1990-02-15',usResidencyMonths:'12',stateResidency:'full-year',
    addressLine1:'42 Example Road',addressLine2:'',city:'Austin',state:'TX',zip:'78701',dependentCount:'2',
    employmentValidSsnIssuedByDueDate:true,tinIssuedByDueDate:true,livedWithSpouseAtAnyTimeDuringYear:true,
    standardDeductionFacts:{primaryBlind:false,spouseBlind:false,primaryCanBeClaimedAsDependent:false,spouseCanBeClaimedAsDependent:false,primaryDeceased:false,spouseDeceased:false,dualStatusAlien:false,nonresidentAlien:false,shortTaxYear:false,spouseItemizes:false,claimSpouseAdditionalDeduction:false},
    childTaxCredit:{bonaFidePuertoRicoResident:false,puertoRicoExcludedIncome:'0',form4563ExcludedIncome:'0'},
    spouse:{firstName:'Quentin',lastName:'Example',ssn:'444-55-6666',dateOfBirth:'1992-09-10',usResidencyMonths:'12',employmentValidSsnIssuedByDueDate:true,tinIssuedByDueDate:true},
    dependents:[
      {firstName:'Child',lastName:'One',ssn:'777-88-1111',dateOfBirth:'2014-04-01',relationship:'child',monthsLivedWithYou:'12',qualifiesForCTC:true,qualifiesForODC:false,qualifiesForEIC:false,ctcSsnEligible:true,odcTinEligible:true},
      {firstName:'Child',lastName:'Two',ssn:'777-88-2222',dateOfBirth:'2016-06-01',relationship:'child',monthsLivedWithYou:'12',qualifiesForCTC:true,qualifiesForODC:false,qualifiesForEIC:false,ctcSsnEligible:true,odcTinEligible:true},
    ],
  };
}
export function actualMarriagePolicyData(year=2025): PremiumTaxCreditData {
  const people=[
    {name:'Paulette Example',ssn:'111-22-3333',firstMonth:'1',lastMonth:'7'},
    {name:'Quentin Example',ssn:'444-55-6666',firstMonth:'1',lastMonth:'7'},
    {name:'Child One',ssn:'777-88-1111',firstMonth:'1',lastMonth:'7'},
    {name:'Child Two',ssn:'777-88-2222',firstMonth:'1',lastMonth:'7'},
  ];
  const policies=[
    {taxYear:String(year),marketplace:'Actual Marketplace',policyNumber:'P-actual',recipientName:'Paulette Example',recipientSsn:'111-22-3333',coveredIndividuals:[people[0]],monthlyPremiums:Array.from({length:7},(_,i)=>({month:String(i+1),enrolleePremium:'500',slcsp:'433',advancePremiumTaxCredit:'270'}))},
    {taxYear:String(year),marketplace:'Actual Marketplace',policyNumber:'Q-actual',recipientName:'Quentin Example',recipientSsn:'444-55-6666',coveredIndividuals:people.slice(1),monthlyPremiums:Array.from({length:7},(_,i)=>({month:String(i+1),enrolleePremium:'1000',slcsp:'833',advancePremiumTaxCredit:'524'}))},
    {taxYear:String(year),marketplace:'Actual Marketplace',policyNumber:'Joint-actual',recipientName:'Quentin Example',recipientSsn:'444-55-6666',coveredIndividuals:people.map(row=>({...row,firstMonth:'8',lastMonth:'12'})),monthlyPremiums:Array.from({length:5},(_,i)=>({month:String(i+8),enrolleePremium:'1350',slcsp:'1167',advancePremiumTaxCredit:'573'}))},
  ];
  return {
    sourceTaxYear:String(year),sourceReference:'Synthetic original Marketplace worksheet',sourceFactsConfirmed:true,allPoliciesIncluded:true,
    taxFamilySize:'4',fplRegion:'contiguous',requiredFilingDependentsModifiedAGI:'0',householdFactsConfirmed:true,canBeClaimedAsDependent:false,belowPovertyException:'none',coverageFactsConfirmed:true,
    allocationRequired:false,alternativeMarriageCalculationElected:true,selfEmployedHealthInsuranceCoordinationRequired:false,qsehraAffected:false,lawfulPresenceReconciliationRequired:false,
    policies,monthlyReconciliation:Array.from({length:12},(_,i)=>({month:String(i+1),enrolleePremium:i<7?'1500':'1350',slcsp:i<7?'1266':'1167',advancePremiumTaxCredit:i<7?'794':'573',coverageEligible:true,incomeBasedSepEnrollment:false})),
    marriageSources:{sourceTaxYear:String(year),sourceReference:'Synthetic marriage qualification worksheet',sourceFactsConfirmed:true,allPoliciesIncluded:true,
      primaryName:'Paulette Example',primarySsn:'111-22-3333',spouseName:'Quentin Example',spouseSsn:'444-55-6666',
      marriageDate:`${year}-07-15`,primaryUnmarriedOnJanuary1:true,spouseUnmarriedOnJanuary1:true,marriedToEachOtherOnDecember31:true,allDependentAssignmentsIncluded:true,
      dependents:[
        {name:'Child One',ssn:'777-88-1111',alternativeFamilyOwner:'spouse',qualifiesForPrimary:false,qualifiesForSpouse:true,sourceReference:'Actual dependency qualification1'},
        {name:'Child Two',ssn:'777-88-2222',alternativeFamilyOwner:'spouse',qualifiesForPrimary:false,qualifiesForSpouse:true,sourceReference:'Actual dependency qualification2'},
      ],
      policies:policies.map((original,index)=>({sourceId:`form1095A:${index}`,sourceReference:'Actual original statement',original:structuredClone(original),fullMonthCoverageConfirmed:true,allCoveredIndividualsEligibleForPtcConfirmed:true})),
      benchmarks:(['primary','spouse'] as const).flatMap(owner=>Array.from({length:7},(_,i)=>({owner,month:String(i+1),slcsp:owner==='primary'?'433':'833',sourceReference:'Actual corrected alternative benchmark',sourceFactsConfirmed:true,coveredIndividualSsns:owner==='primary'?['111-22-3333']:['444-55-6666','777-88-1111','777-88-2222']}))),
    },
  };
}
