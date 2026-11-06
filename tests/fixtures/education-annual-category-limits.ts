import type { QualifiedEducationExpenseSummary, StudentLoanInterestFacts } from '@/models/inputs.js';
import { annualCashQtpFixture } from './education-annual-cash.js';

type Expense = NonNullable<NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>['expenses']>[number];
/** Fictional actual statements and receipts; no calculated exclusions or elections. */
export function annualCategoryFixture(year = 2025, category: Expense['category'] = 'k12_tuition', amount = '25000') {
  const fixture = annualCashQtpFixture(year);
  const { facts, form, second } = fixture;
  Object.assign(form, { grossDistribution: '15000', earnings: '3000', basis: '12000', distributionDate: `${year}-09-01` });
  Object.assign(second, { grossDistribution: '15000', earnings: '6000', basis: '9000', distributionDate: `${year}-09-02` });
  const original = facts.expenses?.[0];
  if (!original) throw new Error('Missing fictional actual category receipt');
  const expense: Expense = { ...original, id: 'actual-category-receipt', category, amount, paidDate: `${year}-09-01` };
  facts.expenses = [expense]; facts.expenseRefunds = []; facts.allocations = [];
  facts.roomBoardPeriods = []; facts.roomBoardPeriodExpenses = [];
  facts.roomBoardEsaAllocations = []; facts.inKindBenefits = [];
  return { ...fixture, expense };
}

/** A fictional actual loan claim whose precise prior history exhausts the QTP limit. */
export function exhaustedAnnualLoanFixture() {
  const fixture = annualCategoryFixture(2025, 'student_loan', '8000');
  Object.assign(fixture.expense, { borrowerId: 'actual-loan-source', beneficiaryOrSibling: true,
    studentLoanInterestAmount: '1000', studentLoanInterestDeducted: '1000' });
  fixture.facts.loanBorrowers = [{ id: 'actual-loan-source', owner: 'primary',
    priorQualifiedDistributions: `0.${'0'.repeat(59)}1`, otherCurrentQualifiedDistributions: `9999.${'9'.repeat(60)}` }];
  return fixture;
}

/** Separate fictional lender and loan-origin evidence, never inferred from a claimed amount. */
export function exhaustedAnnualLoanSourceFacts(owner: 'primary' | 'spouse' = 'primary'): StudentLoanInterestFacts {
  return { sourceTaxYear: 2025, sourceFactsConfirmed: true, primaryClaimedAsDependent: false,
    spouseClaimedAsDependent: false, puertoRicoIncomeExclusion: '0', americanSamoaIncomeExclusion: '0',
    loans: [{ sourceId: 'actual-lender-record', borrowerId: 'actual-loan-source', accountHolder: owner,
      lender: 'Fictional actual lender', sourceKind: 'lender_statement', loanOriginationDate: '2012-08-20',
      interestPaid: '1000', additionalInterestPaid: '0', paymentsInTaxYearConfirmed: true,
      legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true,
      enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: 'self',
      expensesWithinReasonablePeriod: true, relatedLender: false, employerPlanLoan: false,
      employerAssistanceExcluded: '0', otherTaxFreeAssistance: '0', interestDeductibleElsewhere: '0',
      qtpTaxFreeEarningsUsedForInterest: '0', reductionsDistinctConfirmed: true,
      educationExpenseIds: ['actual-category-receipt'] }] };
}
