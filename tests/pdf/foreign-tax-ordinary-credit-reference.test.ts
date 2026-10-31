// Spec: spec/federal/guided-foreign-tax-ordinary-credit.yaml review.
import { execFileSync } from '../helpers/file-stdin-exec';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { d } from '@/utils/decimal.js';
import { buildForm1116ReferenceSummary, FORM_1116_REFERENCE_FILENAME, shouldIncludeForm1116ReferenceSummary } from '@/pdf/fill-form-1116.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { foreignTaxOrdinaryCreditFixture } from '../fixtures/foreign-tax-ordinary-credit.js';
function source() {
  const input = foreignTaxOrdinaryCreditFixture(), annual = input.foreignTaxElection, facts = annual?.creditWithForm1116;
  if (!facts || !annual) throw new Error('Missing actual synthetic sources');
  annual.noUnusedCreditCarryoversConfirmed = false;
  facts.carryovers = [{ originTaxYear: 2015, category: 'passive', amount: '500', sourceReference: 'Private old regular credit' }, { originTaxYear: 2024, category: 'general', amount: '3.25', sourceReference: 'Private general credit' }];
  facts.amtCarryovers = [{ originTaxYear: 2015, category: 'general', amount: '4.25', sourceReference: 'Private old AMT credit' }];
  facts.amtCarryback = { taxYear: 2024, election: 'form1116_credit', sourceFactsConfirmed: true, allPriorUseIncludedConfirmed: true, sourceReference: 'Private prior AMT return', limitation: '0', currentTaxes: '0', priorCarryoversUsed: '0' };
  return { input, result: calculateFederalTax(input) };
}
it('copies both actual credit ledgers with source privacy and exact conservation', async () => {
  const { input, result } = source(), summary = buildForm1116ReferenceSummary(result);
  expect(shouldIncludeForm1116ReferenceSummary(result)).toBe(true); expect(summary.title).toBe('Ordinary Foreign Tax Credit Review Record');
  expect(summary.sections.map(row => row.form)).toEqual(['Form 1116 (actual passive)', 'AMT Form 1116 (actual passive)']);
  expect(JSON.stringify(summary)).not.toContain('Hypothetical net ordinary foreign income');
  const [regular, amt] = summary.sections;
  expect(regular.lines.find(row => row.line === '35')?.value).toBe('1346'); expect(regular.lines.find(row => row.line === 'prior-used')?.value).toBe('446');
  expect(regular.lines.find(row => row.line === 'expired')?.value).toBe('54'); expect(regular.lines.find(row => row.line === 'carryforward')?.value).toBe('3.25');
  expect(amt.lines.find(row => row.line === '35')?.value).toBe('309'); expect(amt.lines.find(row => row.line === 'new-carry')?.value).toBe('591');
  expect(amt.lines.find(row => row.line === 'expired')?.value).toBe('4.25');
  for (const text of ['Private', 'Synthetic investment bank', '112233445', 'Canada']) expect(JSON.stringify(summary)).not.toContain(text);
  const directory = await mkdtemp(join(tmpdir(), 'foreign-ordinary-reference-'));
  try {
    const { filledForms } = await fillReturn(input, result, { blankFormsDir: 'forms/blank', outputDir: directory });
    const path = filledForms.find(value => value.endsWith(FORM_1116_REFERENCE_FILENAME));
    if (!path) throw new Error('Missing ordinary credit review record');
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"], { input: await readFile(path), encoding: 'utf8' })) as string[];
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = pages.join(' '); expect(text).toContain(summary.title); expect(text).toContain('Value: 1346'); expect(text).toContain('Value: 591');
    expect(text).toContain('Form 6251 line 8');
    for (const value of ['Private', 'Synthetic investment bank', '112233445', 'Canada']) expect(text).not.toContain(value);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('rejects stale missing duplicate and nonconserving ordinary credit results', () => {
  const { result } = source(), credit = result.foreignTaxOrdinaryCredit;
  const audit = result.allLines.find(row => row.form === 'AMT Form 1116 (actual passive)' && row.line === '35');
  if (!credit || !audit) throw new Error('Missing canonical ordinary source');
  for (const allLines of [result.allLines.filter(row => row !== audit), [...result.allLines, audit], result.allLines.map(row => row === audit ? { ...row, value: d('310') } : row)]) {
    expect(() => buildForm1116ReferenceSummary({ ...result, allLines })).toThrow(/audit|credit/i);
  }
  for (const change of [
    { foreignTaxOrdinaryCredit: undefined }, { foreignTaxCredit: d('1347') },
    { foreignTaxOrdinaryCredit: { ...credit, amt: { ...credit.amt, currentCarryforward: d('592') } } },
    { foreignTaxOrdinaryCredit: { ...credit, regular: { ...credit.regular, details: credit.regular.details.map(row => ({ ...row, remaining: row.remaining.plus(1) })) } } },
    { carryforwards: { ...result.carryforwards, amtForeignTaxCreditCarryforwardByCategory: { passive: [] } } },
    { scheduleA: result.scheduleA ? { ...result.scheduleA, foreignTaxElection: { ...result.scheduleA.foreignTaxElection, ordinaryCreditSources: undefined } } : undefined },
  ]) expect(() => buildForm1116ReferenceSummary({ ...result, ...change })).toThrow(/source|audit|credit|carry|balance/i);
});
