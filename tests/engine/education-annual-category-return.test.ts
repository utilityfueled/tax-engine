// Spec: spec/federal/education-annual-category-limits.yaml canonical.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { annualCategoryFixture, exhaustedAnnualLoanFixture, exhaustedAnnualLoanSourceFacts } from '../fixtures/education-annual-category-limits.js';
import { educatorInKindFixture } from '../fixtures/educator-in-kind.js';

it('carries actual annual category amounts through income and educator coordination', () => {
  const { input } = annualCategoryFixture(), before = JSON.stringify(input);
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect([result.agi, result.form1099Q?.taxableEarnings, result.form1099Q?.netPenalty].map(value => value?.toFixed())).toEqual(['56000', '6000', '600']);
  expect(result.allLines.filter(line => line.form === 'Sched 1' && line.line === '8z').map(line => line.value.toFixed())).toEqual(['6000']);
  expect(result.form1099Q?.perDistribution.map(row => row.educationExpenseExcludedEarnings.toFixed())).toEqual(['1000', '2000']);
  expect(JSON.stringify(input)).toBe(before);
  input.adjustments = educatorInKindFixture(2025).adjustments;
  const educator = input.adjustments?.educatorExpenseSources?.[0], paid = educator?.expenses[0];
  if (!educator || !paid) throw new Error('Missing actual fictional educator records');
  paid.amount = '3300'; educator.nontaxableQualifiedTuitionProgramAmount = '3000'; educator.nontaxableCoverdellEarnings = '0';
  const adjusted = calculateFederalTax(input);
  expect([adjusted.schedule1?.educatorExpenses, adjusted.agi].map(value => value?.toFixed())).toEqual(['300', '55700']);
  educator.nontaxableQualifiedTuitionProgramAmount = '10000';
  expect(() => calculateFederalTax(input)).toThrow(/educator|reconcil/i);
  const cents = annualCategoryFixture(2025, 'k12_tuition', '100');
  for (const form of cents.input.form1099Q) Object.assign(form, { grossDistribution: '100', earnings: '1', basis: '99' });
  const rounded = calculateFederalTax(cents.input);
  expect([rounded.agi, rounded.form1099Q?.taxableEarnings, rounded.form1099Q?.netPenalty].map(value => value?.toFixed())).toEqual(['50001', '1', '0']);
});

it('reconciles an actual own-return loan claim when the annual QTP benefit is zero', () => {
  for (const owner of ['primary', 'spouse'] as const) {
    const { input, facts } = exhaustedAnnualLoanFixture();
    const borrower = facts.loanBorrowers?.[0];
    if (!borrower) throw new Error('Missing fictional actual borrower');
    borrower.owner = owner;
    if (owner === 'spouse') {
      input.taxpayer.filingStatus = 'married_filing_jointly';
      input.taxpayer.spouse = { firstName: 'Jordan', lastName: 'Sample', ssn: '222-33-4444', dateOfBirth: '1984-05-02' };
    }
    const before = JSON.stringify(input);
    expect(() => calculateFederalTax(input)).toThrow(/loan.*source|source.*loan/i);
    expect(JSON.stringify(input)).toBe(before);
    input.studentLoanInterestFacts = exhaustedAnnualLoanSourceFacts(owner);
    const original = JSON.stringify(input), result = calculateFederalTax(input);
    expect([result.form1099Q?.taxableEarnings, result.schedule1?.studentLoanInterest, result.agi]
      .map(value => value?.toFixed())).toEqual(['9000', '1000', '58000']);
    expect(JSON.stringify(input)).toBe(original);
    input.studentLoanInterestFacts.sourceFactsConfirmed = false;
    expect(() => calculateFederalTax(input)).toThrow(/confirm/i);
    input.studentLoanInterestFacts.sourceFactsConfirmed = true;
    const loan = input.studentLoanInterestFacts.loans?.[0];
    if (!loan) throw new Error('Missing fictional actual loan record');
    loan.educationExpenseIds = [];
    expect(() => calculateFederalTax(input)).toThrow(/unlinked|source/i);
    loan.educationExpenseIds = ['actual-category-receipt'];
    loan.legallyObligated = false;
    expect(() => calculateFederalTax(input)).toThrow(/eligib|claim/i);
  }
  const zero = exhaustedAnnualLoanFixture(); zero.expense.studentLoanInterestDeducted = '0';
  expect(calculateFederalTax(zero.input).agi.toFixed()).toBe('59000');
  const outside = exhaustedAnnualLoanFixture(), borrower = outside.facts.loanBorrowers?.[0];
  if (!borrower) throw new Error('Missing fictional actual outside borrower');
  borrower.owner = 'other';
  expect(calculateFederalTax(outside.input).agi.toFixed()).toBe('59000');
});
