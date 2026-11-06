export function vehicleRefinancingFixture(year = 2025) {
  const payments = { interestPaid: "200", interestDeductedElsewhere: "0", otherExcludedInterest: "0" };
  return {
    owner: "primary" as const, lenderName: "Synthetic refinance lender", loanAccountReference: "new-account", sourceTaxYear: year,
    sourceReference: "Synthetic annual vehicle statements", borrowerQualificationConfirmed: true,
    vin: "1HGCM82633A004352", acquiredDate: "2025-01-01", loanOriginationDate: "2025-01-01",
    interestPaid: "1200", businessInterestDeducted: "0", nonqualifyingInterest: "0", firstLien: true,
    originalUse: true, finalAssemblyUnitedStates: true, personalUse: true, vehicleType: "car" as const,
    grossVehicleWeightRating: 4000, relatedParty: false, lease: false, fleet: false, salvageOrScrap: false, refinanced: true,
    refinancingSources: {
      sourceTaxYear: year, vin: "1HGCM82633A004352", sourceReference: "Synthetic complete original and refinance records", sourceFactsConfirmed: true,
      allLoansIncluded: true, ordinaryPrincipalMethodConfirmed: true, sameOriginalBorrowerConfirmed: true,
      originalLoan: { sourceId: "purchase", sourceReference: "Synthetic original purchase closing", lenderName: "Synthetic original lender", loanAccountReference: "old-account", originationDate: "2025-01-01",
        principal: "40000", qualifiedPurchaseCosts: "40000", otherPurchaseCosts: "0", downPayment: "0", firstLien: true, relatedParty: false, ...payments },
      refinancings: [{ sourceId: "refinance-1", previousLoanSourceId: "purchase", sourceReference: "Synthetic refinance closing", lenderName: "Synthetic refinance lender", loanAccountReference: "new-account", originationDate: `${year}-06-01`,
        previousOutstandingPrincipal: "20000", principal: "25000", firstLien: true, relatedParty: false, ...payments, interestPaid: "1000" }],
    },
  };
}
