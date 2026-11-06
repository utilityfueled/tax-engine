import { Form1099QSchema, QualifiedEducationExpenseSummarySchema } from "@/models/inputs.js";

export const returnedEducationSource = (overrides: Record<string, unknown> = {}) => Form1099QSchema.parse({
  sourceId: "return1", accountId: "esa1", beneficiaryId: "student1", recipientOwner: "primary", taxYear: 2026,
  accountType: "coverdell_esa", grossDistribution: "1100", earnings: "100", basis: "1000", isTrusteeToTrustee: false,
  isQtpToRoth: false, recipientNotBeneficiary: false, distributionCode: "2", distributionDate: "2026-12-01",
  sourceFactsConfirmed: true, transfer: { kind: "none" }, returnedContributionId: "contribution1",
  returnedContributionTaxYear: 2026, returnedContributionDate: "2026-01-15", returnedContributionOriginalAmount: "1000",
  returnedContributionPrincipal: "1000", returnedContributionNetIncome: "100", returnedContributionIncomePreviouslyReported: "0",
  returnedContributionNetIncomeConfirmed: true, returnedContributionBasisReconciled: true, ...overrides,
});
export const educationCorrectionSummary = (year = 2026, overrides: Record<string, unknown> = {}) => QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: {
  taxYear: year, sourceFactsConfirmed: true, allDistributionsReconciled: true, beneficiaries: [{ id: "student1", outsideK12QualifiedDistributions: "0" }],
  expenses: [], allocations: [], loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [], ...overrides,
} });
