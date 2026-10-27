import { annualCategoryFixture, exhaustedAnnualLoanSourceFacts } from './education-annual-category-limits.js';

/** Fictional original receipts and lender records, never calculated exclusions. */
export function annualLoanInterestFixture(interest = '1000') {
  const fixture = annualCategoryFixture(2025, 'student_loan', interest);
  Object.assign(fixture.expense, { borrowerId: 'actual-loan-source', beneficiaryOrSibling: true,
    studentLoanInterestAmount: interest, studentLoanInterestDeducted: '0' });
  fixture.facts.loanBorrowers = [{ id: 'actual-loan-source', owner: 'primary',
    priorQualifiedDistributions: '0', otherCurrentQualifiedDistributions: '0' }];
  const lender = exhaustedAnnualLoanSourceFacts();
  const loan = lender.loans?.[0];
  if (!loan) throw new Error('Missing fictional lender source');
  loan.interestPaid = interest;
  delete loan.qtpTaxFreeEarningsUsedForInterest;
  fixture.input.studentLoanInterestFacts = lender;
  return { ...fixture, lender, loan };
}
