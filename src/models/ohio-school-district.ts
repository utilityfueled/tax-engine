/** Actual school-district sources; all source answers are supplied, without defaults. */
import { z } from 'zod';
const reference = z.string().trim().min(1);
const money = z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const district = z.string().regex(/^\d{4}$/);
const none = z.object({ kind: z.literal('none') }).strict();
const address = z.object({ street: reference, apt: z.string().optional(), city: reference, state: reference, zip: reference }).strict();
const identity = z.object({ firstName: reference, lastName: reference, ssn: reference, dateOfBirth: date }).strict();
const receipt = z.object({
  accountName: reference, accountSsn: reference, taxYear: z.number().int(), returnType: z.literal('sd100'),
  kind: z.literal('estimated'), date, amount: money, confirmationNumber: reference,
}).strict();
const prior = z.discriminatedUnion('status', [
  z.object({ status: z.literal('no_return'), sourceReference: reference }).strict(),
  z.object({ status: z.literal('filed_return'), sourceReference: reference, taxYear: z.number().int(),
    returnType: z.literal('sd100'), districtCode: district, accountName: reference, accountSsn: reference,
    filingStatus: z.literal('single'), periodStart: date, periodEnd: date, returnKind: z.literal('original'),
    filedDate: date, filingExtension: none, line8: money, line19: money, electedCreditCarryforward: money,
  }).strict(),
]);
export const OhioSchoolDistrictFactsSchema = z.object({
  taxYear: z.number().int().min(2025).max(2026), sourceReference: reference, sourceFactsConfirmed: z.literal(true),
  originalFederalSources: z.record(z.string(), z.unknown()),
  owner: z.object({ accountHolder: z.literal('primary'), originalTaxpayer: identity }).strict(),
  residence: z.object({
    sourceReference: reference, originalAddress: address,
    periods: z.array(z.object({ from: date, through: date, districtCode: district, sourceReference: reference }).strict()).min(1),
    lookup: z.object({ sourceReference: reference, taxYear: z.number().int(), lookupDate: date,
      originalAddress: address, districtCode: district, districtName: reference, officialResultMatchedConfirmed: z.literal(true),
    }).strict(),
  }).strict(),
  income: z.object({ sourceReference: reference, ordinaryCompensationOnlyConfirmed: z.literal(true),
    noSelfEmploymentIncomeConfirmed: z.literal(true), allOtherIncomeSourcesCheckedConfirmed: z.literal(true),
    noSpecialWageAdjustmentsConfirmed: z.literal(true),
  }).strict(),
  w2Sources: z.array(z.object({
    w2Index: z.number().int().nonnegative(), sourceReference: reference,
    box14SchoolDistrictReporting: z.object({ status: z.enum(['none', 'reported', 'unknown']), sourceReference: reference }).strict(),
    localRows: z.array(z.object({ printedRow: z.number().int().positive(), sourceReference: reference,
      classification: z.enum(['school_district', 'municipal', 'unresolved']),
      districtCode: district.optional(), municipalityCode: reference.optional(),
    }).strict()),
  }).strict()).min(1),
  payments: z.object({
    sourceReference: reference, allCurrentAndPriorPaymentsIncludedConfirmed: z.literal(true), withholdingTreatment: z.literal('equal_quarters'),
    paymentRows: z.array(z.object({ sourceId: reference, sourceReference: reference, accountHolder: z.literal('primary'), taxYear: z.number().int(),
      returnType: z.literal('sd100'), kind: z.literal('estimated'), date, amount: money, appliedToThisReturnConfirmed: z.literal(true), original: receipt,
    }).strict()),
    account: z.object({ sourceReference: reference, accountName: reference, accountSsn: reference, taxYear: z.number().int(), returnType: z.literal('sd100'),
      asOfDate: date, completeAccountConfirmed: z.literal(true), estimatedPaymentsCredited: money, priorCreditApplied: money,
    }).strict(),
    priorReturn: prior,
    priorCreditCarryforward: z.discriminatedUnion('status', [
      z.object({ status: z.literal('none'), sourceReference: reference }).strict(),
      z.object({ status: z.literal('actual_credit'), sourceReference: reference, accountHolder: z.literal('primary'), accountSsn: reference,
        electedAmount: money, availableForThisReturn: money, appliedToThisReturnConfirmed: z.literal(true),
      }).strict(),
    ]),
    remainingTaxPayment: z.object({ status: z.literal('no_remaining_tax'), sourceReference: reference, sourceFactsConfirmed: z.literal(true) }).strict(),
    currentTiming: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('expected'), expectedDate: date, asOfDate: date }).strict(),
      z.object({ kind: z.literal('filed'), filedDate: date, asOfDate: date }).strict(),
    ]),
    filingExtension: none, paymentExtension: none, returnKind: z.literal('original'), specialMethod: z.literal('regular'),
    refundDisposition: z.object({ sourceReference: reference, outgoingCarryforward: money }).strict(),
  }).strict(),
}).strict();
export type OhioSchoolDistrictFacts = z.infer<typeof OhioSchoolDistrictFactsSchema>;
