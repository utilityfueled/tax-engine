import { sharedPolicyFixture } from './shared-policy.js';

/** Fictional policy shared with a spouse on a separate return. */
export function separateReturnFixture(exception: boolean) {
  const input = sharedPolicyFixture(), facts = input.form8962!, policy = facts.sharedPolicyAllocations!.policies![0]!;
  input.taxpayer.filingStatus = 'married_filing_separately';
  facts.marriedFilingSeparatelyExceptionConfirmed = exception;
  Object.assign(policy, { situation: 'married_separate', noCurrentYearMarriageOrDivorceConfirmed: undefined, originalSlcspCorrectConfirmed: undefined,
    agreementConfirmed: undefined, agreementReference: undefined, monthlyAllocations: undefined,
    separateReturn: { sourceReference: 'Actual separate-return allocation records', marriedAtYearEndConfirmed: true, onlySpouseTaxFamiliesConfirmed: true,
      ownCoverageFamilySlcsp: exception ? input.form1095A[0]!.monthlyPremiums.map(row => ({ month: row.month, slcsp: '420' })) : undefined } });
  facts.monthlyReconciliation = input.form1095A[0]!.monthlyPremiums.map(row => ({ month: row.month, enrolleePremium: exception ? '500' : '0', slcsp: exception ? '420' : '0',
    advancePremiumTaxCredit: '250', coverageEligible: true, incomeBasedSepEnrollment: false }));
  return input;
}
