import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal';
import { charitableReviewOriginalSourceInput, prepareCharitableReview } from '@/pdf/charitable-review-context';
import { fillReturn } from '@/pdf/fill-return';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { priorPropertyNonitemizedInput, priorPropertySources } from '../fixtures/k1-prior-property-nonitemized';
import { releaseFixtureSource as required } from '../fixtures/charitable-k1-basis-release-nol';

it('binds original choice and every independent balance before output while keeping2026 export closed', async () => {
  // Spec: K1 Prior Property Nonitemized 2026, context-and-release.
  const oldOriginal = priorPropertyNonitemizedInput({ method: 'both' });
  expect(()=>calculateFederalTax(oldOriginal)).toThrow(/prior.*(carry|floor|contribution.year)/i);
  // A distinct actual synthetic no-residual source; retained old originals are not rewritten.
  const input = structuredClone(oldOriginal);input.w2s[0].wages='300000';input.w2s[0].federalWithheld='90000';
  const before = JSON.stringify(input);
  const result = calculateFederalTax(input), token = prepareCharitableReview(input);
  expect(charitableReviewOriginalSourceInput(redactReviewIdentifiers(input), redactReviewIdentifiers(result), token)).toEqual(input);
  for (const edit of [
    (value: typeof input) => { value.deductionElection = 'nonitemized'; },
    (value: typeof input) => { value.w2s[0].wages = '100001'; },
    (value: typeof input) => { required(priorPropertySources(value).basis).recipientTaxpayerIdLast4 = '0000'; },
    (value: typeof input) => { required(required(priorPropertySources(value).basis).priorBasisSuspensions)[0].sourceReference = 'Same-money replacement original'; },
    (value: typeof input) => { required(required(required(priorPropertySources(value).atRisk).priorLossHistory).characterSources).sourceReference = 'Same-money replacement risk'; },
    (value: typeof input) => { delete value.k1CharitableSources; },
  ]) {
    const changed = structuredClone(input); edit(changed);
    expect(() => charitableReviewOriginalSourceInput(changed, result, token)).toThrow(/source|original|stale|conflicting/i);
  }
  const forged = { ...result, carryforwards: { ...result.carryforwards, charitableContributions: result.carryforwards.charitableContributions.plus(1) } };
  expect(() => charitableReviewOriginalSourceInput(input, forged, token)).toThrow(/calculation|balance|reconcile/);
  await expect(fillReturn(input, result, { charitableReview: token, blankFormsDir: 'missing2026', outputDir: 'missing2026' }))
    .rejects.toThrow(/No qualified review PDF mapping.*2026/);
  expect(JSON.stringify(input)).toBe(before);
});
