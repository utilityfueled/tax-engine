import { Form1099QSchema, QualifiedEducationExpenseSummarySchema } from "@/models/inputs.js";

export const disqualifiedEducationSource = (changes: Record<string, unknown> = {}) => Form1099QSchema.parse({
  sourceId: "terminated-esa", accountId: "esa-account", beneficiaryId: "student", recipientOwner: "primary",
  taxYear: 2026, accountType: "coverdell_esa", grossDistribution: "1000", earnings: "300", basis: "700",
  isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, sourceFactsConfirmed: true,
  transfer: { kind: "none" }, distributionCode: "6", prohibitedTransactionKind: "account_disqualification",
  prohibitedTransactionDate: "2026-06-01", prohibitedTransactionSourceReference: "custodian-event-record",
  prohibitedTransactionSourceConfirmed: true, prohibitedTransactionJanuary1Value: "1000", prohibitedTransactionBasis: "700",
  prohibitedTransactionQualifiedEducationExpenses: "0",
  prohibitedTransactionNoPostDisqualificationActivityConfirmed: true,
  prohibitedTransactionPostDisqualificationSourceReference: "full-year-zero-income-gain-loss-record",
  ...changes,
});
export const disqualifiedEducationSummary = (changes: Record<string, unknown> = {}) => QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: {
  taxYear: 2026, sourceFactsConfirmed: true, allDistributionsReconciled: true,
  beneficiaries: [{ id: "student", outsideK12QualifiedDistributions: "0" }], expenses: [], allocations: [],
  loanBorrowers: [], penaltyExceptions: [], coverdellAccounts: [], ...changes,
} });
