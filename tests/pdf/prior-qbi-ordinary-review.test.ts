import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal';
import { prepareQbiLossReview } from '@/pdf/qbi-loss-review-context';
import { buildQbiLossReview } from '@/pdf/mappings/2025/qbi-loss-review';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { fillReturn } from '@/pdf/fill-return';
import { fillForm8995, FORM_8995_FIELDS } from '@/pdf/fill-form-8995';
import { d } from '@/utils/decimal';
import { ordinaryPriorQbiFixture } from '../fixtures/prior-qbi-ordinary';

// Spec: qbi-prior-carry-sources.yaml review-binding
it('binds the direct original ordinary carry before saved review output', async () => {
  const input = ordinaryPriorQbiFixture(), before = structuredClone(input), result = calculateFederalTax(input);
  const token = prepareQbiLossReview(input), redacted = redactReviewIdentifiers(input);
  const text = buildQbiLossReview(redacted, result, token).join(' ');
  for (const value of ['Prior ordinary QBI source: 2024, Form 8995 line 16', 'Actual opening ordinary QBI loss carry: $7000',
    'Active-character portion of the ordinary prior carry: unknown', 'Ordinary QBI loss carryforward: $0']) expect(text).toContain(value);
  const doc = await fillForm8995(redacted, result, 'forms/blank/2025/f8995.pdf');
  const form = (await PDFDocument.load(await doc.save())).getForm();
  expect(form.getTextField(FORM_8995_FIELDS.line3).getText()).toBe('7000');
  expect(form.getTextField(FORM_8995_FIELDS.line15).getText()).toBe('18600');
  for (const patch of [{ sourceReference: 'Equal-money replacement record' }, { sourceTaxYear: 2023 }, { spouseName: 'Replacement Owner' }]) {
    const stale = structuredClone(input); Object.assign(stale.qbiLossSources!.priorQbiCarry!, patch);
    expect(() => buildQbiLossReview(stale, result, token)).toThrow(/source|prior|identity/i);
  }
  const absent = structuredClone(input); delete absent.qbiLossSources!.priorQbiCarry;
  await expect(fillReturn(absent, result, { blankFormsDir: '/missing-prior-qbi-original', outputDir: '/missing-prior-qbi-output' })).rejects.toThrow(/prior.*QBI|ordinary.*carry/i);
  const forged = { ...result, form8995: { ...result.form8995!, qbiDeduction: d('18601') } };
  expect(() => buildQbiLossReview(redacted, forged, token)).toThrow(/calculation|reconcile/i);
  for (const privateValue of ['Jane Doe', 'Alex Rowe', '6789', '4321', input.qbiLossSources!.priorQbiCarry!.sourceReference!, 'ordinary-filed-prior-return']) expect(text).not.toContain(privateValue);
  expect(input).toEqual(before);
});
