// Spec: spec/federal/marketplace-other-return-cash.yaml, exact-reimbursements,
// canonical-reimbursement-bound and canonical-cash-rounding.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal';
import { calculateMarketplaceOutsideCashSources } from '@/engine/forms/marketplace-outside-cash-sources';
import { positiveOtherReturnCashInput } from '../fixtures/marketplace-other-return-cash';

const tiny = '0.' + '0'.repeat(39) + '1';
function overRefund() {
  const source = positiveOtherReturnCashInput('cash');
  source.cashSources.premiumPayments[0].reimbursements = [
    { sourceId: 'precision-refund-one', dateReceived: '2025-12-31', amount: '99.' + '9'.repeat(40), sourceReference: 'Actual first exact refund' },
    { sourceId: 'precision-refund-two', dateReceived: '2025-12-31', amount: '0.' + '0'.repeat(39) + '2', sourceReference: 'Actual second exact refund' },
  ];
  return source;
}
it('compares exact reimbursement totals before reporting rounding', () => {
  const { input, cashSources } = overRefund(), before = structuredClone(input), precision = Decimal.precision;
  const plan = input.form7206!.plans![0], record = plan.coverageFamilySources!.outsidePersonReturns![0];
  expect(() => calculateMarketplaceOutsideCashSources(plan, 'outside', record, 2025)).toThrow(/reimbursements exceed/i);
  expect(input).toEqual(before); expect(Decimal.precision).toBe(precision);
  cashSources.premiumPayments[0].reimbursements.pop();
  expect(calculateMarketplaceOutsideCashSources(plan, 'outside', record, 2025)![0].netCash.toFixed()).toBe(tiny);
  cashSources.premiumPayments[0].reimbursements.push({ sourceId: 'precision-exact-zero', dateReceived: '2025-12-31', amount: tiny, sourceReference: 'Actual refund completes exact gross cash' });
  expect(calculateMarketplaceOutsideCashSources(plan, 'outside', record, 2025)![0].netCash.toFixed()).toBe('0');
  expect(Decimal.precision).toBe(precision);
});
it('rejects an exact excess reimbursement through the canonical return', () => {
  const { input } = overRefund(), before = structuredClone(input), precision = Decimal.precision;
  expect(() => calculateFederalTax(input)).toThrow(/reimbursements exceed/i);
  expect(input).toEqual(before); expect(Decimal.precision).toBe(precision);
});
it('preserves exact net cash through the canonical annual reporting boundary', () => {
  const { input, cashSources } = positiveOtherReturnCashInput('cash'), precision = Decimal.precision;
  for (const [index, receipt] of cashSources.premiumPayments.entries()) receipt.reimbursements = [
    { sourceId: `precision-reimbursement-${index}`, dateReceived: '2025-12-31', amount: index === 0 ? '99.5' : '100', sourceReference: 'Actual insurer refund by receipt' },
  ];
  cashSources.premiumPayments[0].reimbursements.push({ sourceId: 'precision-small-refund', dateReceived: '2025-12-31', amount: tiny, sourceReference: 'Actual separately recorded refund' });
  const before = structuredClone(input), expected = '5400.4' + '9'.repeat(39);
  const result = calculateFederalTax(input);
  expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe(expected);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('5400');
  expect(input).toEqual(before); expect(Decimal.precision).toBe(precision);
  input.form7206!.plans![0].payments!.reverse(); cashSources.premiumPayments.reverse();
  for (const receipt of cashSources.premiumPayments) receipt.reimbursements.reverse();
  expect(calculateFederalTax(input).schedule1!.seHealthInsurance.toFixed()).toBe('5400');
  cashSources.premiumPayments.find(receipt => receipt.reimbursements.some(row => row.sourceId === 'precision-small-refund'))!.reimbursements = [
    { sourceId: 'precision-exact-half', dateReceived: '2025-12-31', amount: '99.5', sourceReference: 'Actual exact half-dollar remaining cash' },
  ];
  expect(calculateFederalTax(input).schedule1!.seHealthInsurance.toFixed()).toBe('5401');
  expect(Decimal.precision).toBe(precision);
});
it('preserves exact outside net cash through the own repayment proof', () => {
  const { input, cashSources } = positiveOtherReturnCashInput('advance'), precision = Decimal.precision;
  for (const [index, receipt] of cashSources.premiumPayments.entries()) receipt.reimbursements = [
    { sourceId: `paid-precision-refund-${index}`, dateReceived: '2025-12-31', amount: index === 0 ? '99.5' : '100', sourceReference: 'Actual original insurer refund' },
  ];
  cashSources.premiumPayments[0].reimbursements.push({ sourceId: 'paid-small-refund', dateReceived: '2025-12-31', amount: tiny, sourceReference: 'Actual small refund' });
  const before = structuredClone(input), result = calculateFederalTax(input);
  expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('15600.4' + '9'.repeat(39));
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('15600');
  expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('12000');
  expect(input).toEqual(before);
  cashSources.premiumPayments[0].reimbursements.pop();
  expect(calculateFederalTax(input).schedule1!.seHealthInsurance.toFixed()).toBe('15601');
  expect(Decimal.precision).toBe(precision);
});
function nearlyReimbursed(mode: 'ordinary' | 'marriage') {
  const source = positiveOtherReturnCashInput(mode);
  for (const [index, receipt] of source.cashSources.premiumPayments.entries()) receipt.reimbursements = [
    { sourceId: `coordinated-refund-${index}`, dateReceived: '2025-12-31', amount: index === 0 ? '99.5' : receipt.cashPaidToInsurer!, sourceReference: 'Actual coordinated insurer refund' },
  ];
  source.cashSources.premiumPayments[0].reimbursements.push({ sourceId: 'coordinated-small-refund', dateReceived: '2025-12-31', amount: tiny, sourceReference: 'Actual small insurer refund' });
  return source;
}
it('preserves exact outside net cash through ordinary worksheet coordination', () => {
  const { input, cashSources } = nearlyReimbursed('ordinary'), before = structuredClone(input), precision = Decimal.precision;
  const result = calculateFederalTax(input);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('3000');
  expect(result.form7206!.sourceRecords.find(row => row.personId === 'outside')!.eligiblePremium.toFixed()).toBe('0.4' + '9'.repeat(39));
  expect(input).toEqual(before); expect(Decimal.precision).toBe(precision);
  cashSources.premiumPayments[0].reimbursements.pop();
  expect(calculateFederalTax(input).schedule1!.seHealthInsurance.toFixed()).toBe('3001');
});
it('retains exact outside cash in the actual marriage coordination sources', () => {
  const { input } = nearlyReimbursed('marriage'), before = structuredClone(input), precision = Decimal.precision;
  const result = calculateFederalTax(input);
  expect(result.form7206!.sourceRecords.find(row => row.personId === 'outside')!.eligiblePremium.toFixed()).toBe('0.4' + '9'.repeat(39));
  expect(result.schedule1!.seHealthInsurance.isInteger()).toBe(true);
  expect(input).toEqual(before); expect(Decimal.precision).toBe(precision);
});
