// Spec: spec/federal/form-1099-q-distinct-qtp-esa.yaml.
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { distinctQtpEsaFixture } from '../../fixtures/education-distinct-qtp-esa.js';

const calculate = (input: ReturnType<typeof distinctQtpEsaFixture>) => calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses,
  { taxYear: input.taxpayer.taxYear, taxpayer: input.taxpayer, educationExpenses: input.educationExpenses });
const values = (input: ReturnType<typeof distinctQtpEsaFixture>) => {
  const result = calculate(input);
  return [result.taxFreeEarnings, result.taxableEarnings, result.penaltyExceptionAmount, result.netPenalty].map(value => value.toFixed());
};

it('keeps each prepaid source ratio in the actual ESA allocation', () => {
  for (const year of [2025, 2026]) {
    const input = distinctQtpEsaFixture(year), before = JSON.stringify(input);
    expect(values(input)).toEqual(['1750', '1150', '300', '85']);
    expect(calculate(input).perDistribution.map(row => [row.taxFreeEarnings, row.taxableEarnings, row.creditException].map(value => value.toFixed())))
      .toEqual([['200', '300', '100'], ['200', '400', '200'], ['1350', '450', '0']]);
    expect(JSON.stringify(input)).toBe(before);
    const reversed = structuredClone(input), facts = reversed.qualifiedEducationExpenses!.sourceFacts!;
    reversed.form1099Q.reverse(); facts.expenses!.reverse(); facts.inKindBenefits!.reverse(); facts.allocations!.reverse();
    expect(values(reversed)).toEqual(['1750', '1150', '300', '85']);
    const allocations = input.qualifiedEducationExpenses!.sourceFacts!.allocations!;
    allocations[0]!.amount = '1500'; allocations[1]!.amount = '2000';
    expect(values(input)).toEqual(['1700', '1200', '300', '90']);
    allocations[0]!.amount = '0'; allocations[1]!.amount = '3500'; allocations[2]!.amount = '0'; allocations[3]!.amount = '2500';
    expect(values(input)).toEqual(['1800', '1100', '300', '80']);
  }
});

it('rejects conflicting distinct original source groups', () => {
  for (const mutation of ['cross-benefit', 'cross-gross', 'cross-allocation', 'extra-qtp', 'extra-esa', 'missing-benefit', 'missing-allocation',
    'duplicate-allocation', 'one-cent', 'aggregate-esa', 'unknown-earnings', 'unknown-basis', 'unknown-assistance', 'duplicate-account',
    'recipient', 'beneficiary', 'year', 'unconfirmed', 'cash-qtp']) {
    const input = distinctQtpEsaFixture(), facts = input.qualifiedEducationExpenses!.sourceFacts!;
    const expenses = facts.expenses!, allocations = facts.allocations!, benefits = facts.inKindBenefits!, forms = input.form1099Q;
    if (mutation === 'cross-benefit') { benefits[0]!.amount = '2400'; benefits[1]!.amount = '1600'; }
    if (mutation === 'cross-gross') { forms[0]!.grossDistribution = '2400'; forms[0]!.basis = '1900'; forms[1]!.grossDistribution = '1600'; forms[1]!.basis = '1000'; }
    if (mutation === 'cross-allocation') allocations[2]!.sourceId = 'prepaid';
    if (mutation === 'extra-qtp') forms.push({ ...forms[1]!, sourceId: 'extra-qtp', accountId: 'extra-account' });
    if (mutation === 'extra-esa') forms.push({ ...forms[2]!, sourceId: 'extra-esa', accountId: 'extra-esa-account' });
    if (mutation === 'missing-benefit') benefits.pop();
    if (mutation === 'missing-allocation') allocations.pop();
    if (mutation === 'duplicate-allocation') allocations[2] = { ...allocations[0]! };
    if (mutation === 'one-cent') allocations[3]!.amount = '2000.01';
    if (mutation === 'aggregate-esa') { expenses[0]!.amount = '6500'; allocations[1]!.amount = '4500'; }
    if (mutation === 'unknown-earnings') forms[1]!.earnings = undefined;
    if (mutation === 'unknown-basis') facts.coverdellAccounts![0]!.priorYearBasis = undefined;
    if (mutation === 'unknown-assistance') expenses[1]!.taxFreeAssistance = undefined;
    if (mutation === 'duplicate-account') forms[1]!.accountId = forms[0]!.accountId;
    if (mutation === 'recipient') { forms[1]!.recipientOwner = 'other'; forms[1]!.recipientId = 'different-person'; }
    if (mutation === 'beneficiary') forms[1]!.beneficiaryId = 'different-beneficiary';
    if (mutation === 'year') forms[1]!.taxYear = 2026;
    if (mutation === 'unconfirmed') forms[1]!.sourceFactsConfirmed = false;
    if (mutation === 'cash-qtp') forms[1]!.distributionMedium = 'cash';
    expect(() => calculate(input), mutation).toThrow();
  }
});
