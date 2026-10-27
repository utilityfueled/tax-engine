// Spec: spec/federal/education-annual-loan-interest.yaml.
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { calculateStudentLoanInterestDeduction } from '@/engine/forms/student-loan-interest.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { annualLoanInterestFixture } from '../fixtures/education-annual-loan-interest.js';

const education = (fixture: ReturnType<typeof annualLoanInterestFixture>) => calculateForm1099Q(fixture.input.form1099Q,
  fixture.input.qualifiedEducationExpenses, { taxYear: 2025 });
const canonical = (fixture: ReturnType<typeof annualLoanInterestFixture>) => calculateFederalTax(TaxYearInputSchema.parse(fixture.input));

it('derives the annual interest exclusion and actual lender deduction once', () => {
  const fixture = annualLoanInterestFixture(), original = JSON.stringify(fixture.input);
  const result = canonical(fixture);
  expect([result.form1099Q?.taxFreeEarnings, result.form1099Q?.taxableEarnings, result.schedule1?.studentLoanInterest, result.agi].map(value => value?.toFixed()))
    .toEqual(['300', '8700', '700', '58000']);
  expect(result.form1099Q?.loanInterestSourceAdjustments[0]?.taxFreeEarningsUsedForInterest.toFixed()).toBe('300');
  const qualifiedAudit = result.form1099Q?.lines.find(line => line.line === 'actual-loan-source:loan-qualified');
  expect(qualifiedAudit?.description).toBe('Qualified loan payment cash costs after lifetime borrower limit');
  expect(qualifiedAudit?.formula).not.toContain('principal-only');
  expect(fixture.facts.allocations).toEqual([]);
  expect(JSON.stringify(fixture.input)).toBe(original);
});

it('preserves lifetime capacity and unequal original earnings without source elections', () => {
  const fixture = annualLoanInterestFixture('8000');
  Object.assign(fixture.facts.loanBorrowers?.[0] ?? {}, { priorQualifiedDistributions: '3000', otherCurrentQualifiedDistributions: '2000' });
  const result = canonical(fixture);
  expect([result.form1099Q?.adjustedQEE, result.form1099Q?.taxFreeEarnings, result.form1099Q?.taxableEarnings, result.schedule1?.studentLoanInterest, result.agi].map(value => value?.toFixed()))
    .toEqual(['5000', '1500', '7500', '2500', '55000']);
  fixture.input.form1099Q.reverse();
  expect(canonical(fixture).agi.toFixed()).toBe('55000');
  fixture.facts.allocations = [{ sourceId: fixture.form.sourceId ?? '', expenseId: fixture.expense.id, amount: '8000', creditAmount: '0', loanInterestAmount: '8000' }];
  expect(canonical(fixture).agi.toFixed()).toBe('55000');
});

it('rounds exact repeating interest ratios only after the deduction phaseout', () => {
  const fixture = annualLoanInterestFixture('1'), precision = Decimal.precision;
  Object.assign(fixture.form, { grossDistribution: '1', earnings: '0.2', basis: '0.8' });
  Object.assign(fixture.second, { grossDistribution: '2', earnings: '0.8', basis: '1.2' });
  const context = education(fixture).loanInterestSourceAdjustments;
  const result = (agi: string) => calculateStudentLoanInterestDeduction({ taxYear: 2025, filingStatus: 'single',
    modifiedAgi: new Decimal(agi), facts: fixture.lender, educationLoanInterest: context });
  expect(result('88750').deduction?.toFixed()).toBe('1');
  expect(result('88750.00000000000000000000000000000000000000001').deduction?.toFixed()).toBe('0');
  expect(result('88749.99999999999999999999999999999999999999999').deduction?.toFixed()).toBe('1');
  expect(Decimal.precision).toBe(precision);
});

it('requires actual source links and keeps mixed purposes outside the determined cohort', () => {
  for (const mode of ['zero', 'wrong', 'missing-link', 'owner', 'unknown', 'unconfirmed']) {
    const fixture = annualLoanInterestFixture();
    if (mode === 'zero') fixture.loan.qtpTaxFreeEarningsUsedForInterest = '0';
    if (mode === 'wrong') fixture.loan.qtpTaxFreeEarningsUsedForInterest = '299';
    if (mode === 'missing-link') fixture.loan.educationExpenseIds = [];
    if (mode === 'owner') fixture.loan.borrowerId = 'replacement';
    if (mode === 'unknown') fixture.expense.studentLoanInterestAmount = undefined;
    if (mode === 'unconfirmed') fixture.lender.sourceFactsConfirmed = false;
    expect(() => canonical(fixture)).toThrow(/loan|interest|borrower|source|QTP/i);
  }
  const actual = annualLoanInterestFixture(); actual.loan.qtpTaxFreeEarningsUsedForInterest = '300';
  expect(canonical(actual).agi.toFixed()).toBe('58000');
  const mixed = annualLoanInterestFixture(); mixed.expense.amount = '1001';
  expect(() => education(mixed)).toThrow(/interest.*attribution|attribution.*interest/i);
  const tuition = annualLoanInterestFixture();
  tuition.facts.expenses?.push({ ...tuition.expense, id: 'other-purpose', category: 'postsecondary_tuition', amount: '1' });
  expect(() => education(tuition)).toThrow(/interest.*attribution|attribution.*interest/i);
  const absent = annualLoanInterestFixture(); absent.loan.educationExpenseIds = [];
  expect(() => calculateStudentLoanInterestDeduction({ taxYear: 2025, filingStatus: 'single', facts: absent.lender })).toThrow(/actual|QTP/i);
});

it('preserves independent qualification year and exact residual capacity', () => {
  const fixture = annualLoanInterestFixture();
  for (const form of fixture.input.form1099Q) { form.taxYear = 2026; form.distributionDate = '2026-09-01'; }
  fixture.expense.paidDate = '2026-09-01'; fixture.lender.sourceTaxYear = 2026; fixture.facts.taxYear = 2026;
  const context = calculateForm1099Q(fixture.input.form1099Q, fixture.input.qualifiedEducationExpenses, { taxYear: 2026 }).loanInterestSourceAdjustments;
  const calculate = () => calculateStudentLoanInterestDeduction({ taxYear: 2026, filingStatus: 'single', modifiedAgi: new Decimal(60000), facts: fixture.lender, educationLoanInterest: context });
  expect(calculate().deduction?.toFixed()).toBe('700');
  fixture.loan.legallyObligated = false; expect(calculate().deduction?.toFixed()).toBe('0');
  delete fixture.loan.legallyObligated; expect(calculate).toThrow(/actual|legally/i);
  const tiny = annualLoanInterestFixture();
  Object.assign(tiny.facts.loanBorrowers?.[0] ?? {}, { priorQualifiedDistributions: `9999.${'9'.repeat(60)}`, otherCurrentQualifiedDistributions: '0' });
  const exact = education(tiny).loanInterestSourceAdjustments[0]?.annualInterestOnlyReporting;
  expect(exact?.numerator.toFixed()).toBe(`0.${'0'.repeat(56)}9`);
  expect(exact?.denominator.toFixed()).toBe('30000');
});
