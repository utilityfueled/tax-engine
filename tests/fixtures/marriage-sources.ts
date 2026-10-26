import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';

/** Fictional sources compatible with the published 2025 aggregate example. */
export function marriageSourcesFixture(year = 2025) {
  const input = structuredClone(simpleW2Fixture);
  Object.assign(input.taxpayer, { taxYear: year, filingStatus: 'married_filing_jointly',
    primary: { ...input.taxpayer.primary, firstName: 'Paulette', lastName: 'Example', ssn: '111-22-3333' },
    spouse: { ...input.taxpayer.primary, firstName: 'Quentin', lastName: 'Example', ssn: '444-55-6666' },
    dependents: [
      { firstName: 'Child', lastName: 'One', ssn: '777-88-1111', dateOfBirth: '2014-04-01', relationship: 'child', monthsLivedWithYou: 12, qualifiesForCTC: true },
      { firstName: 'Child', lastName: 'Two', ssn: '777-88-2222', dateOfBirth: '2016-06-01', relationship: 'child', monthsLivedWithYou: 12, qualifiesForCTC: true },
    ] });
  input.standardDeductionFacts = { ...input.standardDeductionFacts, primaryCanBeClaimedAsDependent: false, spouseCanBeClaimedAsDependent: false };
  const people = [
    { name:'Paulette Example',ssn:'111-22-3333',firstMonth:1,lastMonth:7 },
    { name:'Quentin Example',ssn:'444-55-6666',firstMonth:1,lastMonth:7 },
    { name:'Child One',ssn:'777-88-1111',firstMonth:1,lastMonth:7 },
    { name:'Child Two',ssn:'777-88-2222',firstMonth:1,lastMonth:7 },
  ];
  input.form1095A = [
    { taxYear:year,marketplace:'Actual Marketplace',policyNumber:'P-actual',recipientName:'Paulette Example',recipientSsn:'111-22-3333',
      coveredIndividuals:[people[0]],monthlyPremiums:Array.from({length:7},(_,i)=>({month:i+1,enrolleePremium:'500',slcsp:'433',advancePremiumTaxCredit:'270'})) },
    { taxYear:year,marketplace:'Actual Marketplace',policyNumber:'Q-actual',recipientName:'Quentin Example',recipientSsn:'444-55-6666',
      coveredIndividuals:people.slice(1),monthlyPremiums:Array.from({length:7},(_,i)=>({month:i+1,enrolleePremium:'1000',slcsp:'833',advancePremiumTaxCredit:'524'})) },
    { taxYear:year,marketplace:'Actual Marketplace',policyNumber:'Joint-actual',recipientName:'Quentin Example',recipientSsn:'444-55-6666',
      coveredIndividuals:people.map(row=>({...row,firstMonth:8,lastMonth:12})),monthlyPremiums:Array.from({length:5},(_,i)=>({month:i+8,enrolleePremium:'1350',slcsp:'1167',advancePremiumTaxCredit:'573'})) },
  ];
  return TaxYearInputSchema.parse({ ...input, form8962: {
    taxFamilySize:4,fplRegion:'contiguous',requiredFilingDependentsModifiedAGI:'0',householdFactsConfirmed:true,
    canBeClaimedAsDependent:false,belowPovertyException:'none',coverageFactsConfirmed:true,allocationRequired:false,
    alternativeMarriageCalculationElected:true,selfEmployedHealthInsuranceCoordinationRequired:false,qsehraAffected:false,lawfulPresenceReconciliationRequired:false,
    monthlyReconciliation:Array.from({length:12},(_,i)=>({month:i+1,enrolleePremium:i<7?'1500':'1350',slcsp:i<7?'1266':'1167',advancePremiumTaxCredit:i<7?'794':'573',coverageEligible:true,incomeBasedSepEnrollment:false})),
    marriageSources: {
      sourceTaxYear:year,sourceReference:'Actual marriage and Marketplace worksheet',sourceFactsConfirmed:true,allPoliciesIncluded:true,
      primaryName:'Paulette Example',primarySsn:'111-22-3333',spouseName:'Quentin Example',spouseSsn:'444-55-6666',
      marriageDate:`${year}-07-15`,primaryUnmarriedOnJanuary1:true,spouseUnmarriedOnJanuary1:true,marriedToEachOtherOnDecember31:true,
      allDependentAssignmentsIncluded:true,dependents:[
        {name:'Child One',ssn:'777-88-1111',alternativeFamilyOwner:'spouse',qualifiesForPrimary:false,qualifiesForSpouse:true,sourceReference:'Actual dependency worksheet1'},
        {name:'Child Two',ssn:'777-88-2222',alternativeFamilyOwner:'spouse',qualifiesForPrimary:false,qualifiesForSpouse:true,sourceReference:'Actual dependency worksheet2'},
      ],
      policies:input.form1095A.map((original,index)=>({sourceId:`form1095A:${index}`,sourceReference:'Actual original policy statement',original:structuredClone(original),fullMonthCoverageConfirmed:true,allCoveredIndividualsEligibleForPtcConfirmed:true})),
      benchmarks:['primary','spouse'].flatMap(owner=>Array.from({length:7},(_,i)=>({owner,month:i+1,slcsp:owner==='primary'?'433':'833',
        sourceReference:'Actual corrected alternative coverage-family benchmark',sourceFactsConfirmed:true,
        coveredIndividualSsns:owner==='primary'?['111-22-3333']:['444-55-6666','777-88-1111','777-88-2222']}))),
    },
  } });
}
