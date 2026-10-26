// Spec: spec/federal/form-1099-q-multiple-expense-esa.yaml.
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { multipleEsaFixture } from '../../fixtures/education-multiple-esa.js';

const calculate = (input: ReturnType<typeof multipleEsaFixture>) => calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses,
  { taxYear: input.taxpayer.taxYear, taxpayer: input.taxpayer, educationExpenses: input.educationExpenses });
const values = (input: ReturnType<typeof multipleEsaFixture>) => {
  const result = calculate(input);
  return [result.taxFreeEarnings, result.taxableEarnings, result.penaltyExceptionAmount, result.netPenalty].map(value => value.toFixed());
};

it('uses the actual multiple-expense election with distinct earnings ratios', () => {
  for (const year of [2025, 2026]) {
    const input = multipleEsaFixture(year), before = JSON.stringify(input);
    expect(values(input)).toEqual(['1650', '950', '200', '75']);
    expect(calculate(input).perDistribution.map(row => [row.taxFreeEarnings, row.taxableEarnings, row.creditException].map(value => value.toFixed())))
      .toEqual([['300', '500', '200'], ['1350', '450', '0']]);
    expect(JSON.stringify(input)).toBe(before);
    const reversed = structuredClone(input), facts = reversed.qualifiedEducationExpenses!.sourceFacts!;
    reversed.form1099Q.reverse(); facts.expenses!.reverse(); facts.inKindBenefits!.reverse(); facts.allocations!.reverse();
    expect(values(reversed)).toEqual(['1650', '950', '200', '75']);
    const allocations = input.qualifiedEducationExpenses!.sourceFacts!.allocations!;
    allocations[0]!.amount = '1500'; allocations[1]!.amount = '2000';
    expect(values(input)).toEqual(['1600', '1000', '200', '80']);
    allocations[0]!.amount = '0'; allocations[1]!.amount = '3500'; allocations[2]!.amount = '0'; allocations[3]!.amount = '2500';
    expect(values(input)).toEqual(['1800', '800', '200', '60']);
  }
});

it('rejects incomplete or conflicting original expense groups', () => {
  const mutations = ['one-cent', 'credit', 'aggregate-esa', 'benefit-cost', 'missing-benefit', 'missing-allocation',
    'duplicate-expense', 'duplicate-benefit', 'unknown-assistance', 'unknown-refund', 'recipient', 'year', 'extra-source', 'category'];
  for (const mutation of mutations) {
    const input = multipleEsaFixture(), facts = input.qualifiedEducationExpenses!.sourceFacts!;
    const expenses = facts.expenses!, allocations = facts.allocations!, benefits = facts.inKindBenefits!;
    if (mutation === 'one-cent') allocations[3]!.amount = '2000.01';
    if (mutation === 'credit') allocations[2]!.creditAmount = '499.99';
    if (mutation === 'aggregate-esa') { expenses[0]!.amount = '6500'; allocations[1]!.amount = '4500'; }
    if (mutation === 'benefit-cost') { benefits[0]!.amount = '3501'; benefits[1]!.amount = '499'; expenses[0]!.amount = '3500'; allocations[1]!.amount = '1500'; }
    if (mutation === 'missing-benefit') benefits.pop();
    if (mutation === 'missing-allocation') allocations.pop();
    if (mutation === 'duplicate-expense') expenses[1]!.id = expenses[0]!.id;
    if (mutation === 'duplicate-benefit') benefits[1]!.id = benefits[0]!.id;
    if (mutation === 'unknown-assistance') expenses[1]!.taxFreeAssistance = undefined;
    if (mutation === 'unknown-refund') expenses[1]!.refundedAmount = undefined;
    if (mutation === 'recipient') { input.form1099Q[1]!.recipientOwner = 'other'; input.form1099Q[1]!.recipientId = 'different-person'; }
    if (mutation === 'year') input.form1099Q[1]!.taxYear = 2026;
    if (mutation === 'extra-source') input.form1099Q.push({ ...input.form1099Q[1]!, sourceId: 'extra', accountId: 'another-account' });
    if (mutation === 'category') expenses[1]!.category = 'postsecondary_room_board';
    expect(() => calculate(input), mutation).toThrow();
  }
});
