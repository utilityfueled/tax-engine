// Spec: spec/federal/cod-zero-minimum-tax-credit-bound.yaml review.
import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFederalTax } from '@/engine/federal';
import { buildForm982ReferenceSummary } from '@/pdf/fill-form-982';
import { prepareCodNolReview, codNolReviewOriginalSourceInput } from '@/pdf/cod-nol-review-context';
import { prepareQbiLossReview } from '@/pdf/qbi-loss-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { fillReturn } from '@/pdf/fill-return';
import { d } from '@/utils/decimal';
import { partialPersonalLegacyNolZeroPoolInput } from '../fixtures/cod-zero-minimum-tax-credit-bound';

it('prints the zero pool proof while leaving signed generation explicitly undetermined', async () => {
  const input = partialPersonalLegacyNolZeroPoolInput(), result = calculateFederalTax(input), token = prepareCodNolReview(input);
  const summary = buildForm982ReferenceSummary(result);
  expect(summary.totals).toContainEqual({ label: 'Beginning-next-year minimum tax credit: zero-pool bound', value: '0' });
  expect(summary.totals).toContainEqual({ label: 'Signed current-year minimum tax credit adjustment', value: 'Not determined by the zero-pool proof' });
  expect(summary.totals.some(row => row.label.startsWith('Current-source PartI'))).toBe(false);
  expect(codNolReviewOriginalSourceInput(redactReviewIdentifiers(input), redactReviewIdentifiers(result), token)).toEqual(input);
  const directory = await mkdtemp(join(tmpdir(), 'cod-zero-mtc-bound-'));
  try {
    const files = (await fillReturn(redactReviewIdentifiers(input), result, { outputDir: directory, blankFormsDir: 'forms/blank', codNolReview: token, qbiLossReview: prepareQbiLossReview(input) })).filledForms;
    const pdf = files.find(file => file.endsWith('f982-reference-filled.pdf'))!;
    const text = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'from pypdf import PdfReader;import sys;print(" ".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))', pdf],
    { encoding: 'utf8', timeout: 5000 }).replace(/\s+/g, ' ');
    expect(text).toContain('Beginning-next-year minimum tax credit: zero-pool bound: 0');
    expect(text).toContain('Signed current-year minimum tax credit adjustment: Not determined by the zero-pool proof');
    expect(text).toContain('Regular actual current-tax NOL use: 15000');
    expect(text).not.toContain('Current-source PartI');
    expect(text).not.toContain('123-45-6789'); expect(text).not.toContain('Fictional complete current adjustment');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('rejects changed zero-proof source and result premises before any output', async () => {
  const input = partialPersonalLegacyNolZeroPoolInput(), token = prepareCodNolReview(input), qbiLossReview = prepareQbiLossReview(input);
  const directory = await mkdtemp(join(tmpdir(), 'cod-zero-mtc-bound-context-'));
  try {
    for (const variant of ['source-reference', 'current-legacy', 'actual-amt', 'current-carry', 'following-pool', 'missing-proof'] as const) {
      const source = redactReviewIdentifiers(input), result = calculateFederalTax(input);
      if (variant === 'source-reference') source.form982AttributeSources!.currentMinimumTaxCredit!.sourceReference = 'Different actual same-money record';
      if (variant === 'current-legacy') source.form982AttributeSources!.currentMinimumTaxCredit!.currentYearUnallowedQualifiedElectricVehicleCredit = '1';
      if (variant === 'actual-amt') result.form6251!.amt = d('1');
      if (variant === 'current-carry') result.form8801!.carryforwardToNextYear = d('1');
      if (variant === 'following-pool') result.codZeroMinimumTaxCreditBound!.followingYearPool = d('1');
      if (variant === 'missing-proof') result.codZeroMinimumTaxCreditBound = undefined;
      for (const present of [false, true]) {
        const outputDir = join(directory, `${variant}-${present}`);
        if (present) { await mkdir(outputDir); await writeFile(join(outputDir, 'unrelated.txt'), 'Preserved original file'); }
        await expect(fillReturn(source, result, { outputDir, blankFormsDir: 'forms/blank', codNolReview: token, qbiLossReview })).rejects.toThrow(/COD.*source|COD.*reconcile|QBI loss review original sources/i);
        if (present) { expect(await readdir(outputDir)).toEqual(['unrelated.txt']); expect(await readFile(join(outputDir, 'unrelated.txt'), 'utf8')).toBe('Preserved original file'); }
        else expect(await stat(outputDir).then(() => true, () => false)).toBe(false);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
