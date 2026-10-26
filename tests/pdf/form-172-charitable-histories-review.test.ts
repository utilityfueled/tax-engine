// Spec: form-172-charitable-histories.yaml source-review.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { prepareCharitableReview } from '@/pdf/charitable-review-context';
import { buildNetOperatingLossReview } from '@/pdf/fill-net-operating-loss';
import { fillReturn } from '@/pdf/fill-return';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { currentOriginCharitableHistoriesInput } from '../fixtures/form-172-charitable-histories';

it('binds current loss and both original charitable histories before rendering', async () => {
  const input = currentOriginCharitableHistoriesInput(), result = calculateFederalTax(input);
  const token = prepareCharitableReview(input), redacted = redactReviewIdentifiers(input);
  const text = buildNetOperatingLossReview(redacted, result, undefined, undefined, token).join(' ');
  expect(text).toContain('Current regular PartI loss 14000');
  expect(text).toContain('remaining 2000');
  expect(text).toContain('Alternative charitable deduction in nonbusiness group: 1500');
  const changed = structuredClone(redacted);
  changed.charitableCarryoverSources = undefined;
  await expect(fillReturn(changed, result, { blankFormsDir: '/missing-current-history-templates', outputDir: '/missing-current-history-output', charitableReview: token }))
    .rejects.toThrow(/source|charit|reconcile|stale/i);
  await expect(fillReturn(changed, result, { blankFormsDir: '/missing-current-history-templates', outputDir: '/missing-current-history-output' }))
    .rejects.toThrow(/source|charit|reconcile|stale/i);
  const source = result.form172?.charitableSources;
  if (!source) throw new Error('Missing actual charitable result');
  const kind = source.sourceKind; source.sourceKind = 'current';
  expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/source|reconcile/i);
  source.sourceKind = kind;
  const deduction = source.alternativeCurrentDeduction;
  source.alternativeCurrentDeduction = deduction.plus('0.01');
  expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/source|reconcile/i);
  source.alternativeCurrentDeduction = deduction;
  const original = result.carryforwards.amtCharitableContributions;
  result.carryforwards.amtCharitableContributions = original.plus('0.01');
  expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/source|reconcile/i);
});
