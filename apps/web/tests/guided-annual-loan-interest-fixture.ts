// Fictional original source facts; no calculated amounts or application imports.
import { actualAnnualCategoryInterview } from './guided-annual-category-fixture';
export function actualAnnualLoanInterestInterview() {
  const state = actualAnnualCategoryInterview(false), source = state.sectionData.credits.educationDistributions;
  const expense = source.expenses[0]; if (!expense) throw new Error('Missing fictional actual receipt');
  Object.assign(state.segmentation, { lifeEvents: ['student-loans'] });
  Object.assign(expense, { category: 'student_loan', amount: '1000', borrowerId: 'actual-loan-source',
    beneficiaryOrSibling: true, studentLoanInterestAmount: '1000', studentLoanInterestDeducted: '0' });
  Object.assign(source, { loanBorrowers: [{ id: 'actual-loan-source', owner: 'primary', priorQualifiedDistributions: '0', otherCurrentQualifiedDistributions: '0' }] });
  Object.assign(state.sectionData, { adjustments: {
    hsaDeduction: '', studentLoanInterest: '', selfEmployedHealthInsurance: '', educatorExpenses: '', iraDeduction: '', alimonyPaid: '',
    studentLoanFacts: { sourceTaxYear: '2025', sourceFactsConfirmed: true, primaryClaimedAsDependent: false,
      spouseClaimedAsDependent: false, puertoRicoIncomeExclusion: '0', americanSamoaIncomeExclusion: '0',
      loans: [{ sourceId: 'actual-lender-record', borrowerId: 'actual-loan-source', accountHolder: 'primary',
        lender: 'Fictional actual lender', sourceKind: 'lender_statement', loanOriginationDate: '2012-08-20',
        interestPaid: '1000', additionalInterestPaid: '0', paymentsInTaxYearConfirmed: true,
        legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true,
        enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: 'self',
        expensesWithinReasonablePeriod: true, relatedLender: false, employerPlanLoan: false,
        employerAssistanceExcluded: '0', otherTaxFreeAssistance: '0', interestDeductibleElsewhere: '0',
        qtpTaxFreeEarningsUsedForInterest: '', reductionsDistinctConfirmed: true,
        educationExpenseIds: ['actual-category-receipt'], additionalInterestSourceReference: '',
        additionalInterestQualificationConfirmed: null, form1098ESourceId: '', form1098ETaxYear: '', form1098EBox1: '',
        box2ExcludesOriginationFeesOrCapitalizedInterest: null }],
    },
  } });
  return state;
}
