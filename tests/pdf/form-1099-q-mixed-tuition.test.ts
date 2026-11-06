// Spec: spec/federal/form-1099-q-mixed-tuition.yaml.
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
import { mixedTuitionFixture } from '../fixtures/education-mixed-tuition.js';

function required<T>(value: T | undefined): T { if (value === undefined) throw new Error('Missing actual fictional source'); return value; }
it('binds mixed original accounts before private review output', async () => {
  const original = mixedTuitionFixture(), result = calculateFederalTax(original), context = prepareEducationReview(original);
  const input = redactReviewIdentifiers(original), rendered = redactReviewIdentifiers(result);
  const directory = await mkdtemp(join(tmpdir(), 'mixed-tuition-review-'));
  try {
    const summary = buildForm1099QReferenceSummary(input.form1099Q, required(rendered.form1099Q), input.qualifiedEducationExpenses, context);
    expect(summary.forms.map(row => row.distributionForm)).toEqual(['Prepaid tuition or in-kind benefit', 'Cash distribution', 'Cash distribution']);
    expect(summary.sourceLines.filter(row => row.line.includes(':in-kind-provided')).map(row => row.line)).toEqual(['prepaid:in-kind-provided']);
    expect(summary.sourceLines.filter(row => row.line.includes(':in-kind-esa:')).map(row => [row.line, row.value])).toEqual([['prepaid:in-kind-esa:tuition', '1000']]);
    for (const mutation of ['balanced-earnings', 'balanced-election', 'missing-cash', 'changed-medium', 'changed-recipient', 'unknown-basis', 'forged-audit']) {
      const changed = structuredClone(input), facts = required(changed.qualifiedEducationExpenses?.sourceFacts), cash = required(changed.form1099Q.find(row => row.sourceId === 'cash-qtp'));
      if (mutation === 'balanced-earnings') { cash.earnings = '999'; cash.basis = '1001'; }
      if (mutation === 'balanced-election') { required(facts.allocations?.find(row => row.sourceId === 'cash-qtp')).amount = '1500'; required(facts.allocations?.find(row => row.sourceId === 'esa')).amount = '3500'; }
      if (mutation === 'missing-cash') changed.form1099Q = changed.form1099Q.filter(row => row.sourceId !== 'cash-qtp');
      if (mutation === 'changed-medium') cash.distributionMedium = 'in_kind_prepaid_tuition';
      if (mutation === 'changed-recipient') changed.taxpayer.primary.firstName = 'Changed original claimant';
      if (mutation === 'unknown-basis') required(facts.coverdellAccounts?.[0]).priorYearBasis = undefined;
      const changedResult = mutation === 'forged-audit' ? { ...rendered, form1099Q: { ...required(rendered.form1099Q),
        lines: required(rendered.form1099Q).lines.filter(row => row.line !== 'prepaid:in-kind-esa:tuition') } } : rendered;
      await expect(fillReturn(changed, changedResult, { blankFormsDir: join(directory, 'absent'), outputDir: directory, educationReview: context }))
        .rejects.toThrow(/stale|conflict|audit|reconcile/);
    }
    expect(await readdir(directory)).toEqual([]);
    await fillReturn(input, rendered, { blankFormsDir: 'forms/blank/2025', outputDir: directory, educationReview: context });
    const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pathlib import Path;from pypdf import PdfReader\np=Path(sys.argv[1]);f=PdfReader(p/"f5329-primary-filled.pdf").get_fields();print(json.dumps({"fields":[f[k].get("/V", "") for k in sys.argv[2:]],"pages":[page.extract_text() or "" for q in sorted(p.glob("*.pdf")) for page in PdfReader(q).pages]}))',
      directory, F.line5, F.line6, F.line8, F.ssn], { encoding: 'utf8', timeout: 10000 })) as { fields: string[]; pages: string[] };
    expect(checked.fields).toEqual(['1500', '200', '130', '']);
    const text = checked.pages.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Distribution form: Cash distribution');
    expect(text).toContain('Distribution form: Prepaid tuition or in-kind benefit');
    for (const page of checked.pages) {
      expect(page).toContain(REVIEW_PDF_NOTICE);
      for (const secret of [original.taxpayer.primary.ssn, 'prepaid-account', 'actual-esa-account', 'actual-cash-qtp-account', 'Synthetic actual tuition credit application']) expect(page).not.toContain(secret);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
