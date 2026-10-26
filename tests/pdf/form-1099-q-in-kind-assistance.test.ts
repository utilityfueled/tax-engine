// Spec: spec/federal/form-1099-q-in-kind-assistance.yaml. Synthetic review evidence.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { prepareEducationReview } from '@/pdf/education-review-context.js';
import { buildForm1099QReferenceSummary, fillForm1099QReference } from '@/pdf/fill-form-1099-q.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillForm5329, FORM_5329_FIELDS as F } from '@/pdf/fill-form-5329.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { inKindAssistanceFixture } from '../fixtures/education-in-kind-assistance.js';

it('binds original assistance before producing a redacted review', async () => {
  const input = inKindAssistanceFixture(2025), result = calculateFederalTax(input);
  const context = prepareEducationReview(input), redacted = redactReviewIdentifiers(input), rendered = redactReviewIdentifiers(result);
  if (!result.form1099Q || !rendered.form1099Q) throw new Error('Missing education result');
  const originalEducationResult = result.form1099Q;
  expect(JSON.stringify(context)).toBe('{}');
  const shown = buildForm1099QReferenceSummary(redacted.form1099Q, rendered.form1099Q, redacted.qualifiedEducationExpenses, context);
  expect(shown.sourceLines.find(row => row.line === 'prepaid:in-kind-assistance:tuition')?.value).toBe('1000');
  const directory = await mkdtemp(join(tmpdir(), 'in-kind-assistance-'));
  try {
    for (const mutation of ['balanced-assistance', 'changed-taxpayer', 'missing-audit']) {
      const changed = structuredClone(redacted), expense = changed.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0];
      if (!expense) throw new Error('Missing expense');
      // These balanced original-source edits leave the available expense and tax unchanged.
      if (mutation === 'balanced-assistance') { expense.amount = '4001'; expense.taxFreeAssistance = '1001'; }
      if (mutation === 'changed-taxpayer') changed.taxpayer.primary.ssn = '777-88-9999';
      const changedResult = mutation === 'missing-audit' ? { ...rendered, form1099Q: { ...rendered.form1099Q,
        lines: rendered.form1099Q.lines.filter(row => !row.line.includes('in-kind-assistance')) } } : rendered;
      await expect(fillReturn(changed, changedResult, { blankFormsDir: join(directory, 'absent'), outputDir: directory, educationReview: context }))
        .rejects.toThrow(/stale|conflict|calculation|audit|identity/);
      await expect(fillForm5329(changed, changedResult, join(directory, 'absent.pdf'), 'primary', context))
        .rejects.toThrow(/stale|conflict|calculation|audit|identity/);
    }
    expect(await readdir(directory)).toEqual([]);
    const changed = structuredClone(input.qualifiedEducationExpenses), expense = changed?.sourceFacts?.expenses?.[0];
    if (!expense) throw new Error('Missing expense');
    expense.amount = '4001'; expense.taxFreeAssistance = '1001';
    expect(() => buildForm1099QReferenceSummary(input.form1099Q, originalEducationResult, changed)).toThrow(/audit|assistance|in-kind/);
    const path = await fillForm1099QReference(redacted.form1099Q, rendered.form1099Q, redacted.qualifiedEducationExpenses, directory, context);
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8' })) as string[];
    for (const page of pages) expect(page).toContain(REVIEW_PDF_NOTICE);
    const text = pages.join(' ').replace(/\s+/g, ' ');
    for (const amount of ['4000', '1000', '3000', '600', '200', '20']) expect(text).toContain(amount);
    expect(text).toContain('Tax-free assistance');
    for (const secret of [input.taxpayer.primary.ssn, 'prepaid-account', 'Synthetic actual tuition credit application']) expect(text).not.toContain(secret);
    await fillReturn(redacted, rendered, { blankFormsDir: 'forms/blank/2025', outputDir: directory, educationReview: context });
    const pdf = await PDFDocument.load(await readFile(join(directory, 'f5329-primary-filled.pdf'))), form = pdf.getForm();
    expect(form.getTextField(F.line5).getText()).toBe('200');
    expect(form.getTextField(F.line8).getText()).toBe('20');
    expect(form.getTextField(F.ssn).getText() ?? '').toBe('');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
