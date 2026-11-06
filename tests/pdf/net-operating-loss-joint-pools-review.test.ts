// Spec: net-operating-loss-joint-pools.yaml bound-review
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildNetOperatingLossReview } from '@/pdf/fill-net-operating-loss';
import { fillForm6251, FORM_6251_FIELDS } from '@/pdf/fill-form-6251';
import { fillReturn } from '@/pdf/fill-return';
import { prepareNolFilingUnitReview } from '@/pdf/nol-filing-unit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { PDFDocument } from 'pdf-lib';
import { jointNolSourceFixture } from '../fixtures/net-operating-loss-joint-pools';

it('binds original components and joint totals before saving the review', async () => {
  const input = TaxYearInputSchema.parse(jointNolSourceFixture()), result = calculateFederalTax(input), token = prepareNolFilingUnitReview(input);
  const redacted = redactReviewIdentifiers(input), paragraphs = buildNetOperatingLossReview(redacted, result, undefined, undefined, undefined, undefined, token).join(' ');
  for (const text of ['Joint loss-year pool', 'incoming component 1', 'opening 35000', 'opening 50000', 'claimed 54800', 'remaining 30200', 'no current owner allocation']) expect(paragraphs).toContain(text);
  for (const privateText of ['Jane Doe', 'Alex Rowe', 'jane-loss2021', 'alex-loss2021', '123-45-6789', '6789', '4321']) expect(paragraphs).not.toContain(privateText);
  const doc = await fillForm6251(redacted, result, 'forms/blank/2025/f6251.pdf', undefined, undefined, undefined, undefined, token);
  const saved = await PDFDocument.load(await doc.save()), form = saved.getForm();
  expect(form.getTextField(FORM_6251_FIELDS.line2e).getText()).toBe('54800'); expect(form.getTextField(FORM_6251_FIELDS.line2f).getText()).toBe('20000');
  expect(form.getTextField(FORM_6251_FIELDS.line4).getText()).toBe('80000'); expect(form.getTextField(FORM_6251_FIELDS.ssn).getText()).toBeUndefined();
  const changed = structuredClone(input); changed.netOperatingLoss!.sameCoupleJointHistory!.years![0]!.sourceReference = 'Replacement actual marital original';
  await expect(fillReturn(changed, result, { blankFormsDir: '/missing-joint-nol', outputDir: '/missing-joint-nol-output' })).rejects.toThrow(/original|source|reconcile/i);
  const altered = { ...result, netOperatingLoss: { ...result.netOperatingLoss!, vintages: result.netOperatingLoss!.vintages.map(row => ({ ...row,
    jointPool: { components: row.jointPool!.components.map(part => ({ ...part, ownerPersonId: 'forged' })) } })) } };
  await expect(fillForm6251(redacted, altered, '/missing-joint-nol-template.pdf', undefined, undefined, undefined, undefined, token)).rejects.toThrow(/original|source|calculation|reconcile/i);
  const removed = structuredClone(input); removed.netOperatingLoss!.vintages!.splice(1, 1);
  expect(() => buildNetOperatingLossReview(removed, result)).toThrow(/original|source|reconcile/i);
});
