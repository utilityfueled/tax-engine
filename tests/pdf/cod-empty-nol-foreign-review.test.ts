// Spec: spec/federal/cod-empty-nol-foreign.yaml reference-closing/reference-context.
import { expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFederalTax } from '@/engine/federal';
import { fillReturn } from '@/pdf/fill-return';
import { buildForm1116ReferenceSummary } from '@/pdf/fill-form-1116';
import { buildForm982ReferenceSummary } from '@/pdf/fill-form-982';
import { prepareCodNolReview, codNolReviewOriginalSourceInput } from '@/pdf/cod-nol-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { d } from '@/utils/decimal';
import type { CalculatedLine, TaxReturnResult } from '@/models/outputs';
import { codEmptyNolForeignInput } from '../fixtures/cod-empty-nol-foreign';

it('saves independent before and after COD foreign balances without changing current tax', async () => {
  for (const method of ['ordinary', 'deduction'] as const) {
    const input = codEmptyNolForeignInput(method), result = calculateFederalTax(input), context = prepareCodNolReview(input);
    const summary = JSON.stringify(buildForm1116ReferenceSummary(result));
    expect(summary).toContain('before COD'); expect(summary).toContain('after COD');
    if (method === 'deduction') {
      expect(summary).toContain('573'); expect(summary).toContain('55'); expect(summary).toContain('327'); expect(summary).toContain('145');
      const cod = JSON.stringify(buildForm982ReferenceSummary(result)); expect(cod).toContain('deemed absorption');
    }
    const directory = await mkdtemp(join(tmpdir(), 'cod-foreign-empty-'));
    try {
      const files = (await fillReturn(redactReviewIdentifiers(input), result, { outputDir: directory, blankFormsDir: 'forms/blank', codNolReview: context })).filledForms;
      const path = files.find(file => file.endsWith('f1116-reference-filled.pdf')); expect(path).toBeDefined();
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages]))', path!], { encoding: 'utf8', timeout: 5000 }));
      expect(pages.every(page => page.includes(REVIEW_PDF_NOTICE))).toBe(true);
      const text = pages.join(' ').replace(/\s+/g, ' '); expect(text).toContain('after COD');
      for (const secret of ['112233445', '123-45-6789', 'Private synthetic', 'Actual fictional']) expect(text).not.toContain(secret);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

it('rejects stale foreign and derived absorption contexts before output', async () => {
  const input = codEmptyNolForeignInput(), original = calculateFederalTax(input), token = prepareCodNolReview(input);
  const redacted = redactReviewIdentifiers(input);
  for (const mutate of [
    (result: typeof original) => { result.foreignTaxDeductionCarryover!.amt!.absorbed = d('56'); },
    (result: typeof original) => { result.codAttributeReduction!.regular.records[0]!.deemedAbsorption = d('572'); },
    (result: typeof original) => { result.codAttributeReduction!.alternativeTax.records.push(result.codAttributeReduction!.alternativeTax.records[0]!); },
    (result: typeof original) => { result.codAttributeReduction = undefined; },
    (result: typeof original) => { result.carryforwards.foreignTaxCreditCarryforward = d('328'); },
  ]) {
    const changed = calculateFederalTax(input); mutate(changed);
    expect(() => buildForm1116ReferenceSummary(changed)).toThrow(/foreign|carry|COD|audit|reconcile/i);
    expect(() => codNolReviewOriginalSourceInput(redacted, changed, token)).toThrow(/reconcile/i);
  }
  const changed = structuredClone(redacted); changed.foreignTaxElection!.deductionYearCarryover!.amt!.sourceReference = 'Changed same-value source';
  const directory = await mkdtemp(join(tmpdir(), 'cod-foreign-stale-'));
  try {
    await expect(fillReturn(changed, original, { outputDir: directory, blankFormsDir: 'forms/blank', codNolReview: token })).rejects.toThrow(/source|stale/i);
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


// Spec: cod-empty-nol-foreign.yaml reference-current-tax/reference-complete-result.
// These retained original-source expectations reproduce independent e0 review
// findings. Both the context API and actual exporter must fail before any I/O.
async function assertUnchangedOutputDirectories(input: ReturnType<typeof codEmptyNolForeignInput>,
  result: TaxReturnResult, token: ReturnType<typeof prepareCodNolReview>) {
  const root = await mkdtemp(join(tmpdir(), 'cod-foreign-current-tax-'));
  const redacted = redactReviewIdentifiers(input);
  try {
    expect.soft(() => codNolReviewOriginalSourceInput(redacted, result, token)).toThrow(/reconcile/i);
    for (const existing of [false, true]) {
      const directory = join(root, existing ? 'existing' : 'absent');
      const sentinel = join(directory, 'unrelated-original.txt');
      if (existing) {
        await mkdir(directory);
        await writeFile(sentinel, 'Retain this pre-existing original exactly.');
      }
      let rejection: unknown = null;
      let paths: string[] | null = null;
      try {
        paths = (await fillReturn(redacted, result, { outputDir: directory,
          blankFormsDir: 'forms/blank', codNolReview: token })).filledForms;
      } catch (error) { rejection = error; }
      expect.soft(rejection instanceof Error ? rejection.message : null).toMatch(/reconcile/i);
      expect.soft(paths).toBeNull();
      if (existing) {
        expect.soft(await readdir(directory)).toEqual(['unrelated-original.txt']);
        expect.soft(await readFile(sentinel, 'utf8')).toBe('Retain this pre-existing original exactly.');
      } else {
        expect.soft(await stat(directory).then(() => true, () => false)).toBe(false);
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
}

it('rejects manufactured actual foreign credits before creating or changing output directories', async () => {
  const input = codEmptyNolForeignInput('deduction');
  const inputBefore = JSON.stringify(input);
  const token = prepareCodNolReview(input);
  const regular = calculateFederalTax(input);
  expect(regular.foreignTaxCredit.eq(0)).toBe(true);
  regular.foreignTaxCredit = d('1');
  await assertUnchangedOutputDirectories(input, regular, token);

  const alternative = calculateFederalTax(input);
  const form = alternative.form6251!;
  const line7 = form.lines.find(row => row.form === 'Form 6251' && row.line === '7')!;
  expect(line7.value.toString()).toBe('3094');
  expect(form.lines.some(row => row.form === 'Form 6251' && row.line === '8')).toBe(false);
  const changedTmt = line7.value.minus('1');
  const coherentCredit = (rows: CalculatedLine[]): CalculatedLine[] => [
    ...rows.filter(row => !(row.form === 'Form 6251' && row.line === '8')).map(row =>
      row.form === 'Form 6251' && row.line === '9'
        ? { ...row, value: changedTmt, inputs: { line7: line7.value, line8: d('1') } } : row),
    { ...line7, line: '8', description: 'Manufactured actual foreign credit', value: d('1'), inputs: {} },
  ];
  form.lines = coherentCredit(form.lines);
  form.tentativeMinimumTax = changedTmt;
  alternative.allLines = coherentCredit(alternative.allLines);
  expect(alternative.amt.eq(0)).toBe(true);
  await assertUnchangedOutputDirectories(input, alternative, token);
  expect(JSON.stringify(input)).toBe(inputBefore);
});

it('binds complete actual tax audits and totals while accepting canonical redacted results', async () => {
  const input = codEmptyNolForeignInput('deduction');
  const original = calculateFederalTax(input);
  const token = prepareCodNolReview(input);
  const redacted = redactReviewIdentifiers(input);
  expect(codNolReviewOriginalSourceInput(redacted, original, token)).toEqual(input);
  expect(codNolReviewOriginalSourceInput(redacted, redactReviewIdentifiers(original), token)).toEqual(input);
  const mutations: Array<(result: TaxReturnResult) => void> = [
    result => { result.totalTaxBeforeCredits = result.totalTaxBeforeCredits.plus(1); },
    result => { result.totalCredits = result.totalCredits.plus(1); },
    result => { result.totalTax = result.totalTax.plus(1); },
    result => { result.refund = result.refund.plus(1); },
    result => { result.form6251!.lines = result.form6251!.lines.filter(row => row.line !== '7'); },
    result => { result.allLines.push({ form: 'Schedule 3', line: '1', description: 'Manufactured actual credit',
      value: d('1'), formula: 'Manufactured value', inputs: {} }); },
    result => { result.allLines = result.allLines.map(row => row.form === '1040' && row.line === '16'
      ? { ...row, value: row.value.plus(1) } : row); },
  ];
  for (const mutate of mutations) {
    const changed = calculateFederalTax(input);
    const before = JSON.stringify(changed); mutate(changed);
    expect(JSON.stringify(changed)).not.toBe(before);
    await assertUnchangedOutputDirectories(input, changed, token);
  }
});
