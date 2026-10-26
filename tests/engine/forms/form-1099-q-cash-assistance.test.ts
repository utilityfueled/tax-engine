// Spec: spec/federal/form-1099-q-cash-assistance.yaml.
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { cashAssistanceFixture, requiredCashAssistance as required } from '../../fixtures/education-cash-assistance.js';

const calculate = (input: ReturnType<typeof cashAssistanceFixture>) => calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses,
  { taxYear: input.taxpayer.taxYear, taxpayer: input.taxpayer, educationExpenses: input.educationExpenses });
const amounts = (result: ReturnType<typeof calculate>) => [result.taxFreeEarnings, result.taxableEarnings, result.penaltyExceptionAmount, result.netPenalty].map(value => value.toFixed());

it('applies actual prepaid tuition before the cash expense remainder', () => {
  for (const year of [2025, 2026]) {
    const input = cashAssistanceFixture(year), before = structuredClone(input), result = calculate(input);
    expect(amounts(result)).toEqual(['1825', '975', '225', '75']);
    expect(result.perDistribution.map(row => [row.sourceId, row.adjustedQEE.toFixed(), row.taxFreeEarnings.toFixed(), row.taxableEarnings.toFixed()]))
      .toEqual([['prepaid', '3500', '700', '100'], ['cash-qtp', '4500', '1125', '875']]);
    expect(input).toEqual(before);
    input.form1099Q.reverse(); required(input.qualifiedEducationExpenses?.sourceFacts?.allocations).reverse();
    expect(amounts(calculate(input))).toEqual(['1825', '975', '225', '75']);
  }
});

it('preserves distinct receipts and an actual zero cash allocation', () => {
  const distinct = cashAssistanceFixture(), facts = required(distinct.qualifiedEducationExpenses?.sourceFacts);
  const expense = required(facts.expenses?.[0]), benefit = required(facts.inKindBenefits?.[0]);
  distinct.form1099Q.push(...distinct.form1099Q.map(form => ({ ...form, sourceId: `${form.sourceId}-second`, accountId: `${form.accountId}-second` })));
  required(facts.expenses).push({ ...expense, id: 'tuition-second' });
  required(facts.inKindBenefits).push({ ...benefit, id: 'benefit-second', sourceId: 'prepaid-second', expenseId: 'tuition-second' });
  required(facts.allocations).push(
    { sourceId: 'prepaid-second', expenseId: 'tuition-second', amount: '3500', creditAmount: '500' },
    { sourceId: 'cash-qtp-second', expenseId: 'tuition-second', amount: '4500', creditAmount: '500' },
    { sourceId: 'cash-qtp-second', expenseId: expense.id, amount: '0', creditAmount: '0' },
    { sourceId: 'cash-qtp', expenseId: 'tuition-second', amount: '0', creditAmount: '0' });
  required(distinct.educationExpenses?.llcStudents?.[0]).qualifiedExpenses = '2000';
  if (distinct.educationExpenses) distinct.educationExpenses.llcExpenses = '2000';
  expect(amounts(calculate(distinct))).toEqual(['3650', '1950', '450', '150']);

  const zero = cashAssistanceFixture(), zeroFacts = required(zero.qualifiedEducationExpenses?.sourceFacts);
  Object.assign(required(zeroFacts.expenses?.[0]), { amount: '4000', educationCreditAmount: '0' });
  Object.assign(required(zeroFacts.allocations?.[0]), { amount: '3000', creditAmount: '0' });
  Object.assign(required(zeroFacts.allocations?.[1]), { amount: '0', creditAmount: '0' });
  zero.educationExpenses = undefined;
  expect(amounts(calculate(zero))).toEqual(['600', '2200', '0', '220']);
});

it('rejects unknown or conflicting assistance and original source allocations', () => {
  for (const kind of ['missing-cash', 'unknown-assistance', 'unknown-medium', 'cash-benefit', 'capacity', 'wrong-owner', 'wrong-year', 'duplicate-account', 'cent', 'subcent', 'balanced-prepaid-reassignment']) {
    const input = cashAssistanceFixture(), facts = required(input.qualifiedEducationExpenses?.sourceFacts);
    const cash = required(input.form1099Q[1]), allocations = required(facts.allocations), cashAllocation = required(allocations[1]);
    if (kind === 'missing-cash') facts.allocations = [required(allocations[0])];
    if (kind === 'unknown-assistance') required(facts.expenses?.[0]).taxFreeAssistance = undefined;
    if (kind === 'unknown-medium') cash.distributionMedium = undefined;
    if (kind === 'cash-benefit') required(facts.inKindBenefits).push({ ...required(facts.inKindBenefits?.[0]), id: 'fake-cash-benefit', sourceId: 'cash-qtp' });
    if (kind === 'capacity') { cash.grossDistribution = '4999.99'; cash.basis = '2999.99'; }
    if (kind === 'wrong-owner') cash.recipientOwner = 'spouse';
    if (kind === 'wrong-year') cash.taxYear = 2026;
    if (kind === 'duplicate-account') cash.accountId = input.form1099Q[0]?.accountId;
    if (kind === 'cent') cashAllocation.amount = '4500.01';
    if (kind === 'subcent') cashAllocation.amount = '4500.00000000000000000000000000000000000000001';
    if (kind === 'balanced-prepaid-reassignment') { required(allocations[0]).amount = '3000'; cashAllocation.amount = '5000'; }
    const before = structuredClone(input);
    expect(() => calculate(input), kind).toThrow(); expect(input).toEqual(before);
  }
});
