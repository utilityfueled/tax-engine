import { sharedMarriageHealthRecords } from './marketplace-shared-marriage-health-records';

/** Plain original source facts for the private browser and guided workflows. */
export function marriageOutsidePersonRecords() {
  const records = sharedMarriageHealthRecords(), { personal, coverage, health } = records;
  const original = coverage.policies[0], outsideSsn = '234-56-7890';
  original.coveredIndividuals = original.coveredIndividuals!.map(person => ({ ...person, lastMonth: '6' }));
  original.monthlyPremiums = original.monthlyPremiums.slice(0,6).map(row => ({ ...row, enrolleePremium: '3000.03', slcsp: '', slcspReportedBlank: true, advancePremiumTaxCredit: '0' }));
  const own = { ...structuredClone(original), policyNumber: 'ACTUAL-UNSHARED-PRIMARY',
    coveredIndividuals: [{ name: 'Avery Example', ssn: personal.ssn, firstMonth: '7', lastMonth: '12' }],
    monthlyPremiums: Array.from({length:6},(_,index) => ({ month: String(index+7), enrolleePremium: '1000', slcsp: '800', advancePremiumTaxCredit: '1000' })) };
  coverage.policies.push(own);
  const shared = coverage.sharedPolicyAllocations!.policies[0];
  Object.assign(shared, { original: structuredClone(original), situation: 'no_advance_credit', agreementConfirmed: null,
    agreementReference: '', monthlyAllocations: [], originalSlcspCorrectConfirmed: null,
    noAdvanceAllocation: { sourceTaxYear: '2025', sourceReference: 'Actual two-family benchmark records', sourceFactsConfirmed: true,
      allCoveredPeopleInCoverageFamiliesConfirmed: true, monthlyBenchmarks: original.monthlyPremiums.map(row => ({ month: row.month,
        thisReturnSlcsp: '800', otherReturnSlcsp: '1600', thisReturnSourceReference: 'Actual primary benchmark', otherReturnSourceReference: 'Actual Robin benchmark',
        thisReturnCoveredIndividualSsns: [personal.ssn], otherReturnCoveredIndividualSsns: [outsideSsn] })) } });
  coverage.sharedPolicyAllocations!.policies.push({ sourceId: 'form1095A:1', original: structuredClone(own), situation: 'not_shared',
    otherTaxpayerName: '', otherTaxpayerSsn: '', noCurrentYearMarriageOrDivorceConfirmed: null, twoTaxFamiliesConfirmed: null,
    allCoveredPeopleAssignedConfirmed: null, originalSlcspCorrectConfirmed: true, agreementConfirmed: null, agreementReference: '',
    coveredFamilyAssignments: [], monthlyAllocations: [], unsharedSourceReference: 'Actual independent owner statement', allCoveredPeopleInThisTaxFamilyConfirmed: true });
  coverage.marriageSources!.policies = coverage.policies.map((policy,index) => ({ sourceId: `form1095A:${index}`, sourceReference: `Actual original ${index}`,
    original: structuredClone(policy), fullMonthCoverageConfirmed: true, allCoveredIndividualsEligibleForPtcConfirmed: true }));
  coverage.monthlyReconciliation = Array.from({length:12},(_,index) => ({ month:String(index+1), enrolleePremium:index<6?'1000.01':'1000', slcsp:'800',
    advancePremiumTaxCredit:index<6?'0':'1000', coverageEligible:true, incomeBasedSepEnrollment:false }));
  const plan = health.plans[0];
  plan.marketplacePolicySourceIds = ['form1095A:0','form1095A:1'];
  health.persons.find(person => person.personId === 'outside')!.attainedAgeAtYearEnd = '26';
  const child = plan.coveredPersons.find(person => person.personId === 'outside')!;
  child.relationshipToOwner = 'child_under_27';
  Object.assign(child, { childRelationshipSources: { sourceTaxYear:'2025', sourceReference:'Actual parent and child relationship record', sourceFactsConfirmed:true,
    accountHolder:'primary', ownerSsn:personal.ssn, coveredIndividualSsn:outsideSsn, childRelationship:'son_or_daughter', relationshipStartDate:'1999-01-02' } });
  plan.payments = plan.payments.map(payment => Number(payment.coverageMonth) <= 6 ? { ...payment, grossPremium:'3000.03', ownerOrBusinessPaid:'1100.01',
    otherPersonPaid:'1900.02', advancePremiumTaxCredit:'0', personAmounts:payment.personAmounts.map(person => ({ ...person,
      amountPaid:person.personId==='primary'?'1000.01':'100', advancePremiumTaxCredit:'0' })) }
    : { ...payment, grossPremium:'1000', ownerOrBusinessPaid:'0', otherPersonPaid:'0', advancePremiumTaxCredit:'1000',
      personAmounts:payment.personAmounts.map(person => ({ ...person, amountPaid:'0', advancePremiumTaxCredit:person.personId==='primary'?'1000':'0' })) });
  plan.coverageFamilySources = { sourceTaxYear:'2025', sourceReference:'Actual full monthly coverage and source records', sourceFactsConfirmed:true, allPolicySourcesIncluded:true,
    policies:coverage.policies.map((policy,index) => ({sourceId:`form1095A:${index}`,original:structuredClone(policy)})),
    persons:[{personId:'primary',coveredIndividualSsn:personal.ssn},{personId:'outside',coveredIndividualSsn:outsideSsn}],
    outsidePersonReturns:[{personId:'outside',sourceTaxYear:'2025',sourceReference:'Actual completed child return Form8962',returnStatus:'completed',
      claimantName:'Robin Other',claimantSsn:outsideSsn,policySourceIds:['form1095A:0'],allPoliciesIncludedConfirmed:true,form8962Line24:'0'}],
    months:Array.from({length:12},(_,index) => ({ month:String(index+1), sourceReference:`Actual eligibility ${index+1}`, allCoveredPersonsIncludedConfirmed:true,
      personFacts:[{personId:'primary',sourceReference:`Actual owner enrollment and MEC ${index+1}`,fullCoverageMonthConfirmed:true,otherMecEligible:false}],
      coverageFamilySlcsp:'800',nonCoverageFamilySlcsp:'0',coverageFamilySourceReference:`Actual primary benchmark ${index+1}`,nonCoverageFamilySourceReference:`Actual empty noncoverage group ${index+1}`,
      coverageFamilyMemberSsns:[personal.ssn],nonCoverageFamilyMemberSsns:[],allCoverageFamilyMembersIncludedConfirmed:true,allNonCoverageFamilyMembersIncludedConfirmed:true })) };
  return records;
}
