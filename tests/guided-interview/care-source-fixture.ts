import type { DependentCareData } from "@/lib/guided-interview-flow";

/** Explicit synthetic Form2441 source records; never used by production adapters. */
export function completeCareSource(overrides: Partial<DependentCareData> = {}): DependentCareData {
  return {
    expenses: "5000.01", qualifyingIndividuals: "2", primaryEarnedIncome: "20000.10", spouseEarnedIncome: "0",
    excludedDependentCareBenefits: "0", priorYearExpenseCredit: "0", eligibilityConfirmed: true,
    sourceFactsConfirmed: true, receivedBenefits: false, usesDeemedIncome: false,
    providers: [{ name: "Synthetic Care Center", address: "10 Example St, Austin TX 78701", identifierType: "tin",
      taxId: "12-3456789", householdEmployee: false, amountPaid: "5000.01" }],
    qualifyingPersons: [
      { firstName: "Casey", lastName: "Example", identifierType: "tax_id", taxId: "999-88-7001", over12Disabled: false,
        qualifiedExpenses: "5000.01", qualifyingPersonConfirmed: true },
      { firstName: "Jordan", lastName: "Example", identifierType: "tax_id", taxId: "999-88-7002", over12Disabled: false,
        qualifiedExpenses: "0", qualifyingPersonConfirmed: true },
    ],
    ...overrides,
  };
}
