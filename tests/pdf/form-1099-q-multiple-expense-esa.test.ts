// Spec: spec/federal/form-1099-q-multiple-expense-esa.yaml.
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
import { multipleEsaFixture } from '../fixtures/education-multiple-esa.js';

it('binds both original tuition expenses before producing the review packet', async () => {
  const original = multipleEsaFixture(), result = calculateFederalTax(original), context = prepareEducationReview(original);
  const input = redactReviewIdentifiers(original), rendered = redactReviewIdentifiers(result);
  const directory = await mkdtemp(join(tmpdir(), 'multiple-esa-review-'));
  try {
    const summary = buildForm1099QReferenceSummary(input.form1099Q, rendered.form1099Q!, input.qualifiedEducationExpenses, context);
    expect(summary.sourceLines.filter(row => row.line.includes(':in-kind-esa:')).map(row => [row.line, row.value]))
      .toEqual([['prepaid:in-kind-esa:fall-tuition', '1000'], ['prepaid:in-kind-esa:spring-tuition', '500']]);
    for (const mutation of ['balanced-second-expense', 'balanced-election', 'remove-second-benefit', 'remove-allocation', 'missing-second-audit']) {
      const changed = structuredClone(input), facts = changed.qualifiedEducationExpenses!.sourceFacts!;
      if (mutation === 'balanced-second-expense') { facts.expenses![1]!.amount = '3501'; facts.expenses![1]!.taxFreeAssistance = '501'; }
      if (mutation === 'balanced-election') { facts.allocations![0]!.amount = '1500'; facts.allocations![1]!.amount = '2000'; }
      if (mutation === 'remove-second-benefit') facts.inKindBenefits!.pop();
      if (mutation === 'remove-allocation') facts.allocations!.pop();
      const changedResult = mutation === 'missing-second-audit' ? { ...rendered, form1099Q: { ...rendered.form1099Q!,
        lines: rendered.form1099Q!.lines.filter(row => row.line !== 'prepaid:in-kind-esa:spring-tuition') } } : rendered;
      await expect(fillReturn(changed, changedResult, { blankFormsDir: join(directory, 'absent'), outputDir: directory, educationReview: context }))
        .rejects.toThrow(/stale|conflict|audit|reconcile/);
    }
    expect(await readdir(directory)).toEqual([]);
    await fillReturn(input, rendered, { blankFormsDir: 'forms/blank/2025', outputDir: directory, educationReview: context });
    const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pathlib import Path;from pypdf import PdfReader\np=Path(sys.argv[1]);f=PdfReader(p/"f5329-primary-filled.pdf").get_fields();print(json.dumps({"fields":[f[k].get("/V", "") for k in sys.argv[2:]],"pages":[page.extract_text() or "" for q in sorted(p.glob("*.pdf")) for page in PdfReader(q).pages]}))',
      directory, F.line5, F.line6, F.line8, F.ssn], { encoding: 'utf8', timeout: 10000 })) as { fields: string[]; pages: string[] };
    expect(checked.fields).toEqual(['950', '200', '75', '']);
    for (const page of checked.pages) {
      expect(page).toContain(REVIEW_PDF_NOTICE);
      for (const secret of [original.taxpayer.primary.ssn, 'prepaid-account', 'actual-esa-account', 'Synthetic actual tuition credit application']) expect(page).not.toContain(secret);
    }
    for (const amount of ['Expense 1: Actual paid expense: $4500', 'Expense 2: Actual paid expense: $3500', 'Expense 1: Expense remaining after actual in-kind benefit allocation: $2500', 'Expense 2: Expense remaining after actual in-kind benefit allocation: $2000']) expect(checked.pages.join(' ')).toContain(amount);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
