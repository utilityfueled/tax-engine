import type { SavingsBondEducationData } from "@/lib/guided-savings-bond-facts";

/** Actual fictional source records; never application defaults. */
export function actualSavingsBondData(): SavingsBondEducationData & Required<Pick<SavingsBondEducationData, "redemptions" | "educationExpenses">> {
  return {
    taxYear: "2025", sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true,
    priorYearInterestIncludedInCurrentStatements: "500", americanSamoaIncomeExclusion: "0", puertoRicoIncomeExclusion: "0", royaltyInterestAdjustment: "0",
    redemptions: [{ sourceId: "bond-a", bondType: "paper_ee", issueDate: "2020-01-01", redemptionDate: "2025-06-15", ownerDateOfBirth: "1990-02-15", registeredOwner: "taxpayer", ownershipConfirmed: true, proceeds: "10000", faceValue: "16000", priorYearInterestReported: "500" }],
    educationExpenses: [{ sourceId: "expense-a", beneficiaryName: "Jordan Example", beneficiaryTaxId: "111-22-3333", relationship: "taxpayer", institutionName: "Synthetic College", institutionAddress: "1 College Rd, Example OH43215", expenseType: "tuition_and_required_fees", paidTaxYear: "2025", amountPaid: "10000", qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }],
  };
}
