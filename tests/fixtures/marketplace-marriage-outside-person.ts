import { noAdvanceSharedMarriageHealthInput } from './marketplace-shared-marriage-health';
import { d } from '@/utils/decimal';

/** Independent fictional originals; no deduction/credit or family-size override. */
export function marriageOutsidePersonInput(childCash = '100') {
  const input = noAdvanceSharedMarriageHealthInput(), plan = input.form7206!.plans![0];
  const outside = input.form7206!.persons!.find(row => row.personId === 'outside')!;
  outside.attainedAgeAtYearEnd = 26;
  const covered = plan.coveredPersons!.find(row => row.personId === 'outside')!;
  covered.relationshipToOwner = 'child_under_27';
  Object.assign(covered, { childRelationshipSources: {
    sourceTaxYear: 2025, sourceReference: 'Actual parent and child relationship record', sourceFactsConfirmed: true,
    accountHolder: 'primary', ownerSsn: input.taxpayer.primary.ssn, coveredIndividualSsn: '234-56-7890',
    childRelationship: 'son_or_daughter', relationshipStartDate: '1999-01-02',
  } });
  for (const payment of plan.payments!) if (payment.coverageMonth! <= 6) {
    payment.ownerOrBusinessPaid = d(payment.ownerOrBusinessPaid!).plus(childCash).toFixed();
    payment.otherPersonPaid = d(payment.otherPersonPaid!).minus(childCash).toFixed();
    payment.personAmounts!.find(row => row.personId === 'outside')!.amountPaid = childCash;
  }
  plan.coverageFamilySources = { sourceTaxYear: 2025, sourceReference: 'Actual full monthly coverage and source records', sourceFactsConfirmed: true, allPolicySourcesIncluded: true,
    policies: input.form1095A.map((original,index) => ({ sourceId: `form1095A:${index}`, original: structuredClone(original) })),
    persons: [{ personId: 'primary', coveredIndividualSsn: input.taxpayer.primary.ssn }, { personId: 'outside', coveredIndividualSsn: '234-56-7890' }],
    outsidePersonReturns: [{ personId: 'outside', sourceTaxYear: 2025, sourceReference: 'Actual completed child return Form8962', returnStatus: 'completed',
      claimantName: 'Robin Other', claimantSsn: '234-56-7890', policySourceIds: ['form1095A:0'], allPoliciesIncludedConfirmed: true, form8962Line24: '0' }],
    months: Array.from({length:12},(_,index) => ({ month:index+1, sourceReference:`Actual eligibility ${index+1}`, allCoveredPersonsIncludedConfirmed:true,
      personFacts:[{personId:'primary',sourceReference:`Actual owner enrollment and MEC ${index+1}`,fullCoverageMonthConfirmed:true,otherMecEligible:false}],
      coverageFamilySlcsp:'800', nonCoverageFamilySlcsp:'0', coverageFamilySourceReference:`Actual primary benchmark ${index+1}`, nonCoverageFamilySourceReference:`Actual empty noncoverage group ${index+1}`,
      coverageFamilyMemberSsns:[input.taxpayer.primary.ssn],nonCoverageFamilyMemberSsns:[],allCoverageFamilyMembersIncludedConfirmed:true,allNonCoverageFamilyMembersIncludedConfirmed:true })),
  };
  return input;
}
