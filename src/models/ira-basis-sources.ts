import { z } from 'zod';
import { d } from '@/utils/decimal.js';

const text = z.string().trim().min(1).max(300);
const amount = z.string().regex(/^\d+(?:\.\d+)?$/).refine(value => d(value).isFinite(), 'Actual amount must be finite');
const year = z.union([z.literal(2025), z.literal(2026)]);
const owner = z.enum(['primary', 'spouse']);
const tin = z.string().refine(value => /^\d{9}$/.test(value.replace(/-/g, '')), 'Actual nine-digit TIN required');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Actual calendar date required');

const basisHistory = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('confirmed_zero'), sourceReference: text,
    allPriorRecordsReviewed: z.boolean(), basisChangesSinceThatReturn: z.boolean() }),
  z.strictObject({ method: z.literal('prior_form_8606'), sourceReference: text,
    taxYear: z.number().int().min(2001), line14: amount, line15cWorksheetAdjustment: amount,
    mostRecentFormConfirmed: z.boolean(), allPriorRecordsReviewed: z.boolean(), basisChangesSinceThatReturn: z.boolean() }),
]);

/** Explicit source answers only. Unknown is not a negative answer or zero. */
export const IraBasisSourcesSchema = z.strictObject({
  taxYear: year, sourceReference: text, sourceFactsConfirmed: z.boolean(),
  allIraOwnersAndAccountsIncluded: z.boolean(), allDistributionsIncluded: z.boolean(),
  owners: z.array(z.strictObject({ accountHolder: owner,
    identity: z.strictObject({ firstName: text, lastName: text, dateOfBirth: date, ssnLast4: z.string().regex(/^\d{4}$/) }),
    basisHistory,
    ordinaryFacts: z.strictObject({ currentYearContributionsPresent: z.boolean(), conversionsPresent: z.boolean(), rolloversPresent: z.boolean(),
      qcdPresent: z.boolean(), hsaFundingPresent: z.boolean(), contributionReturnsPresent: z.boolean(),
      specialDistributionsOrRepaymentsPresent: z.boolean(), inheritedAccountsPresent: z.boolean(),
      divorceOrOtherBasisTransfersPresent: z.boolean(), otherBasisEventsPresent: z.boolean() }),
    accounts: z.array(z.strictObject({ accountId: text, taxYear: year, accountType: z.enum(['traditional', 'sep', 'simple']),
      custodian: text, custodianTin: tin, accountReference: text, sourceReference: text, yearEndValue: amount })).min(1).max(100),
  })).min(1).max(2),
  distributions: z.array(z.strictObject({ sourceId: z.string().regex(/^form1099R:(0|[1-9]\d*)$/),
    taxYear: year, sourceReference: text, accountId: text, accountHolder: owner,
    payer: text, payerTin: tin, accountReference: text, grossDistribution: amount,
    taxableAmount: amount.nullable(), taxableAmountNotDetermined: z.boolean(), iraSepSimple: z.boolean(), distributionCode: text,
  })).max(200),
});

export type IraBasisSourcesInput = z.infer<typeof IraBasisSourcesSchema>;
