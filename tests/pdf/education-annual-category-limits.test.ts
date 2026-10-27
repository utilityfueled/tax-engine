// Spec: spec/federal/education-annual-category-limits.yaml private-review.
import Decimal from 'decimal.js';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildForm1099QReferenceSummary } from '@/pdf/fill-form-1099-q.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { FORM_1040_FIELDS as F1040 } from '@/pdf/fill-form-1040.js';
import { FORM_5329_FIELDS as F5329 } from '@/pdf/fill-form-5329.js';
import { SCHEDULE_1_FIELDS as S1 } from '@/pdf/fill-schedule-1.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { prepareEducationReview } from '@/pdf/education-review-context.js';
import { annualCategoryFixture, exhaustedAnnualLoanFixture, exhaustedAnnualLoanSourceFacts } from '../fixtures/education-annual-category-limits.js';
it('binds annual category sources and prints the derived physical totals', async () => {
  const { input } = annualCategoryFixture(), result = calculateFederalTax(input), calculated = result.form1099Q;
  if (!calculated) throw new Error('Missing actual education result');
  const context = prepareEducationReview(input);
  const shown = buildForm1099QReferenceSummary(input.form1099Q, calculated, input.qualifiedEducationExpenses, context);
  expect(shown.qualifiedEducationExpenseInputs).toContainEqual({ label: 'Statement 1: Annual qualified cash expenses', value: '10000' });
  expect(shown.sourceLines).toContainEqual(expect.objectContaining({ description: 'Beneficiary 1: Qualified K12 cash costs after annual beneficiary limit', value: '10000' }));
  for (const kind of ['category', 'date', 'amount', 'refund', 'cap']) {
    const changed = structuredClone(input), expense = changed.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0];
    const forged = { ...calculated, perDistribution: calculated.perDistribution.map(row => ({ ...row })) };
    if (!expense) throw new Error('Missing actual receipt');
    if (kind === 'category') expense.category = 'postsecondary_tuition';
    if (kind === 'date') expense.paidDate = '2025-09-02';
    if (kind === 'amount') expense.amount = '25001';
    if (kind === 'refund') { expense.amount = '26000'; expense.refundedAmount = '1000'; }
    if (kind === 'cap') forged.taxableEarnings = new Decimal('5999');
    expect(() => buildForm1099QReferenceSummary(changed.form1099Q, forged, changed.qualifiedEducationExpenses, context)).toThrow(/source|audit|reconcil|conflict|refund/i);
  }
  const loan = annualCategoryFixture(2025, 'student_loan', '8000');
  Object.assign(loan.expense, { borrowerId: 'actual-loan', beneficiaryOrSibling: true, studentLoanInterestAmount: '0', studentLoanInterestDeducted: '0' });
  loan.facts.loanBorrowers = [{ id: 'actual-loan', owner: 'primary', priorQualifiedDistributions: '3000', otherCurrentQualifiedDistributions: '2000' }];
  const loanResult = calculateFederalTax(loan.input).form1099Q, loanContext = prepareEducationReview(loan.input);
  if (!loanResult || !loan.facts.loanBorrowers[0]) throw new Error('Missing actual loan source calculation');
  loan.facts.loanBorrowers[0].priorQualifiedDistributions = '3001'; loan.facts.loanBorrowers[0].otherCurrentQualifiedDistributions = '1999';
  expect(() => buildForm1099QReferenceSummary(loan.input.form1099Q, loanResult, loan.input.qualifiedEducationExpenses, loanContext)).toThrow(/source|audit|reconcil|conflict/i);
  const directory = await mkdtemp(join(tmpdir(), 'annual-category-review-'));
  try {
    await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { blankFormsDir: 'forms/blank/2025', outputDir: directory, educationReview: context });
    const fields = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pypdf import PdfReader;print(json.dumps([{k:str(v.get("/V","")) for k,v in PdfReader(p).get_fields().items()} for p in sys.argv[1:]]))',
      join(directory, 'f1040-filled.pdf'), join(directory, 'f5329-primary-filled.pdf')], { encoding: 'utf8', timeout: 30000 })) as Array<Record<string, string>>;
    expect([fields[0]?.[F1040.line11], fields[1]?.[F5329.line5], fields[1]?.[F5329.line6], fields[1]?.[F5329.line8]]).toEqual(['56000', '6000', '', '600']);
    expect(fields[1]?.[F5329.ssn]).toBe('');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('prints the independently sourced interest claim with zero annual QTP benefit', async () => {
  const { input } = exhaustedAnnualLoanFixture();
  input.studentLoanInterestFacts = exhaustedAnnualLoanSourceFacts();
  const original = JSON.stringify(input), result = calculateFederalTax(input), context = prepareEducationReview(input);
  const directory = await mkdtemp(join(tmpdir(), 'annual-category-loan-review-'));
  try {
    await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { blankFormsDir: 'forms/blank/2025', outputDir: directory, educationReview: context });
    const fields = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pypdf import PdfReader;print(json.dumps([{k:str(v.get("/V","")) for k,v in PdfReader(p).get_fields().items()} for p in sys.argv[1:]]))',
      join(directory, 'f1040-filled.pdf'), join(directory, 'f1040s1-filled.pdf'), join(directory, 'f5329-primary-filled.pdf')], { encoding: 'utf8', timeout: 30000 })) as Array<Record<string, string>>;
    expect([fields[0]?.[F1040.line10], fields[0]?.[F1040.line11], fields[1]?.[S1.line21], fields[2]?.[F5329.line5], fields[2]?.[F5329.line8]])
      .toEqual(['1000', '58000', '1000', '9000', '900']);
    expect(fields[2]?.[F5329.ssn]).toBe('');
    expect(JSON.stringify(input)).toBe(original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
