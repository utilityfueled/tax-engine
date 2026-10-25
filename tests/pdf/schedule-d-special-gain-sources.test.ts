// Spec: spec/federal/schedule-d-source-binding.yaml.
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillScheduleD, SCHEDULE_D_FIELDS as F } from '@/pdf/fill-schedule-d.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { syntheticScheduleDSpecialGainInput } from '../fixtures/schedule-d-special-gains.js';

it('reopens the saved canonical special-gain worksheet lines and printed decisions', async () => {
  for (const short of ['-1000', '-10000']) {
    const source = syntheticScheduleDSpecialGainInput(2025, short);
    const result = calculateFederalTax(source);
    const document = await fillScheduleD(redactReviewIdentifiers(source), redactReviewIdentifiers(result), 'forms/blank/2025/f1040sd.pdf');
    const reopened = await PDFDocument.load(await document.save());
    const form = reopened.getForm();
    expect(reopened.getPageCount()).toBe(2);
    expect(form.getTextField(F.ssn).getText()).toBeUndefined();
    expect(form.getTextField(F.line13).getText()).toBe('4380');
    expect(form.getTextField(F.line16).getText()).toBe(short === '-1000' ? '3380' : '(5620)');
    expect(form.getTextField(F.line18).getText()).toBeUndefined();
    expect(form.getTextField(F.line19).getText()).toBe(short === '-1000' ? '1190' : undefined);
    expect(form.getCheckBox(F.line17Yes).isChecked()).toBe(short === '-1000');
    expect(form.getCheckBox(F.line20No).isChecked()).toBe(short === '-1000');
    expect(form.getCheckBox(F.line20Yes).isChecked()).toBe(false);
  }
});
