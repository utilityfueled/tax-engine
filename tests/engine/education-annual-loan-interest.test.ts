// Spec: spec/federal/education-annual-loan-interest.yaml.
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { calculateStudentLoanInterestDeduction } from '@/engine/forms/student-loan-interest.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { annualLoanInterestFixture, mixedAnnualLoanInterestFixture } from '../fixtures/education-annual-loan-interest.js';

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
  tuition.facts.expenses?.push({ ...tuition.expense, id: 'other-purpose', category: 'postsecondary_tuition', amount: '29500' });
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

// Spec: education-annual-loan-interest.yaml mixed-tuition-interest.
it('coordinates ordinary tuition and actual interest without attributing all earnings to interest', () => {
  const fixture = mixedAnnualLoanInterestFixture(), original = JSON.stringify(fixture.input);
  const result = canonical(fixture), q = result.form1099Q;
  expect([q?.adjustedQEE, q?.taxFreeEarnings, q?.taxableEarnings, q?.loanInterestSourceAdjustments[0]?.taxFreeEarningsUsedForInterest,
    result.schedule1?.studentLoanInterest, result.agi].map(value => value?.toFixed()))
    .toEqual(['6000', '1800', '7200', '300', '700', '56500']);
  expect(q?.loanInterestSourceAdjustments[0]?.annualInterestOnlyReporting?.numerator.toFixed()).toBe('9000000');
  expect(q?.loanInterestSourceAdjustments[0]?.annualInterestOnlyReporting?.denominator.toFixed()).toBe('30000');
  expect(fixture.facts.allocations).toEqual([]);
  expect(fixture.loan.qtpTaxFreeEarningsUsedForInterest).toBeUndefined();
  expect(JSON.stringify(fixture.input)).toBe(original);
  fixture.input.form1099Q.reverse(); fixture.facts.expenses?.reverse();
  expect(canonical(fixture).agi.toFixed()).toBe('56500');
  fixture.loan.qtpTaxFreeEarningsUsedForInterest = '300';
  expect(canonical(fixture).agi.toFixed()).toBe('56500');
  fixture.loan.qtpTaxFreeEarningsUsedForInterest = '1800';
  expect(() => canonical(fixture)).toThrow(/interest|QTP|reconcil/i);
});

it('preserves exact mixed-interest boundaries and source cents', () => {
  const full = mixedAnnualLoanInterestFixture('1000', '29000');
  Object.assign(full.facts.loanBorrowers?.[0] ?? {}, { priorQualifiedDistributions: '9000' });
  const result = canonical(full);
  expect([result.form1099Q?.taxFreeEarnings, result.form1099Q?.taxableEarnings, result.schedule1?.studentLoanInterest, result.agi].map(value => value?.toFixed()))
    .toEqual(['9000', '0', '700', '49300']);
  full.tuition.amount = '29000.01'; expect(() => education(full)).toThrow(/mixed|attribution|nonbinding/i);
  full.tuition.amount = '29000'; Object.assign(full.facts.loanBorrowers?.[0] ?? {}, { priorQualifiedDistributions: '9000.01' });
  expect(() => education(full)).toThrow(/mixed|attribution|nonbinding/i);
  const cents = mixedAnnualLoanInterestFixture('1000.01', '5000.02'), q = education(cents);
  expect([q.taxFreeEarnings.toFixed(), q.loanInterestSourceAdjustments[0]?.taxFreeEarningsUsedForInterest.toFixed()]).toEqual(['1800', '300.003']);
  const loan = calculateStudentLoanInterestDeduction({ taxYear: 2025, filingStatus: 'single', modifiedAgi: new Decimal(60000), facts: cents.lender, educationLoanInterest: q.loanInterestSourceAdjustments });
  expect(loan.deduction?.toFixed()).toBe('700');
  const falseTuition = mixedAnnualLoanInterestFixture(); falseTuition.tuition.qualificationConfirmed = false;
  expect(canonical(falseTuition).agi.toFixed()).toBe('58000');
});

const unsupportedMixed = ['principal', 'borrower-cap-partial', 'another-loan', 'other-borrower', 'tuition-credit', 'tuition-aid', 'tuition-refund',
  'tuition-other', 'tuition-unknown', 'loan-unknown', 'source-unknown', 'complete-unknown', 'year', 'date', 'invalid-date', 'duplicate-source',
  'duplicate-account', 'duplicate-expense', 'recipient', 'negative-earnings', 'prepaid', 'ESA', 'transfer', 'other-purpose'] as const;
it.each(unsupportedMixed)('rejects unsupported mixed-interest originals: %s', mode => {
  const f = mixedAnnualLoanInterestFixture();
  if (!f.form.sourceId || !f.form.accountId) throw new Error('Missing fictional original cash identity');
  if (mode === 'principal') f.expense.amount = '1001';
  if (mode === 'borrower-cap-partial') Object.assign(f.facts.loanBorrowers?.[0] ?? {}, { priorQualifiedDistributions: '9500' });
  if (mode === 'another-loan') f.facts.expenses?.push({ ...f.expense, id: 'second-interest' });
  if (mode === 'other-borrower') f.facts.loanBorrowers?.push({ id: 'other-borrower', owner: 'primary', priorQualifiedDistributions: '0', otherCurrentQualifiedDistributions: '0' });
  if (mode === 'tuition-credit') f.tuition.educationCreditAmount = '1';
  if (mode === 'tuition-aid') f.tuition.taxFreeAssistance = '1';
  if (mode === 'tuition-refund') f.tuition.refundedAmount = '1';
  if (mode === 'tuition-other') f.tuition.otherTaxBenefitAmount = '1';
  if (mode === 'tuition-unknown') delete (f.tuition as { qualificationConfirmed?: boolean }).qualificationConfirmed;
  if (mode === 'loan-unknown') f.expense.studentLoanInterestAmount = undefined;
  if (mode === 'source-unknown') f.second.sourceFactsConfirmed = undefined;
  if (mode === 'complete-unknown') f.facts.allDistributionsReconciled = undefined;
  if (mode === 'year') f.second.taxYear = 2026;
  if (mode === 'date') f.tuition.paidDate = '2026-09-01';
  if (mode === 'invalid-date') f.tuition.paidDate = '2025-02-30';
  if (mode === 'duplicate-source') f.second.sourceId = f.form.sourceId;
  if (mode === 'duplicate-account') f.second.accountId = f.form.accountId;
  if (mode === 'duplicate-expense') f.tuition.id = f.expense.id;
  if (mode === 'recipient') f.second.recipientOwner = 'spouse';
  if (mode === 'negative-earnings') Object.assign(f.second, { earnings: '-1', basis: '15001' });
  if (mode === 'prepaid') f.second.distributionMedium = 'in_kind_prepaid_tuition';
  if (mode === 'ESA') f.second.accountType = 'coverdell_esa';
  if (mode === 'transfer') f.second.transfer = { kind: 'qtp' };
  if (mode === 'other-purpose') Object.assign(f.tuition, { category: 'k12_tuition' });
  const before = JSON.stringify(f.input);
  expect(() => education(f)).toThrow(); expect(JSON.stringify(f.input)).toBe(before);
});

it('retains mixed-interest exact ratios and selected-year gates', () => {
  const f = mixedAnnualLoanInterestFixture('1', '1'), precision = Decimal.precision;
  Object.assign(f.form, { grossDistribution: '1', earnings: '0.2', basis: '0.8' });
  Object.assign(f.second, { grossDistribution: '2', earnings: '0.8', basis: '1.2' });
  const q = education(f), calculate = (agi: string) => calculateStudentLoanInterestDeduction({ taxYear: 2025, filingStatus: 'single', modifiedAgi: new Decimal(agi), facts: f.lender, educationLoanInterest: q.loanInterestSourceAdjustments });
  expect(q.loanInterestSourceAdjustments[0]?.annualInterestOnlyReporting?.numerator.toFixed()).toBe('1');
  expect(q.loanInterestSourceAdjustments[0]?.annualInterestOnlyReporting?.denominator.toFixed()).toBe('3');
  expect(calculate('88750').deduction?.toFixed()).toBe('1');
  expect(calculate('88750.00000000000000000000000000000000000000001').deduction?.toFixed()).toBe('0');
  expect(Decimal.precision).toBe(precision);
  const next = mixedAnnualLoanInterestFixture();
  next.input.taxpayer.taxYear = 2026; next.facts.taxYear = 2026; next.lender.sourceTaxYear = 2026;
  for (const form of next.input.form1099Q) { form.taxYear = 2026; form.distributionDate = '2026-09-01'; }
  for (const expense of next.facts.expenses ?? []) expense.paidDate = '2026-09-01';
  const nextQ = calculateForm1099Q(next.input.form1099Q, next.input.qualifiedEducationExpenses, { taxYear: 2026 });
  expect(calculateStudentLoanInterestDeduction({ taxYear: 2026, filingStatus: 'single', modifiedAgi: new Decimal(60000), facts: next.lender, educationLoanInterest: nextQ.loanInterestSourceAdjustments }).deduction?.toFixed()).toBe('700');
  expect(() => calculateFederalTax(next.input)).toThrow(/2026|rule.pack|qualified|support/i);
});

// Spec: education-annual-loan-interest.yaml mixed-known-zero.
it('distinguishes known zero mixed earnings from missing originals and prior zero cohorts', () => {
  const zero = mixedAnnualLoanInterestFixture();
  for (const form of zero.input.form1099Q) Object.assign(form, { earnings: '0', basis: '15000' });
  const result = canonical(zero);
  expect([result.form1099Q?.taxFreeEarnings, result.form1099Q?.taxableEarnings, result.schedule1?.studentLoanInterest, result.agi].map(value => value?.toFixed()))
    .toEqual(['0', '0', '1000', '49000']);
  delete (zero.second as { earnings?: string }).earnings;
  expect(() => canonical(zero)).toThrow(/actual|earnings|original|source/i);
  const noTuition = mixedAnnualLoanInterestFixture('1000', '0');
  expect(canonical(noTuition).agi.toFixed()).toBe('58000');
  const noInterest = mixedAnnualLoanInterestFixture('0');
  expect([education(noInterest).taxFreeEarnings, education(noInterest).loanInterestSourceAdjustments[0]?.taxFreeEarningsUsedForInterest].map(value => value?.toFixed()))
    .toEqual(['1500', '0']);
  // A zero original interest source does not invent the independently required lender reduction.
  expect(() => canonical(noInterest)).toThrow(/actual|QTP|reduction|source/i);
  const noGross = mixedAnnualLoanInterestFixture();
  for (const form of noGross.input.form1099Q) Object.assign(form, { grossDistribution: '0', earnings: '0', basis: '0' });
  expect(() => education(noGross)).toThrow(/mixed|attribution|nonbinding/i);
});

// Spec: education-annual-loan-interest.yaml mixed-source-guards.
it.each(['borrower-owner', 'lender-owner', 'lender-year', 'missing-link', 'supplied-zero', 'wrong-lender-interest'])('binds mixed-interest to independent lender and owner sources: %s', mode => {
  const f = mixedAnnualLoanInterestFixture();
  if (mode === 'borrower-owner') Object.assign(f.facts.loanBorrowers?.[0] ?? {}, { owner: 'spouse' });
  if (mode === 'lender-owner') f.loan.accountHolder = 'spouse';
  if (mode === 'lender-year') f.lender.sourceTaxYear = 2026;
  if (mode === 'missing-link') f.loan.educationExpenseIds = [];
  if (mode === 'supplied-zero') f.loan.qtpTaxFreeEarningsUsedForInterest = '0';
  if (mode === 'wrong-lender-interest') f.loan.interestPaid = '999';
  const original = JSON.stringify(f.input); expect(() => canonical(f)).toThrow(/loan|lender|owner|year|interest|source|QTP/i);
  expect(JSON.stringify(f.input)).toBe(original);
});

// Spec: education-annual-loan-interest.yaml exhausted-capacity-preservation.
it('preserves delivered exhausted capacity with explicit independent lender zero', () => {
  const f = mixedAnnualLoanInterestFixture();
  Object.assign(f.facts.loanBorrowers?.[0] ?? {}, { priorQualifiedDistributions: '10000' });
  f.loan.qtpTaxFreeEarningsUsedForInterest = '0';
  const original = JSON.stringify(f.input), result = canonical(f);
  expect([result.form1099Q?.adjustedQEE, result.form1099Q?.taxFreeEarnings, result.form1099Q?.taxableEarnings,
    result.schedule1?.studentLoanInterest, result.agi].map(value => value?.toFixed()))
    .toEqual(['5000', '1500', '7500', '1000', '56500']);
  expect(JSON.stringify(f.input)).toBe(original);
  delete f.loan.qtpTaxFreeEarningsUsedForInterest;
  expect(() => canonical(f)).toThrow(/actual|QTP|reduction|source/i);
});
