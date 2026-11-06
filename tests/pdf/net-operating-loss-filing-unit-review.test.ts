import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildNetOperatingLossReview } from '@/pdf/fill-net-operating-loss';
import { fillReturn } from '@/pdf/fill-return';
import { fillForm6251, FORM_6251_FIELDS } from '@/pdf/fill-form-6251';
import { prepareNolFilingUnitReview, nolFilingUnitReviewOriginalSourceInput, type PreparedNolFilingUnitReview } from '@/pdf/nol-filing-unit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { PDFDocument } from 'pdf-lib';
import { changedNolReturnFixture } from '../fixtures/net-operating-loss-filing-unit';

// Spec: net-operating-loss-filing-unit-history.yaml original-bound-review
it('binds both owner histories and the current calculated result before rendering', async () => {
  const input = TaxYearInputSchema.parse(changedNolReturnFixture()), result = calculateFederalTax(input);
  const changed = structuredClone(input); changed.w2s[0]!.wages = '50001';
  expect(() => buildNetOperatingLossReview(changed, result)).toThrow(/original|source|history|reconcile/i);
  await expect(fillReturn(changed, result, { blankFormsDir: '/missing-nol-filing-templates', outputDir: '/missing-nol-filing-output' })).rejects.toThrow(/original|source|history|reconcile/i);
  const removed = structuredClone(input); delete removed.netOperatingLoss!.filingUnitHistory;
  expect(() => buildNetOperatingLossReview(removed, result)).toThrow(/original|source|history|reconcile/i);
  const balanced = structuredClone(input), use = balanced.netOperatingLoss!.vintages![0]!.history![1]!.filingUnitUses![0]!;
  use.sourceReference = 'Different filed original with equal reported amounts';
  expect(() => buildNetOperatingLossReview(balanced, result)).toThrow(/original|source|history|reconcile/i);
  await expect(fillForm6251(balanced, result, '/missing-nol-filing-template.pdf')).rejects.toThrow(/original|source|history|reconcile/i);
  const packetRemoved = structuredClone(input); delete packetRemoved.netOperatingLoss;
  await expect(fillForm6251(packetRemoved, result, '/missing-nol-filing-template.pdf')).rejects.toThrow(/original|source|history|reconcile/i);
});

// Spec: net-operating-loss-filing-unit-history.yaml saved-review
it('saves the physical AMT adjustments and original owner explanation using a private source context', async () => {
  const input = TaxYearInputSchema.parse(changedNolReturnFixture()), before = JSON.stringify(input), result = calculateFederalTax(input);
  const token = prepareNolFilingUnitReview(input), redacted = redactReviewIdentifiers(input);
  expect(nolFilingUnitReviewOriginalSourceInput(redacted, result, token)).toEqual(input);
  const paragraphs = buildNetOperatingLossReview(redacted, result, undefined, undefined, undefined, undefined, token).join(' ');
  for (const literal of ['ACTUAL FILED OWNER HISTORY', 'Original return loss: 100000', 'Original owner allocation: 60000', 'Historical deduction: 7000', 'Owner remaining after year: 48000']) expect(paragraphs).toContain(literal);
  for (const secret of ['Jane Doe', 'Alex Rowe', 'Riley Stone', '123-45-6789', '6789', '4321', 'Actual owner allocation']) expect(paragraphs).not.toContain(secret);
  const doc = await fillForm6251(redacted, result, 'forms/blank/2025/f6251.pdf', undefined, undefined, undefined, undefined, token);
  const saved = await PDFDocument.load(await doc.save()), form = saved.getForm();
  expect(form.getTextField(FORM_6251_FIELDS.line2e).getText()).toBe('27400');
  expect(form.getTextField(FORM_6251_FIELDS.line2f).getText()).toBe('20000');
  expect(form.getTextField(FORM_6251_FIELDS.line4).getText()).toBe('30000');
  expect(form.getTextField(FORM_6251_FIELDS.ssn).getText()).toBeUndefined();
  expect(() => nolFilingUnitReviewOriginalSourceInput(input, result, {} as PreparedNolFilingUnitReview)).toThrow(/private context/i);
  expect(() => nolFilingUnitReviewOriginalSourceInput(input, { ...result, agi: result.agi.plus(1) }, token)).toThrow(/calculation|reconcile/i);
  const changedResult = { ...result, netOperatingLoss: { ...result.netOperatingLoss!, carryforward: result.netOperatingLoss!.carryforward.plus(1) } };
  await expect(fillForm6251(redacted, changedResult, '/missing-nol-filing-template.pdf', undefined, undefined, undefined, undefined, token)).rejects.toThrow(/calculation|reconcile/i);
  const changed = structuredClone(redacted); changed.netOperatingLoss!.alternativeTax!.filingUnitHistory!.returns![0]!.sourceReference = 'Replacement same-money original';
  expect(() => nolFilingUnitReviewOriginalSourceInput(changed, result, token)).toThrow(/source|stale/i);
  expect(JSON.stringify(input)).toBe(before);
});
