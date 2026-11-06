// Spec: spec/federal/marketplace-binding-owner-full-repayment.yaml, private-review-source.
import { afterEach, expect, it, vi } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { preparePremiumTaxCreditReview, premiumTaxCreditReviewOriginalSourceInput, type PreparedPremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context.js';
import { fillForm7206 } from '@/pdf/fill-form-7206.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import * as pdfUtils from '@/pdf/pdf-utils.js';
import { d } from '@/utils/decimal.js';
import { bindingOwnerFullRepaymentInput } from '../fixtures/marketplace-binding-owner-full-repayment.js';
afterEach(() => vi.restoreAllMocks());

it('binds the complete ordinary owner originals and canonical result in the private review context', () => {
  const input = bindingOwnerFullRepaymentInput(), result = calculateFederalTax(input);
  const before = JSON.stringify(input), prepared = preparePremiumTaxCreditReview(input);
  expect(premiumTaxCreditReviewOriginalSourceInput(input, result, prepared)).toEqual(input);
  expect(premiumTaxCreditReviewOriginalSourceInput(redactReviewIdentifiers(input), redactReviewIdentifiers(result), prepared)).toEqual(input);
  expect(premiumTaxCreditReviewOriginalSourceInput(input, result)).toEqual(input);
  expect(JSON.stringify(input)).toBe(before);
});

it.each(['source', 'result', 'token'] as const)('rejects changed ordinary full-repayment review material before template I/O: %s', async kind => {
  const input = bindingOwnerFullRepaymentInput(), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const load = vi.spyOn(pdfUtils, 'loadReviewTemplate');
  const actual = structuredClone(input);
  if (kind === 'source') actual.form7206!.plans![0].payments![0].sourceId = 'different actual receipt';
  if (kind === 'result') result.agi = result.agi.plus(d(1));
  const token = kind === 'token' ? {} as PreparedPremiumTaxCreditReview : prepared;
  await expect(fillForm7206(redactReviewIdentifiers(actual), redactReviewIdentifiers(result), '/missing-template-must-not-be-read', 'scheduleC', 'primary', undefined, token)).rejects.toThrow(/stale|conflict|reconcile|context/);
  expect(load).not.toHaveBeenCalled();
});
