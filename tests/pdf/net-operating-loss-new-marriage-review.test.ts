// Spec: net-operating-loss-new-marriage.yaml private-review-binding.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildNetOperatingLossReview } from '@/pdf/fill-net-operating-loss';
import { fillForm6251, FORM_6251_FIELDS } from '@/pdf/fill-form-6251';
import { fillReturn } from '@/pdf/fill-return';
import { prepareNolFilingUnitReview } from '@/pdf/nol-filing-unit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { PDFDocument } from 'pdf-lib';
import { newMarriageNolSourceFixture } from '../fixtures/net-operating-loss-new-marriage';
it('binds owner sources and the independently computed return', async () => {
  const input = TaxYearInputSchema.parse(newMarriageNolSourceFixture('40000', '60000', '50000', '20000'));
  const result = calculateFederalTax(input), token = prepareNolFilingUnitReview(input), redacted = redactReviewIdentifiers(input);
  const text = buildNetOperatingLossReview(redacted, result, undefined, undefined, undefined, undefined, token).join(' ');
  for (const literal of ['NEW MARRIAGE', 'claimed 24250', 'remaining 25750', 'Personal original NOL deduction: 24250', 'Actual personal-owner MFS AMTI before ATNOLD: 40000']) expect(text).toContain(literal);
  for (const secret of ['Jane Doe', 'Alex Rowe', '123-45-6789', '6789', '4321', 'premarital-regular2021', 'Actual complete current owner income']) expect(text).not.toContain(secret);
  const doc = await fillForm6251(redacted, result, 'forms/blank/2025/f6251.pdf', undefined, undefined, undefined, undefined, token);
  const saved = await PDFDocument.load(await doc.save()), form = saved.getForm();
  expect(form.getTextField(FORM_6251_FIELDS.line2e).getText()).toBe('24250'); expect(form.getTextField(FORM_6251_FIELDS.line2f).getText()).toBe('20000');
  expect(form.getTextField(FORM_6251_FIELDS.line4).getText()).toBe('80000'); expect(form.getTextField(FORM_6251_FIELDS.ssn).getText()).toBeUndefined();
  const changed = structuredClone(input); changed.netOperatingLoss!.currentOwnerSources!.sourceReference = 'Changed actual source';
  await expect(fillReturn(changed, result, { blankFormsDir: '/missing-new-marriage', outputDir: '/missing-new-marriage-output' })).rejects.toThrow(/original|source|reconcile/i);
  const forged = { ...result, netOperatingLoss: { ...result.netOperatingLoss!, deduction: result.netOperatingLoss!.deduction.plus('1') } };
  await expect(fillForm6251(redacted, forged, '/missing-new-marriage-template.pdf', undefined, undefined, undefined, undefined, token)).rejects.toThrow(/original|source|calculation|reconcile/i);
  const unknown = structuredClone(input); unknown.netOperatingLoss!.currentOwnerSources!.sourceFactsConfirmed = false;
  expect(() => buildNetOperatingLossReview(unknown, result)).toThrow(/source|original|reconcile/i);
});
