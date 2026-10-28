/** Separate actual insurer cash from another taxpayer's credit or repayment.
 * Spec: spec/federal/marketplace-other-return-cash.yaml. */
import type Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';

type Plan = NonNullable<NonNullable<TaxYearInput['form7206']>['plans']>[number];
type OtherReturn = NonNullable<NonNullable<Plan['coverageFamilySources']>['outsidePersonReturns']>[number];
export interface MarketplaceOutsideCashPayment {
  paymentSourceId: string; personId: string; payer: 'owner_after_tax' | 'business_paid_or_reimbursed';
  datePaid: string; sourceReference: string; grossCash: Decimal; reimbursements: Decimal; netCash: Decimal;
}
function text(value: string | undefined): string {
  if (!value?.trim()) throw new Error('Outside cash sources require actual complete payment identities and references.');
  return value.trim();
}
function amount(value: string | undefined): Decimal {
  if (value === undefined || !/^\d+(?:\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error('Outside cash, reimbursement or tax-payment amount is unknown or invalid.');
  return d(value);
}
function date(value: string | undefined): string {
  const actual = text(value), parsed = new Date(`${actual}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actual) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== actual) throw new Error('Outside cash source requires an actual calendar payment date.');
  return actual;
}

/** No credit or repayment becomes cash. A supplied ledger is validated even
 * when the previously supported zero-credit/zero-advance facts would suffice. */
export function calculateMarketplaceOutsideCashSources(plan: Plan, personId: string, record: OtherReturn, year: number): MarketplaceOutsideCashPayment[] | undefined {
  const expected = (plan.payments ?? []).flatMap(payment => (payment.personAmounts ?? []).filter(person => person.personId === personId).map(person => ({ payment, person })));
  const positiveAdvance = expected.some(({ person }) => amount(person.advancePremiumTaxCredit).gt(0));
  const packet = record.cashPaymentSources;
  if (!packet && amount(record.form8962Line24).isZero() && !positiveAdvance) return undefined;
  if (!packet || packet.sourceTaxYear !== year || packet.sourceFactsConfirmed !== true || packet.allPremiumPaymentsIncludedConfirmed !== true
    || packet.allOtherReturnTaxPaymentsIncludedConfirmed !== true || !packet.premiumPayments || !packet.otherReturnTaxPayments) throw new Error('Outside cash requires the confirmed complete original insurer, reimbursement and other-return tax-payment sources.');
  text(packet.sourceReference);
  const originalIds = new Set<string>(), expectedKeys = new Set<string>();
  for (const { payment, person } of expected) {
    const id = text(payment.sourceId), key = `${id}:${person.payer}`;
    if (expectedKeys.has(key)) throw new Error('Outside cash original payment and payer sources are duplicated.');
    expectedKeys.add(key); originalIds.add(id);
  }
  if (!expected.length || packet.premiumPayments.length !== expected.length) throw new Error('Outside cash sources must retain every original person/payer receipt exactly once.');
  const seen = new Set<string>(), transactionIds = new Set(originalIds);
  const payments = packet.premiumPayments.map(row => {
    const id = text(row.paymentSourceId), key = `${id}:${row.payer}`;
    const candidates = expected.filter(({ payment, person }) => payment.sourceId?.trim() === id && person.payer === row.payer);
    if (seen.has(key) || candidates.length !== 1 || !['owner_after_tax', 'business_paid_or_reimbursed'].includes(row.payer ?? '')) throw new Error('Outside cash source has a duplicate, unlinked or contradictory payment/payer.');
    seen.add(key);
    const original = candidates[0], actualDate = date(row.datePaid), grossCash = amount(row.cashPaidToInsurer);
    if (actualDate !== original.payment.datePaid || !actualDate.startsWith(`${year}-`) || original.payment.coverageTaxYear !== year
      || !grossCash.eq(amount(original.person.amountPaid))) throw new Error('Outside cash receipt date, year or cash amount contradicts the actual original payment.');
    const reference = text(row.sourceReference);
    if (!row.reimbursements) throw new Error('Outside cash reimbursement history is unknown; retain actual records or an explicitly empty list.');
    const reimbursements = sumSourceMoney(...row.reimbursements.map(refund => {
      const refundId = text(refund.sourceId);
      if (transactionIds.has(refundId)) throw new Error('Outside cash reimbursement/payment sources are duplicated.');
      transactionIds.add(refundId); text(refund.sourceReference);
      if (!date(refund.dateReceived).startsWith(`${year}-`)) throw new Error('Outside cash later-year reimbursement needs its separate recovery source method.');
      return amount(refund.amount);
    }));
    if (reimbursements.gt(grossCash)) throw new Error('Outside cash reimbursements exceed the original cash paid to the insurer.');
    return { paymentSourceId: id, personId, payer: row.payer!, datePaid: actualDate, sourceReference: reference, grossCash, reimbursements, netCash: sumSourceMoney(grossCash, reimbursements.negated()) };
  });
  for (const row of packet.otherReturnTaxPayments) {
    const id = text(row.sourceId);
    if (transactionIds.has(id)) throw new Error('Outside cash and other-return tax payment sources cannot be the same transaction.');
    transactionIds.add(id); date(row.datePaid); text(row.sourceReference); amount(row.amount);
  }
  return payments;
}
