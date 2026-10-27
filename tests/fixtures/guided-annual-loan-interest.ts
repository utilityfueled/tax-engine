import { emptyAdjustmentData } from '@/lib/guided-interview-flow';
import { emptyStudentLoanFacts, emptyStudentLoanSource } from '@/lib/guided-student-loan-facts';
import { actualGuidedAnnualCategory } from './guided-annual-category-limits';
import { annualLoanInterestFixture } from './education-annual-loan-interest';

export function actualGuidedAnnualLoanInterest() {
  const { state, data } = actualGuidedAnnualCategory();
  const original = annualLoanInterestFixture();
  data.expenses = [{ ...original.expense }];
  data.loanBorrowers = (original.facts.loanBorrowers ?? []).map(row => ({ ...row }));
  state.segmentation.lifeEvents.push('student-loans');
  state.sectionData.adjustments = { ...emptyAdjustmentData, studentLoanFacts: {
    ...emptyStudentLoanFacts, ...original.lender, sourceTaxYear: '2025',
    loans: [{ ...emptyStudentLoanSource, ...original.loan, qtpTaxFreeEarningsUsedForInterest: '' }],
  } };
  return { state, data, original };
}
