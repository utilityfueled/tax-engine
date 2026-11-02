/** Actual Ohio payment originals; no monetary, date or prior-return defaults. */
import { z } from 'zod';
const ref = z.string().trim().min(1);
const money = z.string().trim().regex(/^\d{1,15}(?:\.\d{1,2})?$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const owner = z.enum(['primary', 'spouse']);
const none = z.object({ kind: z.literal('none') }).strict();
const prior = z.discriminatedUnion('status', [
    z.object({ status: z.literal('no_return'), sourceReference: ref }).strict(),
    z.object({ status: z.literal('filed_return'), taxYear: z.number().int(), returnType: z.literal('it1040'), periodStart: date, periodEnd: date, filingStatus: z.string().min(1), owners: z.array(z.object({ accountHolder: owner, name: ref, ssn: ref }).strict()).min(1).max(2), returnKind: z.literal('original'), filedDate: date, filingExtension: none, line10: money, line16: money, electedCreditCarryforward: money, sourceReference: ref }).strict()
]);
const receipt = z.object({ accountName: ref, accountSsn: ref, taxYear: z.number().int(), returnType: z.literal('it1040'), kind: z.enum(['estimated', 'extension']), date, amount: money, confirmationNumber: ref }).strict();
export const OhioPaymentFactsSchema = z.object({
    taxYear: z.number().int().min(2025).max(2026), sourceReference: ref, sourceFactsConfirmed: z.literal(true), originalFederalSources: z.record(z.string(), z.unknown()),
    calendarYearConfirmed: z.literal(true), allPaymentsIncludedConfirmed: z.literal(true), withholdingTreatment: z.literal('equal_quarters'),
    paymentRows: z.array(z.object({ sourceId: ref, sourceReference: ref, accountHolder: owner, taxYear: z.number().int(), returnType: z.literal('it1040'), kind: z.enum(['estimated', 'extension']), date, amount: money, appliedToThisReturnConfirmed: z.literal(true), original: receipt }).strict()),
    priorReturn: prior,
    priorCreditCarryforward: z.discriminatedUnion('status', [
        z.object({ status: z.literal('none'), sourceReference: ref }).strict(),
        z.object({ status: z.literal('actual_credit'), sourceReference: ref, electedAmount: money, availableForThisReturn: money, accountHolder: owner, accountSsn: ref, appliedToThisReturnConfirmed: z.literal(true) }).strict()
    ]),
    remainingTaxPayment: z.discriminatedUnion('status', [
        z.object({ status: z.literal('no_remaining_tax'), sourceReference: ref, sourceFactsConfirmed: z.literal(true) }).strict(),
        z.object({ status: z.literal('expected_payment'), sourceReference: ref, sourceFactsConfirmed: z.literal(true), date, amountAppliedToTax: money }).strict(),
        z.object({ status: z.literal('actual_payment'), sourceReference: ref, sourceFactsConfirmed: z.literal(true), date, amountAppliedToTax: money, accountHolder: owner, original: z.object({ accountName: ref, accountSsn: ref, taxYear: z.number().int(), returnType: z.literal('it1040'), kind: z.literal('balance'), date, amount: money, confirmationNumber: ref }).strict() }).strict()
    ]),
    currentTiming: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('filed'), filedDate: date, asOfDate: date }).strict(),
        z.object({ kind: z.literal('expected'), expectedDate: date, asOfDate: date }).strict()
    ]), filingExtension: none, paymentExtension: none, returnKind: z.literal('original'), specialMethod: z.literal('regular'),
    balanceFacts: z.object({ sourceReference: ref, useTax: money, outgoingCarryforward: money, donations: money }).strict()
}).strict();
export type OhioPaymentFacts = z.infer<typeof OhioPaymentFactsSchema>;
