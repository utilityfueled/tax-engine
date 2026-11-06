// Spec: spec/federal/form-1099-q-in-kind-assistance.yaml.
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { inKindAssistanceFixture } from '../../fixtures/education-in-kind-assistance.js';

function calculate(input = inKindAssistanceFixture()) {
  return calculateForm1099Q(input.form1099Q ?? [], input.qualifiedEducationExpenses, { taxYear: input.taxpayer.taxYear, taxpayer: input.taxpayer });
}
it('preserves original tuition and exact assistance reductions', () => {
  const input = inKindAssistanceFixture(), before = JSON.stringify(input);
  const result = calculate(input);
  expect([result.adjustedQEE, result.taxFreeEarnings, result.taxableEarnings, result.netPenalty].map(value => value.toFixed())).toEqual(['3000', '600', '200', '20']);
  expect(JSON.stringify(input)).toBe(before);
  for (const [assistance, allocation, excluded, taxable] of [['0','4000','800','0'],['1002.50','2997.50','600','200'],['1002.51','2997.49','599','201']]) {
    const changed = inKindAssistanceFixture(), facts = changed.qualifiedEducationExpenses?.sourceFacts;
    if (!facts?.expenses?.[0] || !facts.allocations?.[0]) throw new Error('Missing source');
    facts.expenses[0].taxFreeAssistance = assistance; facts.allocations[0].amount = allocation;
    expect([calculate(changed).taxFreeEarnings.toFixed(),calculate(changed).taxableEarnings.toFixed()]).toEqual([excluded,taxable]);
  }
});
it('uses only separately supplied additional-tax exception evidence', () => {
  const input = inKindAssistanceFixture(), facts = input.qualifiedEducationExpenses?.sourceFacts;
  if (!facts) throw new Error('Missing source');
  expect(calculate(input).netPenalty.toFixed()).toBe('20');
  facts.penaltyExceptions = [{ id:'actual-scholarship', sourceId:'prepaid', kind:'scholarship', qualifyingAmount:'1000', distributionAmount:'1000', eligibilityConfirmed:true }];
  const result = calculate(input);
  expect([result.taxableEarnings,result.penaltyExceptionAmount,result.netPenalty].map(value => value.toFixed())).toEqual(['200','200','0']);
  facts.penaltyExceptions[0].eligibilityConfirmed = false;
  expect(calculate(input).netPenalty.toFixed()).toBe('20');
  facts.penaltyExceptions[0].eligibilityConfirmed = undefined;
  expect(() => calculate(input)).toThrow(/eligib|exception|confirm/);
});
it('rejects unbound or mixed assistance source groups', () => {
  for (const field of ['refundedAmount','educationCreditAmount','otherTaxBenefitAmount'] as const) {
    const input = inKindAssistanceFixture(), expense = input.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0];
    if (!expense) throw new Error('Missing source'); expense[field] = '1';
    expect(() => calculate(input)).toThrow(field === 'refundedAmount'
      ? 'Ordinary education actual complete refund history is required' : /in-kind|assistance|allocation/);
  }
  const missing = inKindAssistanceFixture(), missingExpense = missing.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0];
  if (!missingExpense) throw new Error('Missing source'); missingExpense.taxFreeAssistance = undefined;
  expect(() => calculate(missing)).toThrow(/actual|assistance|in-kind/);
  const larger = inKindAssistanceFixture(), largerExpense = larger.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0];
  if (!largerExpense) throw new Error('Missing source'); largerExpense.amount = '8000';
  expect(() => calculate(larger)).toThrow(/in-kind|assistance|allocation/);
  for (const mutation of ['extra-expense', 'cash-source', 'esa-source', 'duplicate-benefit', 'unknown-refund', 'unqualified']) {
    const changed = inKindAssistanceFixture(), group = changed.qualifiedEducationExpenses?.sourceFacts;
    const source = changed.form1099Q[0], expense = group?.expenses?.[0], benefit = group?.inKindBenefits?.[0];
    if (!group || !source || !expense || !benefit) throw new Error('Missing source');
    if (mutation === 'extra-expense') group.expenses?.push({...expense,id:'second',amount:'1',taxFreeAssistance:'0'});
    if (mutation === 'cash-source' || mutation === 'esa-source') changed.form1099Q.push({...source,sourceId:'second',accountId:'second',
      distributionMedium:'cash',accountType:mutation === 'cash-source' ? '529' : 'coverdell_esa'});
    if (mutation === 'duplicate-benefit') { benefit.amount = '2000'; group.inKindBenefits?.push({...benefit,id:'second'}); }
    if (mutation === 'unknown-refund') expense.refundedAmount = undefined;
    if (mutation === 'unqualified') { expense.qualificationConfirmed = false; benefit.qualificationConfirmed = false; }
    expect(() => calculate(changed)).toThrow(mutation === 'unknown-refund'
      ? 'Ordinary education actual refund amount is missing' : /in-kind|assistance|allocation/);
  }
  const alias = inKindAssistanceFixture(), facts = alias.qualifiedEducationExpenses?.sourceFacts;
  const form = alias.form1099Q[0], student = facts?.beneficiaries?.[0], expense = facts?.expenses?.[0], benefit = facts?.inKindBenefits?.[0];
  if (!facts || !form || !student || !expense || !benefit) throw new Error('Missing source');
  facts.beneficiaries?.push({...student,id:'alias'}); alias.form1099Q.push({...form,sourceId:'alias',accountId:'alias',beneficiaryId:'alias'});
  facts.expenses?.push({...expense,id:'alias',beneficiaryId:'alias'}); facts.inKindBenefits?.push({...benefit,id:'alias',sourceId:'alias',expenseId:'alias'});
  facts.allocations?.push({sourceId:'alias',expenseId:'alias',amount:'3000',creditAmount:'0'});
  expect(() => calculate(alias)).toThrow(/beneficiar.*identit|student.*identit/);
  const secondStudent = facts.beneficiaries?.[1], secondForm = alias.form1099Q[1];
  if (!secondStudent || !secondForm) throw new Error('Missing second student');
  secondStudent.studentTaxId = '222-33-4444'; secondForm.recipientOwner = 'other'; secondForm.recipientId = 'outside-student';
  const separate = calculate(alias);
  expect(separate.perDistribution.map(row => row.taxableEarnings.toFixed())).toEqual(['200','200']);
  expect([separate.taxableEarnings, separate.netPenalty].map(value => value.toFixed())).toEqual(['200','20']);
});
