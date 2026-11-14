// Spec: spec/federal/form-1099-da-market-discount-independent.yaml.
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateForm1099DASources } from '@/engine/forms/form-1099-da-sources.js';
import { calculateScheduleB } from '@/engine/schedules/schedule-b.js';
import { marketDiscountInput } from '../../fixtures/form-1099-da-market-discount.js';

it('allocates four literal gains and losses without manufacturing interest', () => {
  for (const [proceeds, interest, capital] of [
    ['1500', '200', '300'], ['1100', '100', '0'],
    ['1000', '0', '0'], ['900', '0', '-100'],
  ] as const) {
    const input = marketDiscountInput(proceeds, '1000', '200');
    const actual = calculateForm1099DASources(input);
    expect(actual.marketDiscountInterest.toFixed(), proceeds).toBe(interest);
    const transaction = actual.capitalForms[0]!.transactions[0]!;
    expect(new Decimal(transaction.proceeds).minus(transaction.costBasis)
      .plus(transaction.adjustments ?? '0').toFixed(), proceeds).toBe(capital);
    expect(transaction.adjustmentCodes, proceeds).toBe(interest === '0' ? undefined : 'D');
    expect(calculateScheduleB(input).taxableInterest.toFixed(), proceeds).toBe(interest);
  }
});
