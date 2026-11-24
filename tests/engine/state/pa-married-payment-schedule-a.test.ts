/** Spec: state/pa-married-payment-sources.yaml, federal-schedule-a-5a. */
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculatePAMarriedOrdinaryReturn, snapshotPAMarriedOrdinaryOriginals } from '@/engine/state/pa-married-ordinary-return.js';
import { AdjustmentsSchema, type TaxYearInput } from '@/models/inputs.js';
import { PAMarriedOrdinarySourcesSchema } from '@/models/pa-married-ordinary-sources.js';
import { paMarriedPaymentsFixture } from '../../fixtures/pa-married-payments.js';

function fixture(options?: Parameters<typeof paMarriedPaymentsFixture>[0], deductionElection: TaxYearInput['deductionElection'] = 'itemized') {
  const { input, sources: raw } = paMarriedPaymentsFixture(options);
  input.deductionElection = deductionElection;
  const sources = PAMarriedOrdinarySourcesSchema.parse(raw);
  sources.originalFederalSources = snapshotPAMarriedOrdinaryOriginals(input);
  return { ...input, paMarriedOrdinarySources: sources };
}

function actualLine5a(input: ReturnType<typeof fixture>) {
  return calculateFederalTax(input).scheduleA?.lines.find(line => line.form === 'Sched A' && line.line === '5a')?.value.toFixed();
}

it('uses distinct verified owner receipts in the actual joint federal cash year', () => {
  const input = fixture({ primaryEstimates: ['80.49', '99.25', '10.01', '70.02'], primaryExtension: '0', priorCredit: '0', refunds: ['260', '80'] });
  const before = structuredClone(input);
  const pa = calculatePAMarriedOrdinaryReturn(input, input.paMarriedOrdinarySources);

  expect(pa.returns.map(row => row.pa40.estimatedPayments.toFixed())).toEqual(['260', '80']);
  expect(actualLine5a(input)).toBe('2726.24'); // $2,456 withheld + $270.24 paid in 2025.
  expect(input).toEqual(before);
});

it('includes a verified prior refund election and excludes the following-year extension', () => {
  const input = fixture();
  const pa = calculatePAMarriedOrdinaryReturn(input, input.paMarriedOrdinarySources);

  expect(pa.returns.map(row => row.pa40.netOverpayment.toFixed())).toEqual(['327', '80']);
  expect(actualLine5a(input)).toBe('2786.49'); // $279.99 paid in 2025 + $50.50 prior refund applied.
  expect(calculateFederalTax(input).deductionAmount.toFixed()).toBe('2786');
});

it('compares the verified total under automatic itemization and preserves an explicit standard election', () => {
  const options = { primaryEstimates: ['33000.25'], primaryExtension: '0', priorCredit: '0', refunds: ['33000', '80'] };
  const automatic = calculateFederalTax(fixture(options, 'automatic'));
  expect(automatic.deductionUsed).toBe('itemized');
  expect(automatic.deductionAmount.toFixed()).toBe('35537');

  const standard = calculateFederalTax(fixture(options, 'standard'));
  expect(standard.deductionUsed).toBe('standard');
  expect(standard.deductionAmount.toFixed()).toBe('34700');
});

it('holds stale, duplicate or competing original sources in canonical federal calculation', () => {
  const stale = fixture();
  stale.w2s[0].employer.name = 'Changed source with equal wages';
  expect.soft(() => calculateFederalTax(stale)).toThrow(/original household snapshot/);

  const duplicate = fixture();
  const account = duplicate.paMarriedOrdinarySources.paymentSources?.accounts[0];
  if (!account) throw new Error('Fictional verified payment account is required.');
  const owner = duplicate.paMarriedOrdinarySources.owners[0];
  const receipt = structuredClone(account.receipts[0]);
  receipt.sourceReference += ' copied';
  account.receipts.push(receipt);
  account.originalAccount.receipts.push(structuredClone(receipt.original));
  owner.payments.originalReceipts.push(structuredClone(receipt.original));
  expect.soft(() => calculateFederalTax(duplicate)).toThrow(/duplicate actual receipt/);

  const competing = fixture();
  competing.adjustments = AdjustmentsSchema.parse({ estimatedTaxPayments: [{ state: 'PA', type: 'state', amount: '100.25', date: '2025-04-15' }] });
  competing.paMarriedOrdinarySources.originalFederalSources = snapshotPAMarriedOrdinaryOriginals(competing);
  expect.soft(() => calculateFederalTax(competing)).toThrow(/retained adjustments sources/);
});
