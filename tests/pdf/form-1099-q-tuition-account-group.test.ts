// Spec: spec/federal/form-1099-q-tuition-account-group.yaml.
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
import { tuitionAccountGroupFixture } from '../fixtures/education-tuition-account-group.js';

it('binds the shared tuition account group before review output', async () => {
  const original = tuitionAccountGroupFixture(), result = calculateFederalTax(original), context = prepareEducationReview(original);
  const input = redactReviewIdentifiers(original), rendered = redactReviewIdentifiers(result);
  const directory = await mkdtemp(join(tmpdir(), 'tuition-account-group-review-'));
  try {
    const summary = buildForm1099QReferenceSummary(input.form1099Q, rendered.form1099Q!, input.qualifiedEducationExpenses, context);
    expect(summary.sourceLines.filter(row => row.line.includes(':in-kind-esa:')).map(row => [row.line, row.value]))
      .toEqual([['prepaid:in-kind-esa:tuition-invoice', '1000'], ['prepaid-spring:in-kind-esa:tuition-invoice', '500']]);
    for (const mutation of ['balanced-account-basis', 'balanced-election', 'remove-second-benefit', 'remove-allocation', 'missing-second-audit', 'swapped-earnings', 'removed-second-form']) {
      const changed = structuredClone(input), facts = changed.qualifiedEducationExpenses!.sourceFacts!;
      if (mutation === 'balanced-account-basis') { facts.coverdellAccounts![0]!.priorYearBasis = '3201'; facts.coverdellAccounts![1]!.priorYearBasis = '799'; }
      if (mutation === 'balanced-election') { facts.allocations![0]!.amount = '1500'; facts.allocations![2]!.amount = '2500'; }
      if (mutation === 'remove-second-benefit') facts.inKindBenefits!.pop();
      if (mutation === 'remove-allocation') facts.allocations!.pop();
      if (mutation === 'swapped-earnings') { changed.form1099Q[0]!.earnings = '600'; changed.form1099Q[0]!.basis = '1900'; changed.form1099Q[1]!.earnings = '500'; changed.form1099Q[1]!.basis = '1000'; }
      if (mutation === 'removed-second-form') changed.form1099Q.splice(1, 1);
      const changedResult = mutation === 'missing-second-audit' ? { ...rendered, form1099Q: { ...rendered.form1099Q!,
        lines: rendered.form1099Q!.lines.filter(row => row.line !== 'prepaid-spring:in-kind-esa:tuition-invoice') } } : rendered;
      await expect(fillReturn(changed, changedResult, { blankFormsDir: join(directory, 'absent'), outputDir: directory, educationReview: context }))
        .rejects.toThrow(/stale|conflict|audit|reconcile/);
    }
    expect(await readdir(directory)).toEqual([]);
    await fillReturn(input, rendered, { blankFormsDir: 'forms/blank/2025', outputDir: directory, educationReview: context });
    const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pathlib import Path;from pypdf import PdfReader\np=Path(sys.argv[1]);f=PdfReader(p/"f5329-primary-filled.pdf").get_fields();print(json.dumps({"fields":[f[k].get("/V", "") for k in sys.argv[2:]],"pages":[page.extract_text() or "" for q in sorted(p.glob("*.pdf")) for page in PdfReader(q).pages]}))',
      directory, F.line5, F.line6, F.line8, F.ssn], { encoding: 'utf8', timeout: 10000 })) as { fields: string[]; pages: string[] };
    expect(checked.fields).toEqual(['1200', '300', '90', '']);
    for (const page of checked.pages) {
      expect(page).toContain(REVIEW_PDF_NOTICE);
      for (const secret of [original.taxpayer.primary.ssn, 'prepaid-account', 'prepaid-spring-account', 'actual-esa-account', 'esa-second-account', 'Synthetic actual tuition credit application']) expect(page).not.toContain(secret);
    }
    for (const amount of ['Expense 1: Actual paid expense: $8000', 'Expense 1: Expense remaining after actual in-kind benefit allocation: $4500']) expect(checked.pages.join(' ')).toContain(amount);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
