import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';

/** Actual synthetic source facts; no production defaults. */
export function educatorInKindFixture(year = 2026) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '50000', socialSecurityWages: '50000', medicareWages: '50000', socialSecurityTips: '0', federalWithheld: '20000' }],
    form1099Q: [{ sourceId: 'prepaid', accountId: 'prepaid-account', beneficiaryId: 'educator', recipientOwner: 'primary', taxYear: year,
      accountType: '529', distributionMedium: 'in_kind_prepaid_tuition', grossDistribution: '4000', earnings: '800', basis: '3200',
      isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, sourceFactsConfirmed: true, transfer: { kind: 'none' } }],
    qualifiedEducationExpenses: { sourceFacts: { taxYear: year, sourceFactsConfirmed: true, allDistributionsReconciled: true,
      beneficiaries: [{ id: 'educator', name: 'Jane Doe', studentTaxId: simpleW2Fixture.taxpayer.primary.ssn, outsideK12QualifiedDistributions: '0' }],
      expenses: [{ id: 'tuition', beneficiaryId: 'educator', category: 'postsecondary_tuition', paidDate: `${year}-08-15`, amount: '4000',
        refundedAmount: '0', taxFreeAssistance: '0', educationCreditAmount: '0', otherTaxBenefitAmount: '0', qualificationConfirmed: true }],
      allocations: [{ sourceId: 'prepaid', expenseId: 'tuition', amount: '4000', creditAmount: '0' }],
      inKindBenefits: [{ id: 'benefit', sourceId: 'prepaid', expenseId: 'tuition', amount: '4000', providedDate: `${year}-08-15`,
        qualificationConfirmed: true, sourceReference: 'Synthetic actual tuition credit application' }], loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [] } },
    adjustments: { educatorExpenseSources: [{ accountHolder: 'primary', taxYear: year, schoolYear: `${year - 1}-${year}`, sourceFactsConfirmed: true,
      schools: [{ name: 'Synthetic school', role: 'teacher', level: 'k12', schoolEligible: true, hoursWorked: '900' }],
      expenses: [{ sourceId: 'classroom', datePaid: `${year}-03-01`, description: 'Actual classroom supplies', category: 'classroom', amount: '1000',
        ordinaryAndNecessary: true, qualifyingUse: true, healthOrPhysicalEducation: false, athleticSupplies: false, deductedElsewhere: false,
        itemizedReimbursements: '0', itemizedTaxFreeFunding: '0' }], reimbursementsNotInWages: '0', excludedSavingsBondInterest: '0',
      nontaxableQualifiedTuitionProgramAmount: '800', nontaxableCoverdellEarnings: '0' }] },
  });
}
