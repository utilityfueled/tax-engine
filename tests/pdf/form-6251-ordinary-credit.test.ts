// Spec: spec/federal/foreign-tax-ordinary-credit.yaml,6251-review.
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm6251, FORM_6251_FIELDS as F } from '@/pdf/fill-form-6251.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { foreignTaxOrdinaryCreditFixture } from '../fixtures/foreign-tax-ordinary-credit.js';

it('prints separate actual ordinary credits and rejects a changed source audit', async () => {
  const input = foreignTaxOrdinaryCreditFixture(), facts = input.foreignTaxElection?.creditWithForm1116;
  if (!facts) throw new Error('Missing actual synthetic ordinary source');
  facts.amtCarryback = { taxYear: 2024, election: 'form1116_credit', sourceFactsConfirmed: true,
    sourceReference: 'Private prior zero-capacity AMT source', allPriorUseIncludedConfirmed: true,
    limitation: '0', currentTaxes: '0', priorCarryoversUsed: '0' };
  const result = calculateFederalTax(input), credit = result.foreignTaxOrdinaryCredit, amt = result.form6251;
  if (!credit || !amt) throw new Error('Missing canonical ordinary credit');
  const document = await fillForm6251(input, result, 'forms/blank/2025/f6251.pdf');
  const bytes = await document.save(), saved = await PDFDocument.load(bytes), form = saved.getForm();
  expect(form.getTextField(F.line7).getText()).toBe('3094');
  expect(form.getTextField(F.line8).getText()).toBe('309');
  expect(form.getTextField(F.line9).getText()).toBe('2785');
  expect(form.getTextField(F.line10).getText()).toBe('12555');
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
  { input: Buffer.from(bytes), encoding: 'utf8' })) as string[];
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  const text = pages.join(' ').replace(/\s+/g, ' ');
  expect(text).toContain('Actual ordinary Form1116 regular and AMT credits');
  expect(text).not.toContain('Line8 is blank'); expect(text).not.toContain('Private prior');
  const changed = { ...result, foreignTaxOrdinaryCredit: { ...credit, amt: { ...credit.amt, creditAllowed: credit.amt.creditAllowed.plus(1) } } };
  await expect(fillForm6251(input, changed, 'forms/blank/2025/f6251.pdf')).rejects.toThrow(/credit|reconcile/i);
  await expect(fillForm6251(input, { ...result, foreignTaxOrdinaryCredit: undefined }, 'forms/blank/2025/f6251.pdf')).rejects.toThrow(/credit|source/i);
  const duplicate = { ...result, form6251: { ...amt, lines: [...amt.lines, ...amt.lines.filter(row => row.line === '8')] } };
  await expect(fillForm6251(input, duplicate, 'forms/blank/2025/f6251.pdf')).rejects.toThrow(/duplicate/i);
});
