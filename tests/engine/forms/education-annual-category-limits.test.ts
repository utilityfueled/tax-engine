// Spec: spec/federal/education-annual-category-limits.yaml. Derived actual-source controls.
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { annualCategoryFixture } from '../../fixtures/education-annual-category-limits.js';
import { inKindCreditFixture } from '../../fixtures/education-in-kind-credit.js';

const calculate = (fixture: ReturnType<typeof annualCategoryFixture>) => calculateForm1099Q(fixture.input.form1099Q,
  fixture.input.qualifiedEducationExpenses, { taxYear: fixture.input.taxpayer.taxYear, taxpayer: fixture.input.taxpayer, educationExpenses: fixture.input.educationExpenses });
const amounts = (fixture: ReturnType<typeof annualCategoryFixture>) => {
  const result = calculate(fixture);
  return [result.adjustedQEE, result.taxableEarnings, result.netPenalty].map(value => value.toFixed());
};

it('applies the K12 annual cap once before unequal original earnings', () => {
  for (const [year, qualified, taxable, penalty] of [[2025, '10000', '6000', '600'], [2026, '20000', '3000', '300']] as const) {
    const fixture = annualCategoryFixture(year), before = JSON.stringify(fixture.input);
    expect(amounts(fixture)).toEqual([qualified, taxable, penalty]);
    expect(calculate(fixture).perDistribution.map(row => row.taxableEarnings.toFixed())).toEqual(year === 2025 ? ['2000', '4000'] : ['1000', '2000']);
    expect(JSON.stringify(fixture.input)).toBe(before);
    fixture.input.form1099Q.reverse(); fixture.facts.expenses?.reverse();
    expect(amounts(fixture)).toEqual([qualified, taxable, penalty]);
  }
});

it('keeps false and unknown statutory category facts distinct', () => {
  const fixture = annualCategoryFixture(2025, 'k12_tuition', '8000');
  const books = { ...fixture.expense, id: 'books', category: 'k12_books' as const, amount: '4000' };
  fixture.facts.expenses?.push(books);
  expect(amounts(fixture)).toEqual(['10000', '6000', '600']);
  books.qualificationConfirmed = false;
  expect(amounts(fixture)).toEqual(['8000', '6600', '660']);
  books.qualificationConfirmed = undefined;
  expect(() => calculate(fixture)).toThrow(/qualification/);
  for (const [category, facts] of [
    ['k12_tutoring', { tutorUnrelated: true, tutoringOutsideHome: true, tutorQualified: true }],
    ['k12_disability_therapy', { studentHasDisability: true, providerLicensedOrAccredited: true }],
    ['credential_enrollment', { credentialRecognized: true, requiredForCredential: true }],
    ['apprenticeship', { apprenticeshipRegistered: true, requiredForApprenticeship: true }],
  ] as const) {
    const current = annualCategoryFixture(2025, category, '6000');
    Object.assign(current.expense, facts);
    expect(amounts(current)).toEqual(['6000', '7200', '720']);
    for (const key of Object.keys(facts)) {
      const draft = structuredClone(current);
      Object.assign(draft.expense, { [key]: false });
      expect(amounts(draft)).toEqual(['0', '9000', '900']);
      Object.assign(draft.expense, { [key]: undefined });
      expect(() => calculate(draft)).toThrow(/actual|missing|required/);
    }
  }
});

it('uses actual homogeneous effective dates without an annual timing election', () => {
  for (const category of ['k12_books', 'credential_testing'] as const) {
    const fixture = annualCategoryFixture(2025, category, '6000');
    Object.assign(fixture.expense, { credentialRecognized: true, requiredForCredential: true });
    for (const original of fixture.input.form1099Q) original.distributionDate = '2025-07-04';
    expect(amounts(fixture)).toEqual(['0', '9000', '900']);
    for (const original of fixture.input.form1099Q) original.distributionDate = '2025-07-05';
    expect(amounts(fixture)).toEqual(['6000', '7200', '720']);
    fixture.second.allDistributionsAfterJuly42025 = false;
    expect(() => calculate(fixture)).toThrow(/date|timing|contradict/i);
    fixture.second.allDistributionsAfterJuly42025 = undefined;
    fixture.second.distributionDate = '2025-07-04';
    expect(() => calculate(fixture)).toThrow(/mixed.*timing|timing.*method/i);
    fixture.second.distributionDate = undefined; fixture.second.allDistributionsAfterJuly42025 = undefined;
    expect(() => calculate(fixture)).toThrow(/actual|date/);
  }
  const later = annualCategoryFixture(2026, 'k12_books', '6000');
  for (const original of later.input.form1099Q) original.distributionDate = undefined;
  expect(amounts(later)).toEqual(['6000', '7200', '720']);
});

it('keeps known zero loan qualification separate from unresolved positive attribution', () => {
  const fixture = annualCategoryFixture(2025, 'student_loan', '8000');
  Object.assign(fixture.expense, { borrowerId: 'borrower', beneficiaryOrSibling: false, studentLoanInterestAmount: '1000', studentLoanInterestDeducted: '1000' });
  fixture.facts.loanBorrowers = [{ id: 'borrower', owner: 'primary', priorQualifiedDistributions: '0', otherCurrentQualifiedDistributions: '0' }];
  expect(amounts(fixture)).toEqual(['0', '9000', '900']);
  fixture.expense.beneficiaryOrSibling = true;
  const borrower = fixture.facts.loanBorrowers[0]; if (!borrower) throw new Error('Missing fictional borrower');
  borrower.priorQualifiedDistributions = '10000';
  expect(amounts(fixture)).toEqual(['0', '9000', '900']);
  expect(calculate(fixture).loanInterestAdjustments[0]?.taxFreeEarningsUsedForInterest.toFixed()).toBe('0');
  borrower.priorQualifiedDistributions = '9999';
  expect(() => calculate(fixture)).toThrow(/interest.*attribution|attribution.*interest/i);
});

it('derives principal-only capacity from the actual borrower history', () => {
  const fixture = annualCategoryFixture(2025, 'student_loan', '8000');
  Object.assign(fixture.expense, { borrowerId: 'actual-borrower', beneficiaryOrSibling: true, studentLoanInterestAmount: '0', studentLoanInterestDeducted: '0' });
  fixture.facts.loanBorrowers = [{ id: 'actual-borrower', owner: 'primary', priorQualifiedDistributions: '3000', otherCurrentQualifiedDistributions: '2000' }];
  expect(amounts(fixture)).toEqual(['5000', '7500', '750']);
  expect(calculate(fixture).loanInterestAdjustments[0]?.taxFreeEarningsUsedForInterest.toFixed()).toBe('0');
  for (const key of ['priorQualifiedDistributions', 'otherCurrentQualifiedDistributions', 'owner']) {
    const missing = structuredClone(fixture);
    Object.assign(missing.facts.loanBorrowers?.[0] ?? {}, { [key]: undefined });
    expect(() => calculate(missing)).toThrow(/actual|borrower|history/);
  }
  fixture.expense.studentLoanInterestAmount = undefined;
  expect(() => calculate(fixture)).toThrow(/interest/);
  fixture.expense.studentLoanInterestAmount = '1';
  expect(() => calculate(fixture)).toThrow(/interest.*attribution|attribution.*interest/i);
  fixture.expense.studentLoanInterestAmount = '0'; fixture.expense.beneficiaryOrSibling = false;
  expect(amounts(fixture)).toEqual(['0', '9000', '900']);
});

it('requires complete actual category refund chronology and exact source sums', () => {
  const fixture = annualCategoryFixture(2025, 'k12_tuition', '8000');
  Object.assign(fixture.expense, { refundedAmount: '500', taxFreeAssistance: '500', refundHistoryCompleteConfirmed: true });
  fixture.facts.expenseRefunds = [{ id: 'actual-refund', expenseId: fixture.expense.id, amount: '500', receivedDate: '2025-10-01',
    receivedByBeneficiary: true, disposition: 'cash_retained', sourceReference: 'Fictional actual cash refund', sourceFactsConfirmed: true }];
  const before = JSON.stringify(fixture.input);
  expect(amounts(fixture)).toEqual(['7000', '6900', '690']);
  expect(JSON.stringify(fixture.input)).toBe(before);
  for (const kind of ['missing', 'false', 'mismatch', 'duplicate', 'date', 'before', 'reference']) {
    const bad = structuredClone(fixture), refund = bad.facts.expenseRefunds?.[0];
    if (!refund) throw new Error('Missing fictional actual refund');
    if (kind === 'missing') bad.facts.expenseRefunds = undefined;
    if (kind === 'false') bad.expense.refundHistoryCompleteConfirmed = false;
    if (kind === 'mismatch') refund.amount = '499.99';
    if (kind === 'duplicate') bad.facts.expenseRefunds?.push({ ...refund, id: ' actual-refund ' });
    if (kind === 'date') refund.receivedDate = '2026-01-01';
    if (kind === 'before') refund.receivedDate = '2025-08-31';
    if (kind === 'reference') refund.sourceReference = '';
    expect(() => calculate(bad)).toThrow(/refund|receipt|source/);
  }
});

it('keeps prepaid costs outside the cash category cap and denominator', () => {
  const fixture = annualCategoryFixture(2025, 'k12_tuition', '14000');
  const person = fixture.facts.beneficiaries?.[0];
  if (!person) throw new Error('Missing fictional actual beneficiary');
  person.outsideK12CashOnlyConfirmed = true;
  const prepaid = { ...fixture.form, sourceId: 'prepaid', accountId: 'actual-prepaid', distributionMedium: 'in_kind_prepaid_tuition' as const,
    grossDistribution: '4000', earnings: '800', basis: '3200' };
  fixture.input.form1099Q.push(prepaid);
  fixture.facts.inKindBenefits = [{ id: 'actual-benefit', sourceId: 'prepaid', expenseId: fixture.expense.id, amount: '4000', providedDate: '2025-09-01',
    qualificationConfirmed: true, sourceReference: 'Fictional supplied tuition', prepaidPlanSponsor: 'state', prepaidPlanQualifiedConfirmed: true,
    prepaidTuitionCreditRedeemed: true, prepaidPlanSourceReference: 'Fictional actual plan' }];
  fixture.facts.allocations = [{ sourceId: 'prepaid', expenseId: fixture.expense.id, amount: '4000', creditAmount: '0' }];
  fixture.facts.expenses?.push({ ...fixture.expense, id: 'actual-postsecondary', category: 'postsecondary_tuition', amount: '3000' });
  expect(amounts(fixture)).toEqual(['17000', '5100', '510']);
  expect(calculate(fixture).perDistribution.find(row => row.sourceId === 'prepaid')?.taxableEarnings.toFixed()).toBe('0');
});

it('preserves category source cents and the existing annual source boundaries', () => {
  const fixture = annualCategoryFixture(2025, 'k12_tuition', '100');
  for (const original of fixture.input.form1099Q) Object.assign(original, { grossDistribution: '100', earnings: '1', basis: '99' });
  const precision = Decimal.precision, before = JSON.stringify(fixture.input);
  expect(amounts(fixture)).toEqual(['100', '1', '0']);
  expect(calculate(fixture).perDistribution.map(row => row.taxableEarnings.toFixed())).toEqual(['0.5', '0.5']);
  expect(JSON.stringify(fixture.input)).toBe(before); expect(Decimal.precision).toBe(precision);
  fixture.second.grossDistribution = '100.00000000000000000000000000000000000000001';
  fixture.second.basis = '99.00000000000000000000000000000000000000001';
  expect(amounts(fixture)).toEqual(['100', '1', '0']);
  fixture.second.basis = '99'; expect(() => calculate(fixture)).toThrow(/Box|reconcile/);
  const outside = annualCategoryFixture(), beneficiary = outside.facts.beneficiaries?.[0];
  if (!beneficiary) throw new Error('Missing fictional beneficiary');
  beneficiary.outsideK12QualifiedDistributions = '1';
  expect(() => calculate(outside)).toThrow(/outside.*source|original/i);
});

it('composes capped categories with independently qualified credit expenses', () => {
  const fixture = annualCategoryFixture();
  fixture.input.educationExpenses = inKindCreditFixture(2025).educationExpenses;
  fixture.facts.expenses?.push({ ...fixture.expense, id: 'actual-college-tuition', category: 'postsecondary_tuition', amount: '5000', educationCreditAmount: '1000' });
  const result = calculate(fixture);
  expect([result.adjustedQEE, result.taxableEarnings, result.penaltyExceptionAmount, result.netPenalty].map(value => value.toFixed())).toEqual(['14000', '4800', '300', '450']);
  fixture.expense.educationCreditAmount = '1';
  expect(() => calculate(fixture)).toThrow(/actual postsecondary credit qualification/);
});

it('reports completed annual category costs without fabricated source allocations', () => {
  const k12 = annualCategoryFixture(), before = JSON.stringify(k12.input), beneficiary = k12.form.beneficiaryId;
  const k12Line = calculate(k12).lines.find(row => row.line === `${beneficiary}:k12-qualified`);
  expect(k12Line?.value.toFixed()).toBe('10000');
  expect(k12Line?.description).toBe('Qualified K12 cash costs after annual beneficiary limit');
  expect(k12.facts.allocations).toEqual([]); expect(JSON.stringify(k12.input)).toBe(before);
  const loan = annualCategoryFixture(2025, 'student_loan', '8000');
  Object.assign(loan.expense, { borrowerId: 'actual-borrower', beneficiaryOrSibling: true, studentLoanInterestAmount: '0', studentLoanInterestDeducted: '0' });
  loan.facts.loanBorrowers = [{ id: 'actual-borrower', owner: 'primary', priorQualifiedDistributions: '3000', otherCurrentQualifiedDistributions: '2000' }];
  const loanLine = calculate(loan).lines.find(row => row.line === 'actual-borrower:loan-qualified');
  expect(loanLine?.value.toFixed()).toBe('5000');
  expect(loanLine?.description).toBe('Qualified loan principal cash costs after lifetime borrower limit');
  expect(loan.facts.allocations).toEqual([]);
});

it('preserves exact complementary borrower histories before the interest boundary', () => {
  const fixture = annualCategoryFixture(2025, 'student_loan', '8000');
  Object.assign(fixture.expense, { borrowerId: 'actual-exact-history', beneficiaryOrSibling: true, studentLoanInterestAmount: '1000', studentLoanInterestDeducted: '1000' });
  const borrower = { id: 'actual-exact-history', owner: 'primary' as const,
    priorQualifiedDistributions: `0.${'0'.repeat(59)}1`, otherCurrentQualifiedDistributions: `9999.${'9'.repeat(60)}` };
  fixture.facts.loanBorrowers = [borrower];
  const before = JSON.stringify(fixture.input), precision = Decimal.precision;
  const result = calculate(fixture);
  expect([result.adjustedQEE, result.taxableEarnings, result.netPenalty].map(value => value.toFixed())).toEqual(['0', '9000', '900']);
  const remaining = result.lines.find(row => row.line === 'actual-exact-history:loan-qualified')?.inputs['Remaining limit'];
  expect(Decimal.isDecimal(remaining) ? remaining.toFixed() : remaining).toBe('0');
  expect(JSON.stringify(fixture.input)).toBe(before); expect(Decimal.precision).toBe(precision);
  borrower.priorQualifiedDistributions = '0';
  expect(() => calculate(fixture)).toThrow(/interest.*attribution|attribution.*interest/i);
});
