// Spec: spec/federal/form-1099-q-in-kind-room-board.yaml. Derived source controls.
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { inKindRoomBoardFixture } from '../../fixtures/education-in-kind-room-board.js';

const calculate = (input: ReturnType<typeof inKindRoomBoardFixture>) => calculateForm1099Q(
  input.form1099Q ?? [], input.qualifiedEducationExpenses, { taxYear: input.taxpayer.taxYear });
function source(input = inKindRoomBoardFixture()) {
  const facts = input.qualifiedEducationExpenses?.sourceFacts;
  const expense = facts?.expenses?.[0], form = input.form1099Q?.[0], benefit = facts?.inKindBenefits?.[0], allocation = facts?.allocations?.[0];
  if (!facts || !expense || !form || !benefit || !allocation) throw new Error('Missing actual fixture source');
  return { input, facts, expense, form, benefit, allocation };
}
it('limits the original benefit using actual school costs', () => {
  for (const year of [2025, 2026]) {
    const { input, expense } = source(inKindRoomBoardFixture(year));
    for (const amount of ['4000', '10000']) {
      expense.amount = amount;
      const before = JSON.stringify(input), result = calculate(input);
      expect([result.grossDistribution, result.totalBasis, result.adjustedQEE, result.taxFreeEarnings,
        result.taxableEarnings, result.penaltyExceptionAmount, result.netPenalty].map(value => value.toFixed()))
        .toEqual(['4000', '3200', '3000', '600', '200', '0', '20']);
      expect(result.lines.find(line => line.line === 'prepaid:in-kind-provided')?.value.toFixed()).toBe('4000');
      expect(result.lines.find(line => line.line === 'prepaid:in-kind-allocation:tuition')?.value.toFixed()).toBe('4000');
      expect(result.lines.find(line => line.line === 'prepaid:in-kind-room-board:tuition')?.value.toFixed()).toBe('3000');
      expect(JSON.stringify(input)).toBe(before);
    }
    expense.schoolOwnedHousingCharge = '3500';
    const result = calculate(input);
    expect([result.taxFreeEarnings, result.taxableEarnings, result.netPenalty].map(value => value.toFixed())).toEqual(['700', '100', '10']);
    expense.schoolOwnedHousingCharge = '4000';
    expect(calculate(input).taxableEarnings.toFixed()).toBe('0');
  }
});
it('preserves enrollment zero and exact monetary boundaries', () => {
  for (const [allowance, halfTime, excluded, taxable, penalty] of [
    ['0', true, '0', '800', '80'], ['3000', false, '0', '800', '80'],
    ['2997.50', true, '600', '200', '20'], ['2997.49', true, '599', '201', '20'],
  ] as const) {
    const { input, expense } = source(); expense.roomBoardAllowance = allowance; expense.halfTimeStudent = halfTime;
    const result = calculate(input);
    expect([result.taxFreeEarnings, result.taxableEarnings, result.netPenalty].map(value => value.toFixed())).toEqual([excluded, taxable, penalty]);
  }
  const { input, expense, form, benefit, allocation } = source();
  form.grossDistribution = '9007199254740993.01'; form.basis = '9007199254740193.01';
  benefit.amount = form.grossDistribution; allocation.amount = form.grossDistribution; expense.amount = form.grossDistribution;
  expense.roomBoardAllowance = '6755399441055744.7575';
  const result = calculate(input);
  expect(result.grossDistribution.toFixed()).toBe('9007199254740993.01');
  expect(result.adjustedQEE.toFixed()).toBe('6755399441055744.7575');
  expect(result.taxFreeEarnings.toFixed()).toBe('600');
  expect(result.taxableEarnings.toFixed()).toBe('200');
});
it('rejects missing facts and unsupported partial source groups', () => {
  for (const mutation of ['half-time', 'allowance', 'housing', 'refund', 'assistance', 'credit', 'other', 'allocation', 'form', 'expense', 'year']) {
    const { input, facts, expense, form, allocation } = source(); expense.amount = '10000';
    if (mutation === 'half-time') expense.halfTimeStudent = undefined;
    if (mutation === 'allowance') expense.roomBoardAllowance = undefined;
    if (mutation === 'housing') expense.schoolOwnedHousingCharge = undefined;
    if (mutation === 'refund') expense.refundedAmount = '1';
    if (mutation === 'assistance') expense.taxFreeAssistance = '1';
    if (mutation === 'credit') expense.educationCreditAmount = '1';
    if (mutation === 'other') expense.otherTaxBenefitAmount = '1';
    if (mutation === 'allocation') allocation.amount = '3999';
    if (mutation === 'form') input.form1099Q?.push({ ...form, sourceId: 'cash', accountId: 'cash', distributionMedium: 'cash' });
    if (mutation === 'expense') facts.expenses?.push({ ...expense, id: 'second-expense' });
    if (mutation === 'year') expense.paidDate = '2025-08-15';
    expect(() => calculate(input)).toThrow(/actual|room|board|partial|in-kind|year|allocation/);
  }
  const { input, facts, expense, form, benefit } = source();
  input.form1099Q?.push({ ...form, sourceId: 'another', accountId: 'another', beneficiaryId: 'another' });
  facts.beneficiaries?.push({ id: 'another', studentTaxId: '222-33-4444', outsideK12QualifiedDistributions: '0' });
  facts.expenses?.push({ ...expense, id: 'another', beneficiaryId: 'another', roomBoardAllowance: '1000' });
  facts.inKindBenefits?.push({ ...benefit, id: 'another', sourceId: 'another', expenseId: 'another' });
  facts.allocations?.push({ sourceId: 'another', expenseId: 'another', amount: '4000', creditAmount: '0' });
  expect(calculate(input).perDistribution.map(row => row.taxFreeEarnings.toFixed())).toEqual(['600', '200']);
  if (!facts.beneficiaries?.[1]) throw new Error('Missing beneficiary');
  facts.beneficiaries[1].studentTaxId = undefined;
  expect(() => calculate(input)).toThrow(/actual.*beneficiar.*identit/);
});
