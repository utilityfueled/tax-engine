// Spec: spec/federal/marketplace-reported-repayment-payment.yaml.
// Isolated indexed2026 calculation; production gates stay unchanged.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateMarketplaceReportedRepaymentPayment } from '@/engine/forms/marketplace-reported-repayment-payment.js';
import { marketplaceReportedRepaymentInput } from '../fixtures/marketplace-reported-repayment.js';
it('checks final2026 credit after actual reported payment', () => {
  const input = marketplaceReportedRepaymentInput(false, false, 2026); input.scheduleC!.grossReceipts = '150000';
  const result = calculateFederalTax(input);
  expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
  expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('12006');
  expect(result.marketplaceReportedRepaymentHealth!.reportingExcess.toFixed()).toBe('0.12');
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('18000');
  const credit = result.form8962;
  if (!credit) throw new Error('Expected Form 8962 for reported repayment');
  const repaymentRows = credit.lines.filter(row => row.form === 'Form 8962' && ['26', '27', '28', '29'].includes(row.line));
  expect(repaymentRows.map(row => [row.line, row.value.toFixed()])).toEqual([['27', '12006']]);
  expect(result.allLines.filter(row => row.form === 'Sched 2' && row.line === '1a').map(row => row.value.toFixed())).toEqual(['12006']);
  expect(calculateMarketplaceReportedRepaymentPayment(input, result).finalRepayment.toFixed()).toBe('12006');
  const [repayment] = repaymentRows;
  if (!repayment) throw new Error('Expected one Form 8962 repayment row');
  credit.lines.push(repayment);
  expect(() => calculateMarketplaceReportedRepaymentPayment(input, result)).toThrow(/audit/);
  credit.lines.pop();
  credit.lines.push({ ...repayment, line: '29' });
  expect(() => calculateMarketplaceReportedRepaymentPayment(input, result)).toThrow(/audit/);

  const small = marketplaceReportedRepaymentInput(false, true, 2026);
  if (!small.scheduleC) throw new Error('Expected Schedule C for the rounded-zero fixture');
  small.scheduleC.grossReceipts = '150000';
  const zero = calculateFederalTax(small);
  const zeroCredit = zero.form8962;
  if (!zeroCredit) throw new Error('Expected Form 8962 for rounded-zero repayment');
  expect(zeroCredit.excessAPTCRepayment.toFixed()).toBe('0');
  const zeroRows = zeroCredit.lines.filter(row => row.form === 'Form 8962' && ['26', '27', '28', '29'].includes(row.line));
  expect(zeroRows.map(row => [row.line, row.value.toFixed()])).toEqual([['26', '0']]);
  expect(zeroRows[0]?.formula).toBe('Lines 24 and 25 are equal');
  expect(calculateMarketplaceReportedRepaymentPayment(small, zero).finalRepayment.toFixed()).toBe('0');

  const lower = marketplaceReportedRepaymentInput(false, false, 2026); lower.scheduleC!.grossReceipts = '100000';
  expect(() => calculateFederalTax(lower)).toThrow(/zero credit/);
});
