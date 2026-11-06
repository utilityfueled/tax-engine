// Spec: spec/federal/form-1099-q-in-kind-k12.yaml. Derived statutory controls.
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
import { inKindK12Fixture } from '../fixtures/education-in-kind-k12.js';

it('binds the actual plan and cash-cap sources before review output', async () => {
  const input = inKindK12Fixture(2025), result = calculateFederalTax(input), context = prepareEducationReview(input);
  const redacted = redactReviewIdentifiers(input), rendered = redactReviewIdentifiers(result);
  if (!result.form1099Q || !rendered.form1099Q) throw new Error('Missing education result');
  const originalResult = result.form1099Q;
  expect(JSON.stringify(context)).toBe('{}');
  const shown = buildForm1099QReferenceSummary(redacted.form1099Q, rendered.form1099Q, redacted.qualifiedEducationExpenses, context);
  expect(shown.sourceLines.find(row => row.line.includes(':in-kind-k12:'))?.value).toBe('4000');
  expect(shown.sourceLines.find(row => row.line === 'educator:k12-qualified')?.value).toBe('1000');
  const directory = await mkdtemp(join(tmpdir(), 'in-kind-k12-'));
  try {
    for (const mutation of ['program-reference', 'outside-cash', 'cash-confirmation', 'provided-date', 'missing-plan-audit', 'missing-cap-audit']) {
      const changed = structuredClone(redacted), facts = changed.qualifiedEducationExpenses!.sourceFacts!;
      if (mutation === 'program-reference') facts.inKindBenefits![0].prepaidPlanSourceReference = 'Different original contract';
      if (mutation === 'outside-cash') facts.beneficiaries![0].outsideK12QualifiedDistributions = '9000.01';
      if (mutation === 'cash-confirmation') facts.beneficiaries![0].outsideK12CashOnlyConfirmed = false;
      if (mutation === 'provided-date') facts.inKindBenefits![0].providedDate = '2025-07-04';
      const changedResult = mutation.startsWith('missing-') ? { ...rendered, form1099Q: { ...rendered.form1099Q, lines: rendered.form1099Q.lines.filter(row => mutation === 'missing-plan-audit' ? !row.line.includes('in-kind-k12') : !row.line.includes('k12-qualified')) } } : rendered;
      await expect(fillReturn(changed, changedResult, { blankFormsDir: join(directory, 'absent'), outputDir: directory, educationReview: context })).rejects.toThrow(/stale|conflict|calculation|audit|source/);
      await expect(fillForm5329(changed, changedResult, join(directory, 'absent.pdf'), 'primary', context)).rejects.toThrow(/stale|conflict|calculation|audit|source/);
    }
    expect(await readdir(directory)).toEqual([]);
    for (const field of ['prepaidPlanSourceReference', 'outsideK12QualifiedDistributions']) {
      const changed = structuredClone(input.qualifiedEducationExpenses)!;
      if (field === 'prepaidPlanSourceReference') changed.sourceFacts!.inKindBenefits![0].prepaidPlanSourceReference = 'Other actual contract';
      else changed.sourceFacts!.beneficiaries![0].outsideK12QualifiedDistributions = '9000.01';
      expect(() => buildForm1099QReferenceSummary(input.form1099Q, originalResult, changed)).toThrow(/audit|source/);
    }
    const path = await fillForm1099QReference(redacted.form1099Q, rendered.form1099Q, redacted.qualifiedEducationExpenses, directory, context);
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', 'import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8' })) as string[];
    for (const page of pages) expect(page).toContain(REVIEW_PDF_NOTICE);
    const text = pages.join(' ').replace(/\s+/g, ' ');
    for (const value of ['4000', '9000', '1000', '200', '20']) expect(text).toContain(value);
    for (const secret of [input.taxpayer.primary.ssn, 'actual-cash-account', 'Synthetic original qualified prepaid contract']) expect(text).not.toContain(secret);
    await fillReturn(redacted, rendered, { blankFormsDir: 'forms/blank/2025', outputDir: directory, educationReview: context });
    const pdf = await PDFDocument.load(await readFile(join(directory, 'f5329-primary-filled.pdf'))), form = pdf.getForm();
    expect(form.getTextField(F.line5).getText()).toBe('200');
    expect(result.form1099Q.perRecipient[0].penaltyException.toFixed()).toBe('0');
    // The existing physical mapping leaves zero-valued currency fields blank.
    expect(form.getTextField(F.line6).getText() ?? '').toBe('');
    expect(form.getTextField(F.line7).getText()).toBe('200');
    expect(form.getTextField(F.line8).getText()).toBe('20');
    expect(form.getTextField(F.ssn).getText() ?? '').toBe('');
    const early = inKindK12Fixture(2025);
    early.qualifiedEducationExpenses!.sourceFacts!.expenses![0].category = 'k12_books';
    early.form1099Q.forEach(source => { source.distributionDate = '2025-07-04'; });
    early.qualifiedEducationExpenses!.sourceFacts!.inKindBenefits![0].providedDate = '2025-07-04';
    early.qualifiedEducationExpenses!.sourceFacts!.expenses![0].paidDate = '2025-07-04';
    const earlyResult = calculateFederalTax(early);
    expect(buildForm1099QReferenceSummary(early.form1099Q, earlyResult.form1099Q!, early.qualifiedEducationExpenses).lines.find(row => row.line === 'taxable-earnings')?.value).toBe('1200');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
