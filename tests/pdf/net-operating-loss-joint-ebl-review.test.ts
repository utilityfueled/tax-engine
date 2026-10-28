// Spec: net-operating-loss-joint-ebl.yaml bound-review
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { buildNetOperatingLossReview } from '@/pdf/fill-net-operating-loss';
import { fillForm6251, FORM_6251_FIELDS } from '@/pdf/fill-form-6251';
import { fillForm8995, FORM_8995_FIELDS } from '@/pdf/fill-form-8995';
import { buildQbiLossReview } from '@/pdf/mappings/2025/qbi-loss-review';
import { fillReturn } from '@/pdf/fill-return';
import { prepareNolFilingUnitReview } from '@/pdf/nol-filing-unit-review-context';
import { prepareQbiLossReview } from '@/pdf/qbi-loss-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { PDFDocument } from 'pdf-lib';
import { d } from '@/utils/decimal';
import { jointEblNolSourceFixture } from '../fixtures/net-operating-loss-joint-ebl';

it('rejects stale or redistributed component character before output', async () => {
  const input = jointEblNolSourceFixture(), result = calculateFederalTax(input), token = prepareNolFilingUnitReview(input);
  const qbiToken = prepareQbiLossReview(input), redacted = redactReviewIdentifiers(input);
  const text = buildNetOperatingLossReview(redacted, result, undefined, undefined, undefined, qbiToken, token).join(' ');
  for (const value of ['Section 461 EBL', 'Ordinary NOL', 'claimed 50000', 'claimed 35000', 'qualified current deduction: $25000', 'Ordinary QBI loss carryforward: $25000']) {
    expect(`${text} ${buildQbiLossReview(redacted, result, qbiToken).join(' ')}`).toContain(value);
  }
  const doc = await fillForm6251(redacted, result, 'forms/blank/2025/f6251.pdf', undefined, undefined, undefined, qbiToken, token);
  const form = (await PDFDocument.load(await doc.save())).getForm();
  expect(form.getTextField(FORM_6251_FIELDS.line2e).getText()).toBe('85000');
  expect(form.getTextField(FORM_6251_FIELDS.line2f).getText()).toBe('20000');
  expect(form.getTextField(FORM_6251_FIELDS.line4).getText()).toBe('180000');
  const changed = structuredClone(input); changed.qbiLossSources!.excessBusinessLossHistories![0]!.sourceReference = 'Other original record';
  await expect(fillReturn(changed, result, { blankFormsDir: '/missing-joint-ebl', outputDir: '/missing-joint-ebl-output' })).rejects.toThrow(/original|source|reconcile/i);
  const altered = { ...result, netOperatingLoss: { ...result.netOperatingLoss!, vintages: result.netOperatingLoss!.vintages.map(row => ({ ...row,
    jointPool: { components: row.jointPool!.components.map((part, index) => ({ ...part, deduction: part.deduction!.plus(index === 0 ? '1' : '-1') })) } })) } };
  await expect(fillForm6251(redacted, altered, '/missing-joint-ebl-template.pdf', undefined, undefined, undefined, qbiToken, token))
    .rejects.toThrow(/original|source|calculation|reconcile/i);
  const forged = { ...result, qbiEblNol: { ...result.qbiEblNol!, currentQualifiedDeduction: d('24999') } };
  expect(() => buildNetOperatingLossReview(redacted, forged, undefined, undefined, undefined, qbiToken, token)).toThrow(/calculation|reconcile/i);
  for (const privateText of ['Jane Doe', 'Alex Rowe', 'jane-loss2021', 'alex-loss2021', '123-45-6789', '6789', '4321']) expect(text).not.toContain(privateText);
});

// Spec: net-operating-loss-joint-ebl.yaml ordinary-prior-review
it('separates actual ordinary prior carry from released EBL in the saved review', async () => {
  const input = jointEblNolSourceFixture(), prior = input.qbiLossSources!.priorQbiCarry!;
  prior.lossCarryforward = '7000'; delete prior.activeLossCarryforward; delete prior.activeSourceReference;
  input.priorYear!.qbiLossCarryforward = '7000'; delete input.priorYear!.activeQbiLossCarryforward;
  const result = calculateFederalTax(input), token = prepareQbiLossReview(input), redacted = redactReviewIdentifiers(input);
  const text = buildQbiLossReview(redacted, result, token).join(' ');
  for (const literal of ['Prior ordinary QBI source: 2024, Form 8995 line 16', 'Actual opening ordinary QBI loss carry: $7000',
    'Active-character portion of the ordinary prior carry: unknown', 'Ordinary QBI loss carryforward: $32000', 'qualified current deduction: $25000']) expect(text).toContain(literal);
  const pdf = await fillForm8995(redacted, result, 'forms/blank/2025/f8995.pdf');
  const form = (await PDFDocument.load(await pdf.save())).getForm();
  expect(form.getTextField(FORM_8995_FIELDS.line3).getText()).toBe('32000');
  expect(form.getTextField(FORM_8995_FIELDS.line16).getText()).toBe('32000');
  const changed = structuredClone(input); changed.qbiLossSources!.priorQbiCarry!.sourceReference = 'Replacement equal-money original';
  expect(() => buildQbiLossReview(changed, result, token)).toThrow(/source.*stale|source.*conflict/i);
  delete changed.qbiLossSources!.priorQbiCarry;
  await expect(fillReturn(changed, result, { blankFormsDir: '/missing-prior-qbi', outputDir: '/missing-prior-qbi-output' })).rejects.toThrow(/prior.*QBI/i);
  const forged = { ...result, carryforwards: { ...result.carryforwards, qbiLossCarryforward: d('25000') } };
  expect(() => buildQbiLossReview(redacted, forged, token)).toThrow(/calculation|reconcile/i);
  for (const secret of ['Jane Doe', 'Alex Rowe', '6789', '4321', prior.sourceReference!, 'joint2024']) expect(text).not.toContain(secret);
});
