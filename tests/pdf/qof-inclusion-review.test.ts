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
import { prepareForm8949Review } from '@/pdf/form-8949-review-context';
import { SCHEDULE_D_FIELDS as F } from '@/pdf/fill-schedule-d';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { d } from '@/utils/decimal';
import { simpleW2Fixture } from '../fixtures/simple-w2';
import { qofFacts, qofInvestment } from '../fixtures/qof-inclusion';

const input = () => TaxYearInputSchema.parse({ ...simpleW2Fixture,
  qofDispositionFacts: qofFacts(2025, [qofInvestment({ event: 'sale_or_exchange', eventDate: '2025-06-30', investmentDate: '2020-03-01',
    fairMarketValue: '130000', proceeds: '130000', basisBeforeInclusion: '0', description: 'Fictional 25% interest Ω' })], true) });

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
    for (const value of ['Y', '98-7654321', '130000', '100000', '90000', '120000']) expect(form8949).toContain(value);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('rejects changed QOF sources and retained amounts before any output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qof-review-context-'));
  const row = (source: ReturnType<typeof input>) => source.qofDispositionFacts!.investments![0]!;
  try {
    for (const change of [
      (source: ReturnType<typeof input>) => { row(source).remainingDeferredGain = '99000'; },
      (source: ReturnType<typeof input>) => { row(source).qofEin = '11-1111111'; },
      (source: ReturnType<typeof input>) => { row(source).proceeds = '170000'; },
      (source: ReturnType<typeof input>) => { row(source).basisBeforeInclusion = '50000'; },
      (source: ReturnType<typeof input>) => { row(source).investmentDate = '2020-03-02'; },
      (source: ReturnType<typeof input>) => { row(source).sourceReference = 'Different same-money records'; },
    ]) {
      const source = input(), result = calculateFederalTax(source); change(source);
      await expect(fillReturn(source, result, { outputDir: join(directory, 'source'), blankFormsDir: 'forms/blank' })).rejects.toThrow(/8997 reference|Form8949 original source audit/);
    }
    const disposed = input(), kept = calculateFederalTax(disposed); disposed.qofDispositionFacts!.disposedOfQofInvestment = false;
    await expect(fillReturn(disposed, kept, { outputDir: join(directory, 'answer'), blankFormsDir: 'forms/blank' })).rejects.toThrow(/8997|QOF/);
    const source = input(), result = calculateFederalTax(source);
    result.qofInclusion!.rows[0]!.includedGain = d('1');
    await expect(fillReturn(source, result, { outputDir: join(directory, 'result'), blankFormsDir: 'forms/blank' })).rejects.toThrow(/8997/);
    const schedule = calculateFederalTax(source); schedule.scheduleD!.netLongTerm = d('1');
    await expect(fillReturn(source, schedule, { outputDir: join(directory, 'schedule'), blankFormsDir: 'forms/blank' })).rejects.toThrow(/Schedule D audits/);
    const rows = calculateFederalTax(source); rows.qofInclusion!.transactions[0]!.proceeds = '1';
    await expect(fillReturn(source, rows, { outputDir: join(directory, 'rows'), blankFormsDir: 'forms/blank' })).rejects.toThrow(/8997/);
    const missing = input(), absent = calculateFederalTax(missing); absent.qofInclusion = undefined;
    await expect(fillReturn(missing, absent, { outputDir: join(directory, 'missing'), blankFormsDir: 'forms/blank' })).rejects.toThrow(/8997/);
    const stale = prepareForm8949Review(input()), changed = input(); row(changed).remainingDeferredGain = '50000';
    await expect(fillReturn(changed, calculateFederalTax(changed), { outputDir: join(directory, 'stale'), blankFormsDir: 'forms/blank', capitalGainReview: stale })).rejects.toThrow(/stale|conflict|8949/i);
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('wraps long reference text on the page', async () => {
  const source = input(), directory = await mkdtemp(join(tmpdir(), 'qof-review-wrap-'));
  source.qofDispositionFacts!.investments![0]!.description = 'Long fictional interest description '.repeat(10);
  try {
    const files = (await fillReturn(source, calculateFederalTax(source), { outputDir: directory, blankFormsDir: 'forms/blank' })).filledForms;
    const doc = await PDFDocument.load(await readFile(files.find(file => file.endsWith('f8997-reference-filled.pdf'))!));
    expect(doc.getPageCount()).toBe(1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
