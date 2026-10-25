// Spec: spec/federal/schedule-d.yaml; spec/federal/form-8814-income-character.yaml.
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillScheduleD, SCHEDULE_D_FIELDS } from '@/pdf/fill-schedule-d.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { syntheticChildElection } from '../fixtures/form-8814-election.js';

it('writes child and parent capital distributions to saved ScheduleD line13', async () => {
  const input = TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    form1099Div: [{ payer: 'Synthetic parent fund', ordinaryDividends: '0', qualifiedDividends: '0', totalCapitalGainDistributions: '500' }],
    form8814: [{ taxableInterest: '0', taxExemptInterest: '0', ordinaryDividends: '0', qualifiedDividends: '0', capitalGainDistributions: '6000', electionFacts: syntheticChildElection() }],
    priorYear: { shortTermCapitalLoss: '-10000' },
  });
  const result = calculateFederalTax(input);
  const doc = await fillScheduleD(input, result, 'forms/blank/2025/f1040sd.pdf');
  const reopened = await PDFDocument.load(await doc.save());
  const form = reopened.getForm();
  expect(form.getTextField(SCHEDULE_D_FIELDS.line13).getText()).toBe('3800');
  expect(form.getTextField(SCHEDULE_D_FIELDS.line15).getText()).toBe('3800');
  expect(form.getTextField(SCHEDULE_D_FIELDS.line16).getText()).toBe('(6200)');
  expect(form.getTextField(SCHEDULE_D_FIELDS.line21).getText()).toBe('3000');
  expect(result.allLines.find(line => line.form === 'Sched D' && line.line === '13')?.inputs['Form8814 Line10']?.toFixed()).toBe('3300');
});
