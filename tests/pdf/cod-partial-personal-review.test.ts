// Spec: spec/federal/cod-partial-personal-insolvency.yaml review.
import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFederalTax } from '@/engine/federal';
import { buildForm982ReferenceSummary } from '@/pdf/fill-form-982';
import { codNolReviewOriginalSourceInput, prepareCodNolReview } from '@/pdf/cod-nol-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { fillReturn } from '@/pdf/fill-return';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { d } from '@/utils/decimal';
import { partialPersonalBasisInput } from '../fixtures/cod-partial-personal';

it('retains the original personal interest and after-tax closing evidence before any output', async () => {
  const input = partialPersonalBasisInput(), original = JSON.stringify(input), result = calculateFederalTax(input);
  const token = prepareCodNolReview(input), redacted = redactReviewIdentifiers(input);
  expect(codNolReviewOriginalSourceInput(redacted, result, token)).toEqual(input);
  expect(codNolReviewOriginalSourceInput(redacted, redactReviewIdentifiers(result), token)).toEqual(input);
  const summary = buildForm982ReferenceSummary(result);
  for (const [label, value] of [
    ['Complete original discharged debt', '18000'], ['Nondeductible interest included in original debt', '1200'],
    ['Exact original excluded debt', '10000'], ['Exact taxable personal canceled debt', '8000'],
    ['Regular remaining property basis', '72000'], ['Regular unreduced excluded debt', '7000'],
  ]) expect(summary.totals).toContainEqual({ label, value });
  const directory = await mkdtemp(join(tmpdir(), 'cod-partial-personal-'));
  try {
    const files = (await fillReturn(redacted, result, { outputDir: directory, blankFormsDir: 'forms/blank', codNolReview: token })).filledForms;
    const reference = files.find(file => file.endsWith('f982-reference-filled.pdf'))!;
    const schedule = files.find(file => file.endsWith('f1040s1-filled.pdf'))!;
    expect(reference).toBeDefined(); expect(schedule).toBeDefined();
    const saved: { pages: string[]; debt: string } = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
import json,sys
from pypdf import PdfReader
pages=[p.extract_text() for p in PdfReader(sys.argv[1]).pages]
fields=PdfReader(sys.argv[2]).get_fields()
debt=[v.get('/V','') for k,v in fields.items() if k.endswith('f1_15[0]')]
assert len(debt)==1
print(json.dumps({'pages':pages,'debt':str(debt[0])}))
`, reference, schedule], { encoding: 'utf8', timeout: 5000 }));
    expect(saved.debt).toBe('8000');
    for (const page of saved.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = saved.pages.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Complete original discharged debt: 18000');
    expect(text).toContain('Nondeductible interest included in original debt: 1200');
    expect(text).toContain('Exact taxable personal canceled debt: 8000');
    expect(text).toContain('Regular property 1 remaining basis: 72000');
    for (const secret of ['123-45-6789', 'Fictional', 'original consumer borrowing', 'retained-personal-property']) expect(text).not.toContain(secret);
    expect(JSON.stringify(input)).toBe(original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('rejects same-money personal source replacement and altered federal amounts before I/O', async () => {
  const input = partialPersonalBasisInput(), token = prepareCodNolReview(input), redacted = redactReviewIdentifiers(input);
  const directory = await mkdtemp(join(tmpdir(), 'cod-partial-personal-context-'));
  try {
    for (const variant of ['use-source', 'interest-source', 'discharge', 'taxable', 'total-tax'] as const) {
      const source = structuredClone(redacted), result = calculateFederalTax(input);
      if (variant === 'use-source') source.form982NolSources.debts[0]!.personalDebt.useSourceReference = 'Different actual same-money purchase records';
      if (variant === 'interest-source') source.form982NolSources.debts[0]!.personalDebt.interestSourceReference = 'Different actual same-money interest records';
      if (variant === 'discharge') result.codNolReduction!.sourceDischargedAmount = d('18001');
      if (variant === 'taxable') result.codNolReduction!.sourceTaxableAmount = d('8001');
      if (variant === 'total-tax') result.totalTax = result.totalTax.plus(1);
      for (const present of [false, true]) {
        const outputDir = join(directory, `${variant}-${present}`);
        if (present) { await mkdir(outputDir); await writeFile(join(outputDir, 'unrelated.txt'), 'Original unrelated file'); }
        await expect(fillReturn(source, result, { outputDir, blankFormsDir: 'forms/blank', codNolReview: token })).rejects.toThrow(/COD.*source|COD.*reconcile/i);
        if (present) {
          expect(await readdir(outputDir)).toEqual(['unrelated.txt']);
          expect(await readFile(join(outputDir, 'unrelated.txt'), 'utf8')).toBe('Original unrelated file');
        } else expect(await stat(outputDir).then(() => true, () => false)).toBe(false);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
