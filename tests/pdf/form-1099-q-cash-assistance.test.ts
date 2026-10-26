// Spec: spec/federal/form-1099-q-cash-assistance.yaml.
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
import { cashAssistanceFixture, requiredCashAssistance as required } from '../fixtures/education-cash-assistance.js';

it('binds original cash assistance sources before review output', async () => {
  const original = cashAssistanceFixture(), result = calculateFederalTax(original), context = prepareEducationReview(original);
  const input = redactReviewIdentifiers(original), rendered = redactReviewIdentifiers(result);
  const directory = await mkdtemp(join(tmpdir(), 'cash-assistance-review-'));
  try {
    const summary = buildForm1099QReferenceSummary(input.form1099Q, required(rendered.form1099Q), input.qualifiedEducationExpenses, context);
    expect(summary.forms.map(row => row.distributionForm)).toEqual(['Prepaid tuition or in-kind benefit', 'Cash distribution']);
    expect(summary.sourceLines.filter(row => row.line.includes(':in-kind-assistance:')).map(row => [row.line, row.value])).toEqual([['prepaid:in-kind-assistance:tuition', '1000']]);
    for (const kind of ['balanced-earnings', 'balanced-assistance', 'missing-cash', 'changed-recipient', 'unknown-assistance', 'forged-audit']) {
      const changed = structuredClone(input), facts = required(changed.qualifiedEducationExpenses?.sourceFacts), cash = required(changed.form1099Q[1]);
      if (kind === 'balanced-earnings') { cash.earnings = '1999'; cash.basis = '6001'; }
      if (kind === 'balanced-assistance') { required(facts.expenses?.[0]).taxFreeAssistance = '2000'; required(facts.allocations?.[1]).amount = '3500'; }
      if (kind === 'missing-cash') changed.form1099Q = [required(changed.form1099Q[0])];
      if (kind === 'changed-recipient') changed.taxpayer.primary.firstName = 'Changed actual claimant';
      if (kind === 'unknown-assistance') required(facts.expenses?.[0]).taxFreeAssistance = undefined;
      const changedResult = kind === 'forged-audit' ? { ...rendered, form1099Q: { ...required(rendered.form1099Q),
        lines: required(rendered.form1099Q).lines.filter(row => row.line !== 'prepaid:in-kind-assistance:tuition') } } : rendered;
      await expect(fillReturn(changed, changedResult, { blankFormsDir: join(directory, 'absent'), outputDir: directory, educationReview: context }))
        .rejects.toThrow(/stale|conflict|audit|reconcile/);
    }
    expect(await readdir(directory)).toEqual([]);
    await fillReturn(input, rendered, { blankFormsDir: 'forms/blank/2025', outputDir: directory, educationReview: context });
    const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pathlib import Path;from pypdf import PdfReader\np=Path(sys.argv[1]);f=PdfReader(p/"f5329-primary-filled.pdf").get_fields();print(json.dumps({"fields":[f[k].get("/V", "") for k in sys.argv[2:]],"pages":[page.extract_text() or "" for q in sorted(p.glob("*.pdf")) for page in PdfReader(q).pages]}))',
      directory, F.line5, F.line6, F.line8, F.ssn], { encoding: 'utf8', timeout: 10000 })) as { fields: string[]; pages: string[] };
    expect(checked.fields).toEqual(['975', '225', '75', '']);
    const text = checked.pages.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Distribution form: Cash distribution');
    expect(text).toContain('Distribution form: Prepaid tuition or in-kind benefit');
    for (const page of checked.pages) {
      expect(page).toContain(REVIEW_PDF_NOTICE);
      for (const secret of [original.taxpayer.primary.ssn, 'prepaid-account', 'fictional-cash-qtp-account', 'Synthetic actual tuition credit application']) expect(page).not.toContain(secret);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
