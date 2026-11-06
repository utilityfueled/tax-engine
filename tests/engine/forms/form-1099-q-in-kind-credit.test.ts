// Spec: spec/federal/form-1099-q-in-kind-credit.yaml. Derived source controls.
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { Form1099QSchema } from '@/models/inputs.js';
import { inKindCreditFixture } from '../../fixtures/education-in-kind-credit.js';

const calculate = (input: ReturnType<typeof inKindCreditFixture>) => calculateForm1099Q(
  input.form1099Q ?? [], input.qualifiedEducationExpenses,
  { taxYear: input.taxpayer.taxYear, educationExpenses: input.educationExpenses });

it('coordinates actual tuition credits with the reported in-kind distribution', () => {
  for (const year of [2025, 2026]) {
    const input = inKindCreditFixture(year), before = JSON.stringify(input), result = calculate(input);
    expect([result.grossDistribution, result.totalBasis, result.adjustedQEE, result.taxFreeEarnings,
      result.taxableEarnings, result.penaltyExceptionAmount, result.netPenalty].map(value => value.toFixed()))
      .toEqual(['4000', '3200', '3000', '600', '200', '200', '0']);
    expect(result.lines.find(line => line.line === 'prepaid:in-kind-provided')?.value.toFixed()).toBe('4000');
    expect(result.lines.find(line => line.line === 'tuition:after-in-kind')?.value.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
  }
  for (const [credit, allocated, excluded, taxable] of [['0', '4000', '800', '0'], ['4000', '0', '0', '800'], ['1002.50', '2997.50', '600', '200'], ['1002.51', '2997.49', '599', '201']]) {
    const input = inKindCreditFixture(), facts = input.qualifiedEducationExpenses?.sourceFacts;
    const expense = facts?.expenses?.[0], allocation = facts?.allocations?.[0], student = input.educationExpenses?.llcStudents?.[0];
    if (!expense || !allocation || !student || !input.educationExpenses) throw new Error('Missing source');
    expense.educationCreditAmount = credit; allocation.amount = allocated; allocation.creditAmount = credit;
    student.qualifiedExpenses = credit; input.educationExpenses.llcExpenses = credit;
    const result = calculate(input);
    expect(result.taxFreeEarnings.toFixed()).toBe(excluded); expect(result.taxableEarnings.toFixed()).toBe(taxable);
    expect(result.penaltyExceptionAmount.toFixed()).toBe(taxable); expect(result.netPenalty.toFixed()).toBe('0');
  }
});

it('retains cash capacity after an actual credit-reduced benefit', () => {
  const input = inKindCreditFixture(), facts = input.qualifiedEducationExpenses?.sourceFacts;
  const expense = facts?.expenses?.[0], source = input.form1099Q?.[0];
  if (!facts || !expense || !source || !input.form1099Q || !facts.allocations) throw new Error('Missing source');
  expense.amount = '8000';
  input.form1099Q.push(Form1099QSchema.parse({ ...source, sourceId: 'cash', accountId: 'cash-account',
    distributionMedium: 'cash', grossDistribution: '4000', earnings: '1000', basis: '3000' }));
  facts.allocations.push({ sourceId: 'cash', expenseId: expense.id, amount: '4000', creditAmount: '0' });
  for (const forms of [input.form1099Q, [...input.form1099Q].reverse()]) {
    const result = calculate({ ...input, form1099Q: forms });
    expect(result.taxFreeEarnings.toFixed()).toBe('1600'); expect(result.taxableEarnings.toFixed()).toBe('200');
    expect(result.lines.find(line => line.line === 'tuition:after-in-kind')?.value.toFixed()).toBe('4000');
  }
  const cashAllocation = facts.allocations[1]; if (!cashAllocation) throw new Error('Missing cash allocation');
  cashAllocation.amount = '4000.01';
  expect(() => calculate(input)).toThrow(/available expense/);
});

it('rejects invented or inconsistent benefit credit allocations', () => {
  for (const mutation of ['partial', 'excess', 'missing-credit', 'unqualified', 'unknown', 'category', 'year', 'student']) {
    const input = inKindCreditFixture(), facts = input.qualifiedEducationExpenses?.sourceFacts;
    const expense = facts?.expenses?.[0], allocation = facts?.allocations?.[0], benefit = facts?.inKindBenefits?.[0];
    if (!expense || !allocation || !benefit) throw new Error('Missing source');
    if (mutation === 'partial') allocation.amount = '2999.99';
    if (mutation === 'excess') allocation.amount = '3000.01';
    if (mutation === 'missing-credit') allocation.creditAmount = undefined;
    if (mutation === 'unqualified') { expense.qualificationConfirmed = false; benefit.qualificationConfirmed = false; }
    if (mutation === 'unknown') benefit.qualificationConfirmed = undefined;
    if (mutation === 'category') expense.category = 'k12_tuition';
    if (mutation === 'year') benefit.providedDate = '2025-08-15';
    if (mutation === 'student') input.educationExpenses = { aocStudents: [], llcExpenses: '0' };
    expect(() => calculate(input)).toThrow(/actual|in-kind|benefit|qualification|credit|allocation/);
  }
});
