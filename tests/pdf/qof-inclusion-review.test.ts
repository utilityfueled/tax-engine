// Spec: spec/federal/qof-deferred-gain-inclusion.yaml review.
import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { fillReturn } from '@/pdf/fill-return';
import { SCHEDULE_D_FIELDS as F } from '@/pdf/fill-schedule-d';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { d } from '@/utils/decimal';
import { simpleW2Fixture } from '../fixtures/simple-w2';
import { qofFacts, qofInvestment } from '../fixtures/qof-inclusion';

const input = () => TaxYearInputSchema.parse({ ...simpleW2Fixture,
  qofDispositionFacts: qofFacts(2025, [qofInvestment({ event: 'sale_or_exchange', eventDate: '2025-06-30', investmentDate: '2020-03-01',
    fairMarketValue: '130000', proceeds: '130000', basisBeforeInclusion: '0' })]) });

it('prints the sale row and PartIII reference from complete sources', async () => {
  const source = input(), result = calculateFederalTax(source), directory = await mkdtemp(join(tmpdir(), 'qof-review-'));
  try {
    const files = (await fillReturn(source, result, { outputDir: directory, blankFormsDir: 'forms/blank' })).filledForms;
    const schedule = (await PDFDocument.load(await readFile(files.find(file => file.endsWith('f1040sd-filled.pdf'))!))).getForm();
    expect(schedule.getCheckBox(F.qofDispositionYes).isChecked()).toBe(true);
    expect(schedule.getCheckBox(F.qofDispositionNo).isChecked()).toBe(false);
    const read = (path: string): string[] => JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }));
    const reference = read(files.find(file => file.endsWith('f8997-reference-filled.pdf'))!);
    for (const page of reference) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = reference.join(' ').replace(/\s+/g, ' ');
    for (const literal of ['This is not Form 8997', 'QOF EIN 98-7654321; 2025-06-30', 'Remaining deferred gain before inclusion: 100000', 'basis increase: 10000', 'Long-term included 90000', 'Total long-term previously deferred gain included: 90000']) {
      expect(text).toContain(literal);
    }
    expect(text).not.toContain('123-45-6789');
    const form8949 = (await PDFDocument.load(await readFile(files.find(file => file.endsWith('f8949-filled.pdf'))!))).getForm().getFields()
      .map(field => { try { return (field as unknown as { getText: () => string }).getText(); } catch { return ''; } });
    expect(form8949).toContain('Y'); expect(form8949).toContain('98-7654321');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('rejects changed QOF sources and retained amounts before any output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qof-review-context-'));
  try {
    for (const change of [
      (source: ReturnType<typeof input>) => { source.qofDispositionFacts!.investments![0]!.remainingDeferredGain = '99000'; },
      (source: ReturnType<typeof input>) => { source.qofDispositionFacts!.investments![0]!.qofEin = '11-1111111'; },
    ]) {
      const source = input(), result = calculateFederalTax(source); change(source);
      await expect(fillReturn(source, result, { outputDir: join(directory, 'source'), blankFormsDir: 'forms/blank' })).rejects.toThrow(/8997|8949|Schedule/);
    }
    const source = input(), result = calculateFederalTax(source);
    result.qofInclusion!.rows[0]!.includedGain = d('1');
    await expect(fillReturn(source, result, { outputDir: join(directory, 'result'), blankFormsDir: 'forms/blank' })).rejects.toThrow(/8997/);
    const missing = input(), kept = calculateFederalTax(missing); kept.qofInclusion = undefined;
    await expect(fillReturn(missing, kept, { outputDir: join(directory, 'missing'), blankFormsDir: 'forms/blank' })).rejects.toThrow(/8997/);
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
