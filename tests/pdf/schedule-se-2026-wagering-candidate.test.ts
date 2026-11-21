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
const payrollConfirmed = { ...confirmations, completePrimaryW2OriginalsAndNoOtherCoveredPayrollConfirmed: true };
const w2 = { ...simpleW2Fixture.w2s[0], taxYear: 2026, accountHolder: 'primary' as const,
  wages: '205000', socialSecurityWages: '180000', socialSecurityTips: '3500' };

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

it('keeps the wagering Schedule SE fields unchanged when Schedule B Part III is answered', async () => {
  const { projectScheduleSE2026WageringFields } = await import('@/pdf/mappings/2026/schedule-se-candidate.js');
  const input = source();
  const expected = projectScheduleSE2026WageringFields(input, confirmations);
  for (const scheduleBPartThree of [
    { hasForeignAccounts: false, hasForeignTrust: false },
    { hasForeignAccounts: true, fbarRequired: true, foreignAccountCountries: ['Japan'], hasForeignTrust: true },
  ]) {
    const reported = TaxYearInputSchema.parse({ ...input, scheduleBPartThree });
    expect(projectScheduleSE2026WageringFields(reported, confirmations)).toEqual(expected);
  }
});

it('refuses other sources and a nonreconciling regular-method projection', async () => {
  const { projectScheduleSE2026WageringFields } = await import('@/pdf/mappings/2026/schedule-se-candidate.js');
  const fields = SCHEDULE_SE_2026_CANDIDATE.fields;
  const input = source();
  expect(() => projectScheduleSE2026WageringFields(input, {})).toThrow(/confirm/i);
  expect(() => projectScheduleSE2026WageringFields(input, { ...confirmations, noExemptionChurchIncomeOrOptionalMethodConfirmed: false })).toThrow(/confirm/i);
  expect(() => projectScheduleSE2026WageringFields({ ...input, w2s: simpleW2Fixture.w2s }, payrollConfirmed)).toThrow(/payroll/i);
  const retained = TaxYearInputSchema.parse({ ...input, scheduleF: { grossIncome: '0' } });
  expect(() => projectScheduleSE2026WageringFields(retained, confirmations)).toThrow(/sources/i);
  expect(() => projectScheduleSE2026WageringFields(source('433.13', '0'), confirmations)).toThrow(/threshold/i);
  expect(() => projectScheduleSE2026WageringFields(source('433.14', '0'), confirmations)).toThrow(/reconcile/i);
  expect(() => projectScheduleSE2026WageringFields(source('12000.15', '10000.25'), confirmations)).toThrow(/reconcile/i);
  const capped = projectScheduleSE2026WageringFields(source('300000', '0'), confirmations);
  expect([capped[fields.line6], capped[fields.line10], capped[fields.line11], capped[fields.line12], capped[fields.line13]])
    .toEqual(['277050', '22878', '8034', '30912', '15456']);
});

it('projects covered wages from original W-2 boxes and omits lines at the wage base', async () => {
  const { projectScheduleSE2026WageringFields } = await import('@/pdf/mappings/2026/schedule-se-candidate.js');
  const input = source();
  const form = { sourceId: 'private-slot-id', taxYear: 2026, accountHolder: 'primary', payer: 'Synthetic Slots',
    payerTin: '123456789', winningDate: '2026-03-12', typeOfWager: 'slots', prizeType: 'cash', reportableWinnings: '5000', federalWithheld: '1200' };
  const withOriginals = TaxYearInputSchema.parse({ ...input, formW2G: [form], scheduleC: { ...input.scheduleC,
    professionalWagering: { ...input.scheduleC?.professionalWagering, w2gSources: {
      individualOriginalsAndLedgerInclusionConfirmed: true, otherGrossTaxableWageringGains: '7000',
      statements: [{ sourceId: form.sourceId, payer: form.payer, payerTin: form.payerTin, winningDate: form.winningDate,
        reportableWinnings: form.reportableWinnings, federalWithheld: form.federalWithheld, ledgerEntry: 'private-slot-ledger',
        recognizedLedgerGain: '5000', recipientTinLast4: input.taxpayer.primary.ssn.slice(-4) }],
    } },
  } });
  const fields = SCHEDULE_SE_2026_CANDIDATE.fields;
  const projected = projectScheduleSE2026WageringFields({ ...withOriginals, w2s: [
    { ...w2, socialSecurityWages: '179999.40' },
    { ...w2, employer: { name: 'Second Synthetic Employer', ein: '23-4567890' }, socialSecurityWages: '0.40', socialSecurityTips: '0' },
  ] }, payrollConfirmed);
  expect(projected).toEqual({
    [fields.line2]: '3000', [fields.line3]: '3000', [fields.line4a]: '2771', [fields.line4c]: '2771', [fields.line6]: '2771',
    [fields.line8a]: '183500', [fields.line8d]: '183500', [fields.line9]: '1000', [fields.line10]: '124',
    [fields.line11]: '80', [fields.line12]: '204', [fields.line13]: '102',
  });
  const atCap = [{ ...w2, socialSecurityWages: '181000' }];
  const nextW2 = { ...w2, employer: { name: 'Second Synthetic Employer', ein: '23-4567890' }, socialSecurityWages: '1000', socialSecurityTips: '0' };
  const { [fields.line8d]: _line8d, [fields.line9]: _line9, [fields.line10]: _line10, ...common } = projected;
  for (const [w2s, line8a] of [[atCap, '184500'], [[...atCap, nextW2], '185500']] as const) {
    const capped = projectScheduleSE2026WageringFields({ ...withOriginals, w2s: [...w2s] }, payrollConfirmed);
    expect(capped).toEqual({ ...common, [fields.line8a]: line8a, [fields.line12]: '80', [fields.line13]: '40' });
  }
  const capped = projectScheduleSE2026WageringFields({ ...withOriginals, w2s: atCap }, payrollConfirmed);
  const pdf = await PDFDocument.load(await readFile('forms/blank/2026/f1040sse.pdf'));
  for (const [name, value] of Object.entries(capped)) pdf.getForm().getTextField(name).setText(value);
  await markReviewPdf(pdf);
  const bytes = await pdf.save();
  const saved = (await PDFDocument.load(bytes)).getForm();
  for (const [key, name] of Object.entries(fields)) {
    if (key === 'ministerForm4361') continue;
    const field = saved.getTextField(name);
    expect(field.getText()).toBe(capped[name]);
    if (name in capped) expect(field.acroField.getWidgets()[0]?.getAppearances()?.normal).toBeDefined();
  }
  if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
    await writeFile(join(process.env.TAX_CANDIDATE_ARTIFACT_DIR, 'schedule-se-wagering-w2-cap.pdf'), bytes, { flag: 'wx', mode: 0o600 });
  }
  expect(() => projectScheduleSE2026WageringFields({ ...withOriginals, formW2G: [] }, payrollConfirmed)).toThrow(/ledger link/i);
});

it('requires confirmed current payroll facts and refuses ambiguous cap rounding', async () => {
  const { projectScheduleSE2026WageringFields } = await import('@/pdf/mappings/2026/schedule-se-candidate.js');
  const input = source();
  expect(() => projectScheduleSE2026WageringFields({ ...input, w2s: [w2] }, confirmations)).toThrow(/confirm/i);
  for (const change of [
    { taxYear: undefined }, { taxYear: 2025 }, { accountHolder: undefined }, { accountHolder: 'spouse' as const },
    { socialSecurityWages: undefined }, { socialSecurityWages: '-1' }, { socialSecurityTips: undefined },
    { socialSecurityTips: '0.001' }, { allocatedTips: '1' }, { socialSecurityWages: '181000.01' },
    { employer: { ...w2.employer, ein: '' } },
  ]) {
    expect(() => projectScheduleSE2026WageringFields({ ...input, w2s: [{ ...w2, ...change }] }, payrollConfirmed)).toThrow(/payroll/i);
  }
  expect(() => projectScheduleSE2026WageringFields({ ...input, w2s: [w2, {
    ...w2, employer: { ...w2.employer, ein: '123456789' },
  }] }, payrollConfirmed)).toThrow(/payroll.*distinct/i);
  expect(() => projectScheduleSE2026WageringFields({ ...input,
    w2s: [{ ...w2, socialSecurityWages: '180999.75' }],
  }, payrollConfirmed)).toThrow(/reconcile.*wage-base/i);
});
