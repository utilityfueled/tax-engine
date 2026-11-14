import { z } from 'zod';

const reference = z.string().trim().min(1);
const amount = z.string().trim().min(1);

/** Actual debt/election records; absent facts never become negative answers or zero. */
export const Form1099DAMarketDiscountSourceSchema = z.object({
  sourceReference: reference, sourceFactsConfirmed: z.literal(true),
  statementSourceId: reference, transactionSourceId: reference,
  sourceTaxYear: z.union([z.literal(2025), z.literal(2026)]),
  accountHolder: z.enum(['primary', 'spouse']), accountReference: reference,
  securityIdentifier: reference, originalDispositionReference: reference,
  issuerTaxTreatment: z.literal('taxable_corporate'), tokenizedDebtConfirmed: z.literal(true),
  heldForInvestmentConfirmed: z.literal(true),
  issueDate: reference, maturityDate: reference, usDollarDenominated: z.literal(true), fullDisposition: z.literal(true),
  ordinaryIncomeCause: z.literal('market_discount_only'),
  currentInclusionElectionApplies: z.literal(false), allInterestAsOidElectionApplies: z.literal(false),
  previouslyIncludedMarketDiscount: amount, priorPartialPrincipalPayments: amount, originalIssueDiscount: amount,
  acquisitionPremium: amount, bondPremium: amount,
  strippedDebt: z.literal(false), contingentPaymentDebt: z.literal(false), borrowedToAcquireOrCarry: z.literal(false),
  installmentObligation: z.literal(false), transferredBasis: z.literal(false), reorganizationDebt: z.literal(false),
  originalDisposition: z.object({
    dateAcquired: reference, dateSold: reference, proceeds: amount, costBasis: amount,
    marketDiscount: amount, ordinaryIncome: z.literal(true),
  }).strict(),
  interestReportingReconciliation: z.object({
    sourceReference: reference,
    // Complete original parsed statement snapshots, not fabricated interest forms.
    originalForm1099Int: z.array(z.unknown()), originalForm1099OID: z.array(z.unknown()),
    allOriginalInterestStatementsIncludedConfirmed: z.literal(true), sameDiscountIncludedElsewhere: z.literal(false),
  }).strict(),
}).strict();
