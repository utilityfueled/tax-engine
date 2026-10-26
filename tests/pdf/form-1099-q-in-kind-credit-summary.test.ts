// Spec: spec/federal/form-1099-q-in-kind-credit.yaml. Synthetic review evidence.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { buildForm1099QReferenceSummary, fillForm1099QReference } from '@/pdf/fill-form-1099-q.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { inKindCreditFixture } from '../fixtures/education-in-kind-credit.js';

function fixture() {
  const input = inKindCreditFixture(2025), forms = input.form1099Q ?? [], summary = input.qualifiedEducationExpenses;
  return { forms, summary, result: calculateForm1099Q(forms, summary, { taxYear: 2025, educationExpenses: input.educationExpenses }) };
}
it('binds the actual credit split and remaining expense to its source audit', () => {
  const { forms, summary, result } = fixture(), shown = buildForm1099QReferenceSummary(forms, result, summary);
  expect(shown.sourceLines.some(row => row.description.includes('in-kind QTP expense allocation') && row.value === '3000')).toBe(true);
  expect(shown.sourceLines.some(row => row.description.includes('remaining after actual in-kind') && row.value === '0')).toBe(true);
  for (const mutation of ['allocation', 'expense', 'audit', 'missing']) {
    const changed = structuredClone(summary), facts = changed?.sourceFacts;
    const allocation = facts?.allocations?.[0], expense = facts?.expenses?.[0];
    if (!allocation || !expense) throw new Error('Missing source');
    if (mutation === 'allocation') { allocation.amount = '2999'; allocation.creditAmount = '1001'; }
    if (mutation === 'expense') expense.educationCreditAmount = '999';
    const changedResult = { ...result, lines: mutation === 'missing'
      ? result.lines.filter(row => !row.line.includes('in-kind-allocation'))
      : result.lines.map(row => mutation === 'audit' && row.line.includes('in-kind-allocation')
        ? { ...row, inputs: { ...row.inputs, 'Education credit expense': '999' } } : row) };
    expect(() => buildForm1099QReferenceSummary(forms, changedResult, changed)).toThrow(/audit|in-kind|benefit/);
  }
  const paired = inKindCreditFixture(2025), facts = paired.qualifiedEducationExpenses?.sourceFacts;
  const originalExpense = facts?.expenses?.[0], originalBenefit = facts?.inKindBenefits?.[0];
  if (!facts || !originalExpense || !originalBenefit) throw new Error('Missing source');
  facts.expenses = ['tuition-a', 'tuition-b'].map(id => ({ ...originalExpense, id, amount: '2000', educationCreditAmount: '500' }));
  facts.inKindBenefits = ['tuition-a', 'tuition-b'].map((expenseId, index) => ({ ...originalBenefit, id: `benefit-${index}`, expenseId, amount: '2000' }));
  facts.allocations = ['tuition-a', 'tuition-b'].map(expenseId => ({ sourceId: 'prepaid', expenseId, amount: '1500', creditAmount: '500' }));
  const pairedResult = calculateForm1099Q(paired.form1099Q ?? [], paired.qualifiedEducationExpenses, { taxYear: 2025, educationExpenses: paired.educationExpenses });
  expect(buildForm1099QReferenceSummary(paired.form1099Q ?? [], pairedResult, paired.qualifiedEducationExpenses).sourceLines.filter(row => row.description.includes('in-kind QTP expense allocation')).map(row => row.value)).toEqual(['1500', '1500']);
  const [firstExpense, secondExpense] = facts.expenses, [firstAllocation, secondAllocation] = facts.allocations;
  if (!firstExpense || !secondExpense || !firstAllocation || !secondAllocation) throw new Error('Missing paired sources');
  firstExpense.educationCreditAmount = '600'; secondExpense.educationCreditAmount = '400';
  firstAllocation.amount = '1400'; firstAllocation.creditAmount = '600';
  secondAllocation.amount = '1600'; secondAllocation.creditAmount = '400';
  // Same aggregate AQEE, income, credit expense and remaining cost cannot authorize a stale source split.
  expect(() => buildForm1099QReferenceSummary(paired.form1099Q ?? [], pairedResult, paired.qualifiedEducationExpenses)).toThrow(/audit/);
});
it('reopens the saved tuition credit reference with exact amounts and privacy notices', async () => {
  const { forms, summary, result } = fixture(), directory = await mkdtemp(join(tmpdir(), 'in-kind-credit-'));
  try {
    const path = await fillForm1099QReference(forms, result, summary, directory);
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
      { input: await readFile(path), encoding: 'utf8' })) as string[];
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = pages.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Actual in-kind QTP benefit costs: $4000');
    expect(text).toContain('Actual in-kind QTP expense allocation: $3000');
    expect(text).toContain('Expense used for education credit: $1000');
    expect(text).toContain('Expense remaining after actual in-kind benefit allocation: $0');
    expect(text).not.toContain('prepaid-account'); expect(text).not.toContain('123456789');
    expect(text).not.toContain('Synthetic actual tuition credit application');
    const future = { ...result, taxYear: 2026 };
    expect(() => buildForm1099QReferenceSummary(forms, future, summary)).toThrow(/year|2026|qualified/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
