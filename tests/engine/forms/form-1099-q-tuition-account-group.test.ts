// Spec: spec/federal/form-1099-q-tuition-account-group.yaml.
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { tuitionAccountGroupFixture } from '../../fixtures/education-tuition-account-group.js';
const calculate = (input: ReturnType<typeof tuitionAccountGroupFixture>) => calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses,
  { taxYear: input.taxpayer.taxYear, taxpayer: input.taxpayer, educationExpenses: input.educationExpenses });
const values = (input: ReturnType<typeof tuitionAccountGroupFixture>) => {
  const result = calculate(input);
  return [result.taxFreeEarnings, result.taxableEarnings, result.penaltyExceptionAmount, result.netPenalty].map(value => value.toFixed());
};
it('uses the beneficiary ESA ratio across distinct tuition account histories', () => {
  for (const year of [2025, 2026]) {
    const input = tuitionAccountGroupFixture(year, false), before = JSON.stringify(input), result = calculate(input);
    expect(values(input)).toEqual(['1900', '1200', '300', '90']);
    expect(result.perDistribution.map(row => [row.taxFreeEarnings, row.taxableEarnings].map(value => value.toFixed())))
      .toEqual([['200', '300'], ['200', '400'], ['600', '200'], ['900', '300']]);
    expect(result.coverdellAccounts.map(row => [row.distributedBasis, row.earnings, row.endingBasis].map(value => value.toFixed())))
      .toEqual([['3200', '800', '0'], ['800', '1200', '0']]);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('conserves each original benefit in a shared tuition expense', () => {
  for (const year of [2025, 2026]) {
    const input = tuitionAccountGroupFixture(year), facts = input.qualifiedEducationExpenses!.sourceFacts!;
    expect(values(input)).toEqual(['1900', '1200', '300', '90']);
    facts.allocations![2]!.amount = '2500'; facts.allocations![3]!.amount = '2000';
    expect(values(input)).toEqual(['1900', '1200', '300', '90']);
    facts.allocations![2]!.amount = '3000'; facts.allocations![3]!.amount = '1500';
    facts.allocations![0]!.amount = '1500'; facts.allocations![2]!.amount = '2500';
    expect(values(input)).toEqual(['1833', '1267', '300', '97']);
    const changed = calculate(input);
    expect(changed.perDistribution.map(row => row.taxFreeEarnings.toFixed())).toEqual(['300', '200', '533', '800']);
    input.form1099Q.reverse(); facts.inKindBenefits!.reverse(); facts.allocations!.reverse(); facts.coverdellAccounts!.reverse();
    expect(values(input)).toEqual(['1833', '1267', '300', '97']);
  }
});
it('rejects inconsistent shared tuition account sources', () => {
  for (const mutation of ['missing-allocation', 'duplicate-allocation', 'missing-benefit', 'cross-benefit', 'unknown-basis', 'same-account', 'wrong-owner',
    'wrong-year', 'one-cent', 'credit', 'benefits-over-expense', 'esa-capacity', 'unlinked-qtp', 'unconfirmed']) {
    const input = tuitionAccountGroupFixture(), facts = input.qualifiedEducationExpenses!.sourceFacts!, a = facts.allocations!, forms = input.form1099Q;
    if (mutation === 'missing-allocation') a.pop();
    if (mutation === 'duplicate-allocation') a[3] = { ...a[2]! };
    if (mutation === 'missing-benefit') facts.inKindBenefits!.pop();
    if (mutation === 'cross-benefit') { facts.inKindBenefits![0]!.amount = '2400'; facts.inKindBenefits![1]!.amount = '1600'; }
    if (mutation === 'unknown-basis') facts.coverdellAccounts![1]!.priorYearBasis = undefined;
    if (mutation === 'same-account') forms[3]!.accountId = forms[2]!.accountId;
    if (mutation === 'wrong-owner') forms[3]!.recipientOwner = 'spouse';
    if (mutation === 'wrong-year') forms[3]!.taxYear = 2026;
    if (mutation === 'one-cent') a[2]!.amount = '3000.01';
    if (mutation === 'credit') a[1]!.creditAmount = '500.01';
    if (mutation === 'benefits-over-expense') facts.expenses![0]!.amount = '3999.99';
    if (mutation === 'esa-capacity') { a[2]!.amount = '1999.99'; a[3]!.amount = '2500.01'; }
    if (mutation === 'unlinked-qtp') forms.push({ ...forms[0]!, sourceId: 'unlinked', accountId: 'unlinked-account' });
    if (mutation === 'unconfirmed') forms[3]!.sourceFactsConfirmed = false;
    expect(() => calculate(input), mutation).toThrow();
  }
});
