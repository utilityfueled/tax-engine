// Spec: spec/federal/guided-foreign-tax-direct-credit.yaml review.
import { execFileSync } from '../helpers/file-stdin-exec';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { d } from '@/utils/decimal.js';
import { buildForm1116ReferenceSummary, FORM_1116_REFERENCE_FILENAME, shouldIncludeForm1116ReferenceSummary } from '@/pdf/fill-form-1116.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { foreignTaxDirectCreditFixture } from '../fixtures/foreign-tax-direct-credit.js';

function source() {
  const input = foreignTaxDirectCreditFixture(), annual = input.foreignTaxElection, direct = annual?.creditWithoutForm1116;
  if (!annual || !direct) throw new Error('Missing actual synthetic source');
  annual.noUnusedCreditCarryoversConfirmed = false;
  direct.carryovers = [
    { originTaxYear: 2015, category: 'passive', amount: '10.25', sourceReference: 'Private old regular reference' },
    { originTaxYear: 2024, category: 'passive', amount: '90.50', sourceReference: 'Private recent regular reference' },
  ];
  direct.amtCarryovers = [
    { originTaxYear: 2015, category: 'general', amount: '3.25', sourceReference: 'Private old AMT reference' },
    { originTaxYear: 2024, category: 'passive', amount: '6.50', sourceReference: 'Private recent AMT reference' },
  ];
  return { input, result: calculateFederalTax(input) };
}
describe('actual direct foreign-credit review record', () => {
  it('copies actual elected credit and retained vintages without exposing source identifiers', () => {
    const { result } = source(), summary = buildForm1116ReferenceSummary(result);
    expect(shouldIncludeForm1116ReferenceSummary(result)).toBe(true);
    expect(summary.title).toBe('Foreign Tax Direct-Credit Election Record');
    expect(summary.introduction).toContain('No current carry is created');
    expect(summary.sections).toHaveLength(1);
    const rows = summary.sections[0].lines;
    expect(rows.find(row => row.line === 'allowed-credit')?.value).toBe('200');
    expect(rows.find(row => row.line === 'prior-carry-retained')?.value).toBe('90.5');
    expect(rows.find(row => row.line === 'amt-carry-retained')?.value).toBe('6.5');
    expect(rows.find(row => row.line === 'regular:passive:2015')?.formula).toContain('expired 10.25');
    expect(rows.find(row => row.line === 'amt:general:2015')?.formula).toContain('expired 3.25');
    for (const privateValue of ['Private', 'Synthetic investment bank', '112233445']) expect(JSON.stringify(summary)).not.toContain(privateValue);
  });
  it('rejects missing conflicting and nonconserving direct-credit audits', () => {
    const { result } = source(), direct = result.foreignTaxDirectCredit;
    const audit = result.allLines.find(row => row.form === 'Foreign Direct Credit WS' && row.line === 'allowed-credit');
    if (!direct || !audit) throw new Error('Missing actual synthetic credit');
    for (const allLines of [
      result.allLines.filter(row => row !== audit), [...result.allLines, audit],
      result.allLines.map(row => row === audit ? { ...row, value: d('201') } : row),
      result.allLines.map(row => row === audit ? { ...row, description: 'Changed source description' } : row),
    ]) expect(() => buildForm1116ReferenceSummary({ ...result, allLines })).toThrow(/audit|credit/i);
    for (const change of [
      { foreignTaxDirectCredit: undefined }, { foreignTaxCredit: d('201') },
      { foreignTaxDirectCredit: { ...direct, currentTaxUncredited: d('1') } },
      { foreignTaxDirectCredit: { ...direct, details: direct.details.map(row => ({ ...row, used: d('1') })) } },
      { foreignTaxDirectCredit: { ...direct, amtDetails: direct.amtDetails.map(row => ({ ...row, remaining: d('7') })) } },
      { carryforwards: { ...result.carryforwards, amtForeignTaxCreditCarryforwardByCategory: { passive: [] } } },
      { carryforwards: { ...result.carryforwards, foreignTaxCreditCarryforward: d('91') } },
    ]) expect(() => buildForm1116ReferenceSummary({ ...result, ...change })).toThrow(/audit|credit|carry|balance/i);
  });
  it('saves the marked actual election record in the review packet', async () => {
    const { input, result } = source(); const directory = await mkdtemp(join(tmpdir(), 'foreign-direct-reference-'));
    try {
      const { filledForms } = await fillReturn(input, result, { blankFormsDir: 'forms/blank', outputDir: directory });
      const path = filledForms.find(row => row.endsWith(FORM_1116_REFERENCE_FILENAME));
      if (!path) throw new Error('Missing actual direct foreign-credit reference');
      const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
      { input: await readFile(path), encoding: 'utf8' })) as string[];
      for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
      const text = pages.join(' ').replace(/\s+/g, ' ');
      expect(text).toContain('Foreign Tax Direct-Credit Election Record');
      expect(text).toContain('Value: 200'); expect(text).toContain('Value: 90.5'); expect(text).toContain('Value: 6.5');
      expect(text).toContain('No current carry is created'); expect(text).not.toContain('requires Form 1116');
      for (const privateValue of ['Private synthetic', 'Private old', 'Synthetic investment bank', '112233445', input.taxpayer.primary.ssn]) expect(text).not.toContain(privateValue);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
