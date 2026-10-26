// Spec: spec/federal/form-1099-q-distinct-in-kind-assistance.yaml.
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { distinctInKindFixture } from '../../fixtures/education-distinct-in-kind.js';
function calculate(input = distinctInKindFixture()) {
  return calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses, { taxYear: input.taxpayer.taxYear, taxpayer: input.taxpayer, educationExpenses: input.educationExpenses });
}
it('keeps distinct actual tuition expense and statement records', () => {
  const input = distinctInKindFixture(), before = JSON.stringify(input), result = calculate(input);
  expect(result.perDistribution.map(row => [row.adjustedQEE, row.taxFreeEarnings, row.taxableEarnings].map(value => value.toFixed())))
    .toEqual([['3000','600','200'],['4500','675','225']]);
  expect([result.taxableEarnings, result.taxFreeEarnings, result.netPenalty].map(value => value.toFixed())).toEqual(['425','1275','43']);
  expect(JSON.stringify(input)).toBe(before);
  input.form1099Q.reverse(); input.qualifiedEducationExpenses?.sourceFacts?.expenses?.reverse();
  expect(calculate(input).taxableEarnings.toFixed()).toBe('425');
  const one = distinctInKindFixture(), facts = one.qualifiedEducationExpenses?.sourceFacts, first = one.form1099Q[0];
  if (!facts || !first) throw new Error('Missing source');
  one.form1099Q = [{...first,grossDistribution:'10000',earnings:'1700',basis:'8300'}];
  for (const row of [...(facts.inKindBenefits ?? []), ...(facts.allocations ?? [])]) row.sourceId = 'prepaid';
  expect([calculate(one).taxFreeEarnings, calculate(one).taxableEarnings].map(value => value.toFixed())).toEqual(['1275','425']);
});
it('keeps exact source rounding and separately supplied credit amounts', () => {
  for (const [first, second, a, b, taxable] of [['1002.50','1503.33','2997.50','4496.67',['200','225']],['1002.51','1503.34','2997.49','4496.66',['201','226']]] as const) {
    const input = distinctInKindFixture(), facts = input.qualifiedEducationExpenses!.sourceFacts!;
    facts.expenses![0]!.taxFreeAssistance = first; facts.expenses![1]!.taxFreeAssistance = second;
    facts.allocations![0]!.amount = a; facts.allocations![1]!.amount = b;
    expect(calculate(input).perDistribution.map(row => row.taxableEarnings.toFixed())).toEqual(taxable);
  }
  const result = calculate(distinctInKindFixture(2026, true));
  expect(result.perDistribution.map(row => [row.taxableEarnings, row.creditException].map(value => value.toFixed()))).toEqual([['400','200'],['300','75']]);
  expect([result.taxableEarnings,result.penaltyExceptionAmount,result.netPenalty].map(value => value.toFixed())).toEqual(['700','275','43']);
});
it('rejects incomplete or shared tuition source groups without inventing allocations', () => {
  for (const mutation of ['extra-expense','duplicate-benefit','cross-allocation','cash','esa','wrong-year','wrong-owner','unknown-assistance','unknown-refund','unconfirmed','unreconciled-box1']) {
    const input = distinctInKindFixture(), facts = input.qualifiedEducationExpenses!.sourceFacts!, second = input.form1099Q[1]!;
    if (mutation === 'extra-expense') facts.expenses!.push({...facts.expenses![0]!,id:'unbound',amount:'0',taxFreeAssistance:'0'});
    if (mutation === 'duplicate-benefit') { facts.inKindBenefits![0]!.amount = '2000'; facts.inKindBenefits!.push({...facts.inKindBenefits![0]!,id:'duplicate'}); }
    if (mutation === 'cross-allocation') facts.allocations![1]!.expenseId = 'tuition';
    if (mutation === 'cash' || mutation === 'esa') { second.distributionMedium = 'cash'; if (mutation === 'esa') second.accountType = 'coverdell_esa'; }
    if (mutation === 'wrong-year') second.taxYear = 2025;
    if (mutation === 'wrong-owner') { second.recipientOwner = 'other'; second.recipientId = 'invented-owner'; }
    if (mutation === 'unknown-assistance') facts.expenses![1]!.taxFreeAssistance = undefined;
    if (mutation === 'unknown-refund') facts.expenses![1]!.refundedAmount = undefined;
    if (mutation === 'unconfirmed') second.sourceFactsConfirmed = false;
    if (mutation === 'unreconciled-box1') { second.grossDistribution = '6001'; second.basis = '5101'; }
    expect(() => calculate(input),mutation).toThrow(/source|in-kind|assistance|allocation|identity|year|Box1|benefit/);
  }
  const knownZero = distinctInKindFixture(), facts = knownZero.qualifiedEducationExpenses!.sourceFacts!;
  facts.expenses![1]!.taxFreeAssistance = '0'; facts.allocations![1]!.amount = '6000';
  expect(calculate(knownZero).perDistribution.map(row => row.taxableEarnings.toFixed())).toEqual(['200','0']);
});
