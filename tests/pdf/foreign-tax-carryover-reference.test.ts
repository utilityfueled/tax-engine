// Spec: spec/federal/foreign-tax-deduction-carryover-pdf.yaml.
import { execFileSync } from '../helpers/file-stdin-exec';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { buildForm1116ReferenceSummary, FORM_1116_REFERENCE_FILENAME, shouldIncludeForm1116ReferenceSummary } from '@/pdf/fill-form-1116.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { carryFixture } from '../fixtures/foreign-tax-carryover.js';

function source() {
  const base = carryFixture();
  const input = TaxYearInputSchema.parse({ ...base, scheduleA: undefined,
    w2s: [{ ...base.w2s[0], wages: '95000', stateWages: '95000', stateTaxWithheld: '0' }] });
  return { input, result: calculateFederalTax(input) };
}

describe('Deduction-year foreign carryover reference', () => {
  it('labels the deduction-year record separately from a current credit', () => {
    const { result } = source();
    const summary = buildForm1116ReferenceSummary(result);
    expect(shouldIncludeForm1116ReferenceSummary(result)).toBe(true);
    expect(summary.title).toBe('Foreign Tax Deduction-Year Carryover Record');
    expect(summary.warningLabel).toBe('REFERENCE SUMMARY ONLY');
    expect(summary.introduction).toContain('No current foreign tax credit');
    expect(summary.introduction).toContain('no deduction of prior carry');
    expect(summary.sections).toHaveLength(1);
    expect(summary.sections[0].form).toBe('Foreign Deduction Carryover WS');
    const lines = summary.sections[0].lines;
    expect(lines.find(line => line.line === '21')?.value).toBe('673');
    expect(lines.find(line => line.line === 'absorbed')?.value).toBe('73');
    expect(lines.find(line => line.line === 'carryforward')?.value).toBe('127');
    expect(lines.find(line => line.line === 'passive:2024:remaining')?.formula).toContain('200');
    expect(result.foreignTaxCredit.isZero()).toBe(true);
  });

  it('rejects missing duplicate conflicting or inconsistent carryover audits', () => {
    const { result } = source();
    const audit = result.allLines.find(line => line.form === 'Foreign Deduction Carryover WS' && line.line === 'absorbed');
    const carry = result.foreignTaxDeductionCarryover;
    if (!audit || !carry) throw new Error('Missing actual carryover fixture');
    for (const allLines of [
      result.allLines.filter(line => line !== audit), [...result.allLines, audit],
      result.allLines.map(line => line === audit ? { ...line, value: d('74') } : line),
      result.allLines.map(line => line === audit ? { ...line, value: d('NaN') } : line),
      result.allLines.map(line => line === audit ? { ...line, formula: 'Changed calculation' } : line),
      result.allLines.map(line => line === audit ? { ...line, form: 'Other worksheet' } : line),
    ]) expect(() => buildForm1116ReferenceSummary({ ...result, allLines })).toThrow(/audit|carryover/i);
    for (const changed of [
      { foreignTaxDeductionCarryover: undefined }, { foreignTaxCredit: d('1') },
      { foreignTaxDeductionCarryover: { ...carry, absorbed: d('74') } },
      { foreignTaxDeductionCarryover: { ...carry, details: carry.details.map(row => ({ ...row, amount: d('201') })) } },
      { carryforwards: { ...result.carryforwards, foreignTaxCreditCarryforward: d('128') } },
      { carryforwards: { ...result.carryforwards, foreignTaxCreditCarryforwardByCategory: { passive: [{ taxYear: 2023, amount: d('127') }] } } },
    ]) expect(() => buildForm1116ReferenceSummary({ ...result, ...changed })).toThrow(/audit|carryover/i);
  });

  it('saves a visibly marked audit-bound carryover record without source identifiers', async () => {
    const { input, result } = source();
    const directory = await mkdtemp(join(tmpdir(), 'foreign-carryover-pdf-'));
    try {
      const { filledForms } = await fillReturn(input, result, { blankFormsDir: 'forms/blank', outputDir: directory });
      const path = filledForms.find(file => file.endsWith(FORM_1116_REFERENCE_FILENAME));
      if (!path) throw new Error('Missing deduction-year carryover review record');
      const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
      { input: await readFile(path), encoding: 'utf8' })) as string[];
      expect(pages.length).toBeGreaterThan(0);
      for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
      const text = pages.join(' ').replace(/\s+/g, ' ');
      expect(text).toContain('Foreign Tax Deduction-Year Carryover Record');
      expect(text).toContain('No current foreign tax credit');
      expect(text).toContain('no deduction of prior carry');
      expect(text).toContain('Value: 73');
      expect(text).toContain('Value: 127');
      expect(text).not.toContain('feed Schedule 3 Line 1');
      for (const identity of ['Synthetic foreign bank', '112233445', 'Synthetic account A', 'Actual prior ScheduleB']) expect(text).not.toContain(identity);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
