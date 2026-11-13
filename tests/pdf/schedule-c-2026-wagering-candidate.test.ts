/** Spec: spec/federal/schedule-c-2026-template.yaml. Diagnostic only. */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { TaxYearInputSchema, type ScheduleCProfessionalWagering } from '@/models/inputs.js';
import { SCHEDULE_C_2026_CANDIDATE as candidate } from '@/pdf/mappings/2026/schedule-c-candidate.js';
import { assertPdfExportAllowed, markReviewPdf } from '@/pdf/export-policy.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

const ledgerReference = 'private-synthetic-wagering-ledger';
function source(overrides: Partial<ScheduleCProfessionalWagering> = {}) {
  return TaxYearInputSchema.parse({
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    scheduleC: { accountHolder: 'primary', accountingMethod: 'cash', professionalWagering: {
      taxYear: 2026, ledgerReference, fullCalendarYearConfirmed: true,
      completeDomesticProfessionalActivityConfirmed: true, noOtherActivityOrDuplicatedAmountsConfirmed: true,
      grossTaxableWageringGains: '12000.15', wageringLosses: '10000.25',
      otherwiseDeductibleWageringExpenses: '0', ...overrides,
    } },
  });
}

it('writes the confirmed wagering loss to Part V and transfers it once', async () => {
  const { projectScheduleC2026WageringFields } = await import('@/pdf/mappings/2026/schedule-c-wagering-projection.js');
  const fields = candidate.fields;
  const values = projectScheduleC2026WageringFields(source());
  // 10000.25 × .90 = 9000.225; 12000.15 − 9000.225 = 2999.925.
  expect(values).toEqual({
    [fields.line1]: '12000', [fields.line3]: '12000', [fields.line5]: '12000', [fields.line7]: '12000',
    [fields.line27b]: '9000', [fields.line28]: '9000', [fields.line29]: '3000', [fields.line31]: '3000',
    [fields.otherExpense1Description]: 'Wagering losses', [fields.otherExpense1Amount]: '9000', [fields.line48]: '9000',
  });
  const pdf = await PDFDocument.load(await readFile('forms/blank/2026/f1040sc.pdf'));
  const form = pdf.getForm();
  for (const [name, value] of Object.entries(values)) form.getTextField(name).setText(value);
  await markReviewPdf(pdf);
  const bytes = await pdf.save();
  const reopened = (await PDFDocument.load(bytes)).getForm();
  for (const [name, value] of Object.entries(values)) {
    const field = reopened.getTextField(name);
    expect(field.acroField.getValue()?.decodeText()).toBe(value);
    expect(field.acroField.getWidgets()[0]?.getAppearances()?.normal).toBeDefined();
  }
  expect(reopened.getTextField(fields.otherExpense2Amount).getText()).toBeUndefined();
  expect(JSON.stringify(values)).not.toContain(ledgerReference);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
  expect(() => assertPdfExportAllowed(2026, 2026, 'filing')).toThrow(/unavailable/);
  if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
    await writeFile(join(process.env.TAX_CANDIDATE_ARTIFACT_DIR, 'schedule-c-wagering-diagnostic.pdf'), bytes);
  }
});

it('refuses missing sources mixed expenses and nonreconciling rounded totals', async () => {
  const { projectScheduleC2026WageringFields } = await import('@/pdf/mappings/2026/schedule-c-wagering-projection.js');
  const input = source();
  expect(() => projectScheduleC2026WageringFields({ ...input, scheduleC: undefined })).toThrow(/ledger/);
  expect(() => projectScheduleC2026WageringFields(TaxYearInputSchema.parse({ ...input, stateReturns: {
    illinois: { claimedAsDependent: false, age65OrOlderCount: 0, blindCount: 0, hasChildUnder12: false },
  } }))).toThrow(/state composition/);
  expect(() => projectScheduleC2026WageringFields(source({ otherwiseDeductibleWageringExpenses: '0.01' }))).toThrow(/expense categories/);
  expect(() => projectScheduleC2026WageringFields(source({ grossTaxableWageringGains: '12000.49', wageringLosses: '10000.56' }))).toThrow(/rounded/);
  const noLoss = projectScheduleC2026WageringFields(source({ wageringLosses: '0' }));
  expect(noLoss[candidate.fields.line31]).toBe('12000');
  expect(noLoss[candidate.fields.otherExpense1Description]).toBeUndefined();
  const limited = projectScheduleC2026WageringFields(source({ grossTaxableWageringGains: '8000.15' }));
  expect(limited[candidate.fields.line27b]).toBe('8000');
  expect(limited[candidate.fields.line31]).toBe('0');
});
