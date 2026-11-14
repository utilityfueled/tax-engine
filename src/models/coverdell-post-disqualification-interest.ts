import { z } from 'zod';

const reference = z.string().trim().min(1);
const amount = z.string().trim().regex(/^\d+(?:\.\d+)?$/);
/** Actual source documents, not defaults or an attribution election. */
export const CoverdellPostDisqualificationInterestSchema = z.object({
  sourceTaxYear: z.union([z.literal(2025), z.literal(2026)]),
  sourceReference: reference, sourceFactsConfirmed: z.literal(true),
  sourceId: reference, accountId: reference, beneficiaryId: reference,
  allPostJanuary1ActivityIncludedConfirmed: z.literal(true), cashOnlyAtJanuary1Confirmed: z.literal(true),
  custodianConversionDate: reference, custodianConversionReference: reference,
  primaryBeneficiaryOwnsDepositConfirmed: z.literal(true), noRetainedTrustConfirmed: z.literal(true),
  domesticBankDepositConfirmed: z.literal(true),
  openingCash: amount, closingCash: amount, taxableBankInterest: amount,
  otherIncome: amount, realizedGains: amount, realizedLosses: amount,
  contributions: amount, withdrawals: amount, transfers: amount, fees: amount,
  originalIntIndex: z.number().int().nonnegative(),
  originalInterestSnapshot: z.object({
    taxYear: z.union([z.literal(2025), z.literal(2026)]), payer: reference, payerTin: reference,
    accountReference: reference, accountHolder: z.literal('primary'),
    interestIncome: amount, earlyWithdrawalPenalty: amount, usSavingsBondInterest: amount,
    federalWithheld: amount, foreignTaxPaid: amount, taxExemptInterest: amount,
    privateActivityBondInterest: amount, paDirectObligationInterest: amount, stateWithheld: amount,
  }).strict(),
}).strict();
