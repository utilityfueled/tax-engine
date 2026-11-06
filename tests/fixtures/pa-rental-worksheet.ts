// Independent synthetic PA source worksheet. Federal amounts deliberately differ.
export const actualPAWorksheet = (overrides: Record<string, unknown> = {}) => ({
  taxYear: 2025, sourceReference: "Synthetic PA rental receipts and expense ledger", factsConfirmed: true,
  amountsBeforeOwnershipAllocation: true, expensesAreRentalUseOnly: true, paRulesApplied: true,
  grossRents: "20001", advertising: "1", autoTravel: "1201", cleaning: "0", commissions: "0",
  insurance: "0", legalProfessional: "0", managementFees: "0", mortgageInterest: "0", otherInterest: "0",
  repairs: "8001", supplies: "0", taxes: "0", utilities: "0", depreciation: "2001", otherExpenses: "0",
  depreciationSourceReference: "Synthetic PA straight-line asset worksheet", ...overrides,
});
