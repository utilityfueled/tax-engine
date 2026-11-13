/** Spec: spec/federal/schedule-se-2026-template.yaml. */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { SCHEDULE_SE_2026_CANDIDATE } from '@/pdf/mappings/2026/schedule-se-candidate.js';
import { assertPdfExportAllowed, markReviewPdf } from '@/pdf/export-policy.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

const reference = 'PRIVATE-WAGERING-SOURCE-FOR-SCHEDULE-SE';
const confirmations = {
  allSelfEmploymentAndCoveredPayrollSourcesReviewed: true,
  noExemptionChurchIncomeOrOptionalMethodConfirmed: true,
};

function source(gains = '12000', losses = '10000') {
  return TaxYearInputSchema.parse({
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    scheduleC: {
      accountHolder: 'primary', accountingMethod: 'cash',
      professionalWagering: {
        taxYear: 2026, ledgerReference: reference, fullCalendarYearConfirmed: true,
        completeDomesticProfessionalActivityConfirmed: true, noOtherActivityOrDuplicatedAmountsConfirmed: true,
        grossTaxableWageringGains: gains, wageringLosses: losses, otherwiseDeductibleWageringExpenses: '0',
      },
    },
  });
}

it('projects the current wagering profit into the final regular Schedule SE', async () => {
  const { projectScheduleSE2026WageringFields } = await import('@/pdf/mappings/2026/schedule-se-candidate.js');
  const fields = SCHEDULE_SE_2026_CANDIDATE.fields;
  const projected = projectScheduleSE2026WageringFields(source(), confirmations);
  // $3,000 × 92.35% rounds to $2,771. The separately rounded portions are $344 and $80.
  expect(projected).toEqual({
    [fields.line2]: '3000', [fields.line3]: '3000', [fields.line4a]: '2771', [fields.line4c]: '2771',
    [fields.line6]: '2771', [fields.line8a]: '0', [fields.line8d]: '0', [fields.line9]: '184500',
    [fields.line10]: '344', [fields.line11]: '80', [fields.line12]: '424', [fields.line13]: '212',
  });
  const pdf = await PDFDocument.load(await readFile('forms/blank/2026/f1040sse.pdf'));
  for (const [name, value] of Object.entries(projected)) pdf.getForm().getTextField(name).setText(value);
  await markReviewPdf(pdf);
  const bytes = await pdf.save();
  const saved = (await PDFDocument.load(bytes)).getForm();
  for (const [key, name] of Object.entries(fields)) {
    if (key === 'ministerForm4361') {
      expect(saved.getCheckBox(name).isChecked()).toBe(false);
      continue;
    }
    const field = saved.getTextField(name);
    expect(field.getText()).toBe(projected[name]);
    if (name in projected) expect(field.acroField.getWidgets()[0]?.getAppearances()?.normal).toBeDefined();
  }
  expect(JSON.stringify(projected)).not.toContain(reference);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
  expect(() => assertPdfExportAllowed(2026, 2026, 'filing')).toThrow(/unavailable/);
  if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
    await writeFile(join(process.env.TAX_CANDIDATE_ARTIFACT_DIR, 'schedule-se-wagering.pdf'), bytes, { flag: 'wx', mode: 0o600 });
  }
});

it('refuses other sources and a nonreconciling regular-method projection', async () => {
  const { projectScheduleSE2026WageringFields } = await import('@/pdf/mappings/2026/schedule-se-candidate.js');
  const fields = SCHEDULE_SE_2026_CANDIDATE.fields;
  const input = source();
  expect(() => projectScheduleSE2026WageringFields(input, {})).toThrow(/confirm/i);
  expect(() => projectScheduleSE2026WageringFields(input, { ...confirmations, noExemptionChurchIncomeOrOptionalMethodConfirmed: false })).toThrow(/confirm/i);
  expect(() => projectScheduleSE2026WageringFields({ ...input, w2s: simpleW2Fixture.w2s }, confirmations)).toThrow(/sources/i);
  const retained = TaxYearInputSchema.parse({ ...input, scheduleF: { grossIncome: '0' } });
  expect(() => projectScheduleSE2026WageringFields(retained, confirmations)).toThrow(/sources/i);
  expect(() => projectScheduleSE2026WageringFields(source('433.13', '0'), confirmations)).toThrow(/threshold/i);
  expect(() => projectScheduleSE2026WageringFields(source('433.14', '0'), confirmations)).toThrow(/reconcile/i);
  expect(() => projectScheduleSE2026WageringFields(source('12000.15', '10000.25'), confirmations)).toThrow(/reconcile/i);
  const capped = projectScheduleSE2026WageringFields(source('300000', '0'), confirmations);
  expect([capped[fields.line6], capped[fields.line10], capped[fields.line11], capped[fields.line12], capped[fields.line13]])
    .toEqual(['277050', '22878', '8034', '30912', '15456']);
});
