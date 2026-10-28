import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal';
import { charitableReviewOriginalSourceInput, prepareCharitableReview } from '@/pdf/charitable-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { fillReturn } from '@/pdf/fill-return';
import { firstAdmissionInput, firstAdmissionOriginal } from '../fixtures/k1-charitable-first-admission';

it('binds every admission original while retaining the2026 output gate', async () => {
  // Spec: K1 Charitable First Admission, private-output-binding.
  const input = firstAdmissionInput({ earlierCarry: true }), before = JSON.stringify(input), result = calculateFederalTax(input);
  const proof = prepareCharitableReview(input);
  expect(charitableReviewOriginalSourceInput(redactReviewIdentifiers(input), redactReviewIdentifiers(result), proof)).toEqual(input);
  for (const edit of [
    (value: typeof input) => { firstAdmissionOriginal(value).section170AdmissionSources!.records![0].basisWorksheetReference = 'Same-money different actual original'; },
    (value: typeof input) => { firstAdmissionOriginal(value).section170AdmissionSources!.records![0].recipientTaxpayerIdLast4 = '0000'; },
    (value: typeof input) => { delete firstAdmissionOriginal(value).section170AdmissionSources; },
  ]) { const changed = structuredClone(input); edit(changed); expect(() => charitableReviewOriginalSourceInput(changed, result, proof)).toThrow(/source|original|stale|conflicting/i); }
  expect(() => charitableReviewOriginalSourceInput(input, { ...result, carryforwards: { ...result.carryforwards,
    charitableContributions: result.carryforwards.charitableContributions.plus(1) } }, proof)).toThrow(/calculation|balance|reconcile/);
  await expect(fillReturn(input, result, { charitableReview: proof, blankFormsDir: 'missing2026-first-admission', outputDir: 'missing2026-first-admission' }))
    .rejects.toThrow(/No qualified review PDF mapping.*2026/);
  expect(JSON.stringify(input)).toBe(before);
});
