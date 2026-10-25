import { Form1099QSchema, QualifiedEducationExpenseSummarySchema } from "@/models/inputs.js";

export const ordinaryCoverdellSource = (changes: Record<string, unknown> = {}) => Form1099QSchema.parse({
  sourceId: "esa-statement", accountId: "esa-account", beneficiaryId: "student", recipientOwner: "primary",
  taxYear: 2025, payerName: "Synthetic Coverdell custodian", accountType: "coverdell_esa", grossDistribution: "100.51",
  isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, sourceFactsConfirmed: true,
  transfer: { kind: "none" }, ...changes,
});
export const ordinaryCoverdellSummary = (history: Record<string, unknown> = {}) => QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: {
  taxYear: 2025, sourceFactsConfirmed: true, allDistributionsReconciled: true,
  beneficiaries: [{ id: "student", outsideK12QualifiedDistributions: "0" }], expenses: [], allocations: [], loanBorrowers: [], penaltyExceptions: [],
  coverdellAccounts: [{ accountId: "esa-account", priorYearBasis: "100.50", currentYearContributions: "0", yearEndValue: "0", outstandingRollovers: "0", rolloverBasisReceived: "0", ...history }],
} });
