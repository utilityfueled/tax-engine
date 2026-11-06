// Spec: form-172-charitable-carried-composition.yaml private-review.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { prepareCharitableReview } from '@/pdf/charitable-review-context';
import { buildNetOperatingLossReview } from '@/pdf/fill-net-operating-loss';
import { fillReturn } from '@/pdf/fill-return';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { carriedCurrentCharitableHistoriesInput, carriedCurrentCharitableCodInput } from '../fixtures/form-172-charitable-carried-composition';

it('binds old carry and new current loss independently before review output', async () => {
  const input = carriedCurrentCharitableHistoriesInput(), result = calculateFederalTax(input);
  const token = prepareCharitableReview(input), redacted = redactReviewIdentifiers(input);
  const text = buildNetOperatingLossReview(redacted, result, undefined, undefined, token).join(' ');
  expect(text).toContain('Current regular PartI loss 14000');
  expect(text).toContain('92350'); expect(text).toContain('114000'); expect(text).toContain('7650');
  const changed = structuredClone(redacted);
  if (!changed.netOperatingLoss?.alternativeTax || !result.netOperatingLoss || !result.form172) throw new Error('Missing actual results');
  changed.netOperatingLoss.alternativeTax.vintages = [];
  await expect(fillReturn(changed, result, { blankFormsDir: '/missing-carried-origin-templates', outputDir: '/missing-carried-origin-output', charitableReview: token }))
    .rejects.toThrow(/source|charit|reconcile|stale|NOL/i);
  const old = result.netOperatingLoss.carryforward, current = result.form172.regular.netOperatingLoss;
  result.netOperatingLoss.carryforward = old.plus('1'); result.form172.regular.netOperatingLoss = current.minus('1');
  expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/source|reconcile|NOL/i);
  result.netOperatingLoss.carryforward = old; result.form172.regular.netOperatingLoss = current;
  result.carryforwards.alternativeTaxNolCarryforward = result.carryforwards.alternativeTaxNolCarryforward.plus('0.01');
  expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/source|reconcile|NOL/i);
});

it('binds zero-benefit charitable and COD contexts before review output', async () => {
  const { prepareCodNolReview } = await import('@/pdf/cod-nol-review-context');
  const input = carriedCurrentCharitableCodInput(), result = calculateFederalTax(input);
  const charity = prepareCharitableReview(input), cod = prepareCodNolReview(input), redacted = redactReviewIdentifiers(input);
  const text = buildNetOperatingLossReview(redacted,result,undefined,cod,charity).join(' ');
  expect(text).toContain('109000'); expect(text).toContain('87350');
  expect(text).not.toContain(input.taxpayer.primary.ssn);
  const rows = result.codNolReduction?.regular?.vintages;
  if (!rows?.[0] || !rows[1]) throw new Error('Missing fictional computed COD rows');
  rows[0].attributeReduction=rows[0].attributeReduction.minus(1);
  rows[1].attributeReduction=rows[1].attributeReduction.plus(1);
  expect(() => buildNetOperatingLossReview(redacted,result,undefined,cod,charity)).toThrow(/COD|source|reconcile|stale/i);
});
