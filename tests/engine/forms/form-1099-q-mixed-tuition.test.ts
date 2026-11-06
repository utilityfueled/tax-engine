// Spec: spec/federal/form-1099-q-mixed-tuition.yaml.
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { mixedTuitionFixture } from '../../fixtures/education-mixed-tuition.js';

function required<T>(value: T | undefined): T { if (value === undefined) throw new Error('Missing fictional source'); return value; }
const calculate = (input: ReturnType<typeof mixedTuitionFixture>) => calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses,
  { taxYear: input.taxpayer.taxYear, taxpayer: input.taxpayer, educationExpenses: input.educationExpenses });
const values = (result: ReturnType<typeof calculate>) => [result.taxFreeEarnings, result.taxableEarnings, result.penaltyExceptionAmount, result.netPenalty].map(value => value.toFixed());

it('keeps actual prepaid cash and ESA amounts separate', () => {
  for (const year of [2025, 2026]) {
    const input = mixedTuitionFixture(year), before = structuredClone(input), result = calculate(input);
    expect(values(result)).toEqual(['1500', '1500', '200', '130']);
    expect(result.perDistribution.map(row => [row.sourceId, row.taxFreeEarnings.toFixed(), row.taxableEarnings.toFixed()]))
      .toEqual([['prepaid', '200', '600'], ['esa', '800', '400'], ['cash-qtp', '500', '500']]);
    expect(result.coverdellAccounts.map(row => [row.distributedBasis.toFixed(), row.earnings.toFixed(), row.endingBasis.toFixed()])).toEqual([['4800', '1200', '0']]);
    expect(input).toEqual(before);
    input.form1099Q.reverse(); required(input.qualifiedEducationExpenses?.sourceFacts?.allocations).reverse();
    expect(values(calculate(input))).toEqual(['1500', '1500', '200', '130']);
  }
});

it('retains the common ESA ratio beside distinct cash earnings', () => {
  const input = mixedTuitionFixture(2025, true), before = structuredClone(input), result = calculate(input);
  expect(values(result)).toEqual(['2067', '2033', '300', '173']);
  expect(result.perDistribution.map(row => row.taxFreeEarnings.toFixed())).toEqual(['200', '200', '467', '700', '500']);
  expect(input).toEqual(before);
});

it('preserves actual zero and rejects missing or conflicting source facts', () => {
  const zero = mixedTuitionFixture(), facts = required(zero.qualifiedEducationExpenses?.sourceFacts);
  required(facts.allocations?.find(row => row.sourceId === 'cash-qtp')).amount = '0';
  required(facts.allocations?.find(row => row.sourceId === 'esa')).amount = '5000';
  expect(values(calculate(zero))).toEqual(['1200', '1800', '200', '160']);
  for (const mutation of ['missing-allocation', 'unknown-medium', 'cash-benefit', 'cash-capacity', 'unknown-basis', 'duplicate-account', 'wrong-owner', 'wrong-year', 'one-cent', 'subcent', 'duplicate-allocation', 'unknown-confirmation']) {
    const input = mixedTuitionFixture(), sources = required(input.qualifiedEducationExpenses?.sourceFacts), allocations = required(sources.allocations);
    const cash = required(input.form1099Q.find(row => row.sourceId === 'cash-qtp'));
    const cashAllocation = required(allocations.find(row => row.sourceId === 'cash-qtp'));
    if (mutation === 'missing-allocation') sources.allocations = allocations.filter(row => row.sourceId !== 'cash-qtp');
    if (mutation === 'unknown-medium') cash.distributionMedium = undefined;
    if (mutation === 'cash-benefit') required(sources.inKindBenefits).push({ ...required(sources.inKindBenefits?.[0]), id: 'fabricated-cash-benefit', sourceId: 'cash-qtp', amount: '2000' });
    if (mutation === 'cash-capacity') { cashAllocation.amount = '2000.01'; required(allocations.find(row => row.sourceId === 'esa')).amount = '2999.99'; }
    if (mutation === 'unknown-basis') required(sources.coverdellAccounts?.[0]).priorYearBasis = undefined;
    if (mutation === 'duplicate-account') cash.accountId = input.form1099Q[0]?.accountId;
    if (mutation === 'wrong-owner') cash.recipientOwner = 'spouse';
    if (mutation === 'wrong-year') cash.taxYear = 2026;
    if (mutation === 'one-cent') cashAllocation.amount = '1000.01';
    if (mutation === 'subcent') cashAllocation.amount = '1000.00000000000000000001';
    if (mutation === 'duplicate-allocation') allocations.push({ ...cashAllocation });
    if (mutation === 'unknown-confirmation') cash.sourceFactsConfirmed = undefined;
    const before = structuredClone(input);
    expect(() => calculate(input), mutation).toThrow();
    expect(input).toEqual(before);
  }
});
