// Spec: spec/federal/claim-of-right.yaml guide.
import { expect, it } from 'vitest';
import { buildGovernmentPaymentSourceRecords } from '@/lib/guided-government-payment-inputs';
import { unemploymentFactErrors, type UnemploymentEntryData } from '@/lib/guided-unemployment-facts';
import type { UnemploymentData } from '@/lib/guided-interview-flow';
import { unemploymentSource } from './guided-unemployment-source-facts.test';

const facts = { priorRepaymentOriginalYear: '2024', priorRepaymentEarlierTax: '12,000', priorRepaymentRefiguredTax: '10,900', priorRepaymentReference: 'Fictional earlier return', priorRepaymentConfirmed: true };
const errors = (entry: Partial<UnemploymentEntryData>) => unemploymentFactErrors({ entries: [{ ...unemploymentSource, ...entry }] } as UnemploymentData, 'single', 2025);

it('collects earlier return facts only for a positive repayment', () => {
  expect(errors({ priorYearRepaid: '0' })).toEqual({});
  expect(errors({ priorYearRepaid: '5,000', ...facts })).toEqual({});
  for (const patch of [{ priorRepaymentConfirmed: null }, { priorRepaymentReference: ' ' }, { priorRepaymentOriginalYear: '' }, { priorRepaymentEarlierTax: '' }, { priorRepaymentRefiguredTax: '' }]) {
    expect(Object.keys(errors({ priorYearRepaid: '5000', ...facts, ...patch })), JSON.stringify(patch)).not.toHaveLength(0);
  }
  const built = buildGovernmentPaymentSourceRecords([{ ...unemploymentSource, priorYearRepaid: '5,000', ...facts } as UnemploymentEntryData], 'primary' as never);
  expect(JSON.stringify(built)).toContain('"earlierReturnTax":"12000"');
  expect(JSON.stringify(built)).toContain('"originalTaxYear":2024');
});
