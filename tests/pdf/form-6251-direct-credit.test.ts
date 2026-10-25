// Spec: spec/federal/foreign-tax-direct-credit.yaml review-6251.
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { fillForm6251, FORM_6251_FIELDS as F } from '@/pdf/fill-form-6251.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { foreignTaxDirectCreditFixture } from '../fixtures/foreign-tax-direct-credit.js';

describe('Direct foreign credit in the AMT review form', () => {
  it('prints audited elected AMT credit and accurate limitations in a saved review form', async () => {
    const base = foreignTaxDirectCreditFixture();
    const input = TaxYearInputSchema.parse({ ...base, w2s: [{ ...base.w2s[0], wages: '100000' }], form8801: {
      priorYearFilingStatus: 'single', priorYearTaxableIncome: '0', priorYearExclusionItemAdjustments: '0', priorYearAMT: '0',
      priorYearRegularTax: '0', unusedMinimumTaxCreditCarryforward: '20000',
    } });
    const result = calculateFederalTax(input);
    const doc = await fillForm6251(input, result, 'forms/blank/2025/f6251.pdf');
    const bytes = await doc.save(); const reopened = await PDFDocument.load(bytes); const form = reopened.getForm();
    expect(form.getTextField(F.line7).getText()).toBe('3614');
    expect(form.getTextField(F.line8).getText()).toBe('200');
    expect(form.getTextField(F.line9).getText()).toBe('3414');
    expect(form.getTextField(F.line10).getText()).toBe('13695');
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    { input: Buffer.from(bytes), encoding: 'utf8' })) as string[];
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = pages.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Actual elected section904(j) foreign credit');
    expect(text).not.toContain('The preview assumes no AMT foreign-tax credit');
    expect(text).not.toContain('Private synthetic');
    if (!result.form6251) throw new Error('Missing actual synthetic AMT result');
    const tampered = { ...result, form6251: { ...result.form6251, lines: result.form6251.lines.map(row => row.line === '8' ? { ...row, value: row.value.plus(1) } : row) } };
    await expect(fillForm6251(input, tampered, 'forms/blank/2025/f6251.pdf')).rejects.toThrow(/credit|reconcile/i);
  });
});
