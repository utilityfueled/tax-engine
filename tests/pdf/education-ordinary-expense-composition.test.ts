// Spec: spec/federal/education-ordinary-expense-composition.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { prepareEducationReview } from '@/pdf/education-review-context.js';
import { buildForm1099QReferenceSummary } from '@/pdf/fill-form-1099-q.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { FORM_5329_FIELDS as F } from '@/pdf/fill-form-5329.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { ordinaryEducationRefundFixture, ordinaryEducationEsaFixture, required } from '../fixtures/education-ordinary-expense-composition.js';

it('binds original ordinary receipts and refund chronology before review output', async () => {
  const original = ordinaryEducationRefundFixture(), result = calculateFederalTax(original), context = prepareEducationReview(original);
  const input = redactReviewIdentifiers(original), rendered = redactReviewIdentifiers(result);
  const directory = await mkdtemp(join(tmpdir(), 'ordinary-education-expense-review-'));
  try {
    const summary = buildForm1099QReferenceSummary(input.form1099Q, required(rendered.form1099Q), input.qualifiedEducationExpenses, context);
    expect(summary.sourceLines.filter(row => row.line.startsWith('expense-refund:')).map(row => row.value)).toEqual(['500']);
    expect(summary.qualifiedEducationExpenseInputs).toContainEqual({ label: 'Expense 1: Category', value: 'postsecondary_books' });
    for (const kind of ['category', 'refund-date', 'refund-reference', 'receipt-replacement', 'remove-refund', 'forged-audit']) {
      const changed = structuredClone(input), facts = required(changed.qualifiedEducationExpenses?.sourceFacts);
      if (kind === 'category') required(facts.expenses?.[0]).category = 'postsecondary_computer';
      if (kind === 'refund-date') required(facts.expenseRefunds?.[0]).receivedDate = '2025-09-16';
      if (kind === 'refund-reference') required(facts.expenseRefunds?.[0]).sourceReference = 'replacement actual source';
      if (kind === 'receipt-replacement') { required(facts.expenses?.[0]).id = 'replacement'; required(facts.expenseRefunds?.[0]).expenseId = 'replacement'; }
      if (kind === 'remove-refund') facts.expenseRefunds = [];
      const changedResult = kind === 'forged-audit' ? { ...rendered, form1099Q: { ...required(rendered.form1099Q),
        lines: required(rendered.form1099Q).lines.filter(row => !row.line.startsWith('expense-refund:')) } } : rendered;
      await expect(fillReturn(changed, changedResult, { blankFormsDir: join(directory, 'absent'), outputDir: directory, educationReview: context }))
        .rejects.toThrow(/stale|conflict|audit|reconcile/);
    }
    expect(await readdir(directory)).toEqual([]);
    await fillReturn(input, rendered, { blankFormsDir: 'forms/blank/2025', outputDir: directory, educationReview: context });
    const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pathlib import Path;from pypdf import PdfReader\np=Path(sys.argv[1]);f=PdfReader(p/"f5329-primary-filled.pdf").get_fields();print(json.dumps({"fields":[f[k].get("/V", "") for k in sys.argv[2:]],"pages":[page.extract_text() or "" for q in sorted(p.glob("*.pdf")) for page in PdfReader(q).pages]}))',
      directory, F.line5, F.line6, F.line8, F.ssn], { encoding: 'utf8', timeout: 10000 })) as { fields: string[]; pages: string[] };
    expect(checked.fields).toEqual(['300', '', '30', '']);
    const text = checked.pages.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('postsecondary_books'); expect(text).toContain('Actual received date: 2025-09-15');
    expect(text).toContain('cash_retained');
    expect(text).toContain('Actual tax-free assistance against the in-kind QTP benefit');
    for (const page of checked.pages) {
      expect(page).toContain(REVIEW_PDF_NOTICE);
      for (const secret of [original.taxpayer.primary.ssn, 'prepaid-account', 'fictional institution refund receipt']) expect(page).not.toContain(secret);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('names ordinary QTP benefits accurately in review references', () => {
  for (const [original, suffix, description] of [
    [ordinaryEducationRefundFixture(), ':in-kind-assistance:tuition', 'Actual tax-free assistance against the in-kind QTP benefit'],
    [ordinaryEducationEsaFixture(), ':in-kind-esa:tuition', 'Actual expense allocation between in-kind QTP and ESA'],
  ] as const) {
    const result = calculateFederalTax(original), context = prepareEducationReview(original);
    const summary = buildForm1099QReferenceSummary(original.form1099Q, required(result.form1099Q), original.qualifiedEducationExpenses, context);
    expect(summary.sourceLines.find(row => row.line.endsWith(suffix))?.description).toBe(`Statement 1: ${description}`);
    expect(summary.qualifiedEducationExpenseInputs).toContainEqual({ label: 'Expense 1: Category', value: 'postsecondary_books' });
  }
});
