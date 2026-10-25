import type { StudentLoanData } from "@/lib/guided-student-loan-facts";

/** Explicit fictional source answers for tests, never interview/import defaults. */
export function syntheticStudentLoanFacts(year = 2025, interestPaid = "2500"): StudentLoanData {
  return {
    sourceTaxYear: String(year), sourceFactsConfirmed: true, primaryClaimedAsDependent: false, spouseClaimedAsDependent: false,
    puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0",
    loans: [{ sourceId: "synthetic-loan-1", borrowerId: "synthetic-borrower-1", accountHolder: "primary", lender: "Synthetic lender", sourceKind: "lender_statement", loanOriginationDate: "2010-08-01",
      form1098ESourceId: "", form1098ETaxYear: "", form1098EBox1: "", box2ExcludesOriginationFeesOrCapitalizedInterest: null,
      interestPaid, additionalInterestPaid: "0", additionalInterestSourceReference: "", additionalInterestQualificationConfirmed: null,
      paymentsInTaxYearConfirmed: true, legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true,
      enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: "self", expensesWithinReasonablePeriod: true, relatedLender: false, employerPlanLoan: false,
      employerAssistanceExcluded: "0", otherTaxFreeAssistance: "0", interestDeductibleElsewhere: "0", qtpTaxFreeEarningsUsedForInterest: "0", reductionsDistinctConfirmed: true, educationExpenseIds: [] }],
  };
}
