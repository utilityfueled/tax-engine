// Spec: spec/federal/claim-of-right.yaml guide.
import { expect, it } from 'vitest';
import { buildGovernmentPaymentSourceRecords } from '@/lib/guided-government-payment-inputs';
import { unemploymentFactErrors, type UnemploymentEntryData } from '@/lib/guided-unemployment-facts';
import type { UnemploymentData } from '@/lib/guided-interview-flow';
import { unemploymentSource } from './guided-unemployment-source-facts.test';

const facts = { priorRepaymentOriginalYear: '2024', priorRepaymentEarlierTax: '12,000', priorRepaymentRefiguredTax: '10,900', priorRepaymentReference: 'Fictional earlier return', priorRepaymentConfirmed: true, priorRepaymentSeparateReturn: false };
const errors = (entry: Partial<UnemploymentEntryData>) => unemploymentFactErrors({ entries: [{ ...unemploymentSource, ...entry }] } as UnemploymentData, 'single', 2025);

it('collects earlier return facts only for a positive repayment', () => {
  expect(errors({ priorYearRepaid: '0' })).toEqual({});
  expect(errors({ priorYearRepaid: '5,000', ...facts })).toEqual({});
  for (const patch of [{ priorRepaymentConfirmed: null }, { priorRepaymentReference: ' ' }, { priorRepaymentOriginalYear: '' }, { priorRepaymentEarlierTax: '' }, { priorRepaymentRefiguredTax: '' }]) {
    expect(Object.keys(errors({ priorYearRepaid: '5000', ...facts, ...patch })), JSON.stringify(patch)).not.toHaveLength(0);
  }
  for (const patch of [{ priorRepaymentOriginalYear: '2025' }, { priorRepaymentOriginalYear: '1999' }, { priorRepaymentRefiguredTax: '13,000' }, { priorRepaymentSeparateReturn: null }]) {
    expect(Object.keys(errors({ priorYearRepaid: '5000', ...facts, ...patch })), JSON.stringify(patch)).not.toHaveLength(0);
  }
  const pair = (second: Partial<UnemploymentEntryData>) => unemploymentFactErrors({ entries: [{ ...unemploymentSource, priorYearRepaid: '2000', ...facts }, { ...unemploymentSource, accountReference: 'second', priorYearRepaid: '2000', ...facts, ...second }] } as UnemploymentData, 'single', 2025);
  expect(pair({})).toEqual({});
  expect(Object.keys(pair({ priorRepaymentRefiguredTax: '10,000' })).join()).toContain('prior-repayment-figures');
  expect(JSON.stringify(buildGovernmentPaymentSourceRecords([{ ...unemploymentSource, priorYearRepaid: '0', priorRepaymentReference: 'stale', priorRepaymentEarlierTax: 'bad' } as UnemploymentEntryData]))).not.toContain('priorYearRepaymentSource');
  const built = buildGovernmentPaymentSourceRecords([{ ...unemploymentSource, priorYearRepaid: '5,000', ...facts } as UnemploymentEntryData]);
  expect(JSON.stringify(built)).toContain('"earlierReturnTax":"12000"');
  expect(JSON.stringify(built)).toContain('"originalTaxYear":2024');
});
