/** Spec: spec/state/oh-ordinary-official-review.yaml. Existing API before physical products. */
import { expect, it } from 'vitest';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateOhioResidentReturnFromFederal } from '@/engine/state/oh-engine.js';
import { prepareOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { fillOhioReferenceForms } from '@/pdf/mappings/2025/fill-oh-reference-forms.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { ohioPaymentFixture } from '../fixtures/oh-payments.js';
import { ohioOrdinaryOfficialReviewFixture } from '../fixtures/oh-ordinary-official-review.js';

it('Ohio ordinary paper source preconditions preserve independently pinned values', () => {
  const input = ohioOrdinaryOfficialReviewFixture(), before = JSON.stringify(input), federal = calculateFederalTax(input);
  const ohio = calculateOhioResidentReturnFromFederal({ taxInput: input, federalResult: federal });
  expect(federal.agi.toString()).toBe('100000');
  expect(ohio.it1040.line3_ohioAgi.toString()).toBe('100000');
  expect(ohio.it1040.line4_exemptions.toString()).toBe('1900');
  expect(ohio.it1040.line8c_totalTax.toString()).toBe('2323');
  expect(new Decimal('2323').times('.8').toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString()).toBe('1858');
  expect(ohio.nonresidentCreditResult?.line20.toString()).toBe('1858');
  expect(ohio.it1040.line10_taxAfterCredits.toString()).toBe('465');
  expect(ohio.it1040.line14_ohioWithholding.toString()).toBe('1000');
  expect(ohio.it1040.line26_refund.toString()).toBe('535');
  expect(JSON.stringify(input)).toBe(before);
});

it('Ohio ordinary actual source review emits all four official companions', async () => {
  const input = ohioOrdinaryOfficialReviewFixture(), before = JSON.stringify(input), federal = calculateFederalTax(input);
  const context = prepareOhioResidencyReview(input), dir = await mkdtemp(join(tmpdir(), 'oh-actual-paper-'));
  try {
    const result = await fillOhioReferenceForms(redactReviewIdentifiers(input), federal, dir, {}, context);
    const names = result.filledForms.map(p => basename(p));
    const expected = { 'oh-it-1040-review.pdf': 2, 'oh-it-nrc-review.pdf': 1,
      'oh-schedule-credits-review.pdf': 2, 'oh-schedule-of-withholding-review.pdf': 2 };
    for (const [filename, pages] of Object.entries(expected)) {
      expect(names).toContain(filename);
      const text = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "from pypdf import PdfReader\nimport sys\nr=PdfReader(sys.argv[1],strict=True)\nassert len(r.pages)==int(sys.argv[2])\nassert not r.get_fields()\nfor p in r.pages:\n assert all(a.get_object().get('/Subtype')!='/Widget' for a in p.get('/Annots',[]))\n text=p.extract_text() or ''\n assert 'FOR REVIEW ONLY - NOT FOR FILING' in text\nprint('\\n'.join(p.extract_text() or '' for p in r.pages))", join(dir, filename), String(pages)], { encoding: 'utf8' });
      expect(text).not.toContain(input.taxpayer.primary.ssn);
      expect(text).not.toContain('90-7000612');
      expect(text).not.toContain('PRIVATE-FICTIONAL-');
      expect(text).not.toContain('PRIVATE-OH-ORIGINAL-ID');
      if (filename === 'oh-it-nrc-review.pdf') { expect(text).toContain('.8000'); expect(text).not.toContain('0.8000'); }
      if (filename === 'oh-it-1040-review.pdf') { expect(text).toContain('9999'); expect(text).toContain('535'); }
    }
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it.each(['forged context', 'changed original', 'stale federal'] as const)('Ohio ordinary paper rejects conflicting source before output %s', async kind => {
  const input = ohioOrdinaryOfficialReviewFixture(), federal = calculateFederalTax(input), context = prepareOhioResidencyReview(input);
  const dir = await mkdtemp(join(tmpdir(), 'oh-paper-denial-')), output = join(dir, 'must-not-exist');
  if (kind === 'changed original') { const w2 = input.w2s[0]; if (!w2) throw new Error('Actual W2 required'); w2.employer.name = 'Changed actual same-money employer'; }
  if (kind === 'stale federal') federal.agi = federal.agi.plus(1);
  try {
    await expect(fillOhioReferenceForms(redactReviewIdentifiers(input), federal, output, {}, kind === 'forged context' ? {} as typeof context : context)).rejects.toThrow();
    await expect(access(output)).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('Ohio ordinary physical boundary preserves legacy reference without inventing actual rows', async () => {
  const input = ohioPaymentFixture('nonresident'), before = JSON.stringify(input);
  const federal = calculateFederalTax(input), context = prepareOhioResidencyReview(input);
  expect(input.w2s[0]?.stateLocalSources).toBeUndefined();
  const ohio = calculateOhioResidentReturnFromFederal({ taxInput: input, federalResult: federal });
  expect(ohio.it1040.line10_taxAfterCredits.toString()).toBe('465');
  expect(ohio.it1040.line22_totalAmountDue.toString()).toBe('465');
  const dir = await mkdtemp(join(tmpdir(), 'oh-legacy-reference-boundary-'));
  try {
    const output = await fillOhioReferenceForms(redactReviewIdentifiers(input), federal, dir, {}, context);
    expect(output.filledForms.map(path => basename(path)).sort()).toEqual([
      'oh-it-1040-reference.pdf', 'oh-it-nrc-reference.pdf', 'oh-it-sd-2210-reference.pdf',
      'oh-schedule-credits-reference.pdf',
    ]);
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
