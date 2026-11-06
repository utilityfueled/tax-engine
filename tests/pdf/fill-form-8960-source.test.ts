// Spec: spec/federal/form-8960.yaml; physical final2025 individual form.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { fillForm8960, FORM_8960_FIELDS as F } from '@/pdf/fill-form-8960.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { d } from '@/utils/decimal.js';
const blank = 'forms/blank/2025/f8960.pdf';
describe('Form8960 actual audited review copy', () => {
  it('copies actual below-threshold MAGI and official source lines', async () => {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099Int: [{ payer: 'Bank', interestIncome: '1000' }] });
    const result = calculateFederalTax(input);
    const pdf = await fillForm8960(input, result, blank);
    expect(pdf.getForm().getTextField(F.name).getText()).toBe('Jane Doe');
    expect(pdf.getForm().getTextField(F.line13).getText()).toBe(result.agi.toFixed(0));
    expect(pdf.getForm().getTextField(F.line8).getText()).toBe('1000');
    const corrupt = { ...result, form8960: { ...result.form8960, lines: result.form8960.lines.map(line => line.line === '13' ? { ...line, value: d('200000') } : line) } };
    await expect(fillForm8960(input, corrupt, blank)).rejects.toThrow(/audit|reconcil/i);
  });
  it('retains the required zero-tax form in the review packet', async () => {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], wages: '210000', federalWithheld: '100000' }] });
    const result = calculateFederalTax(input);
    expect(result.form8960.niitTax.toString()).toBe('0');
    const directory = await mkdtemp(join(tmpdir(), 'niit-zero-packet-'));
    try {
const packet = await fillReturn(input, result, { blankFormsDir: 'forms/blank/2025', outputDir: directory });
      expect(packet.filledForms.filter(path => path.endsWith('f8960-filled.pdf'))).toHaveLength(1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('rejects an inconsistent intermediate deduction audit', async () => {
    const input = TaxYearInputSchema.parse(simpleW2Fixture);
    const result = calculateFederalTax(input);
    const inconsistent = { ...result, form8960: { ...result.form8960, lines: result.form8960.lines.map(line => line.line === '11' ? { ...line, value: d('1') } : line) } };
    await expect(fillForm8960(input, inconsistent, blank)).rejects.toThrow(/equation|reconcil/);
  });

});
