// Spec: charitable-cod-modified-composition.yaml review/private-context.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { buildNetOperatingLossReview } from '@/pdf/fill-net-operating-loss';
import { buildForm982ReferenceSummary } from '@/pdf/fill-form-982';
import { prepareCharitableReview } from '@/pdf/charitable-review-context';
import { prepareCodNolReview } from '@/pdf/cod-nol-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { fillReturn } from '@/pdf/fill-return';
import { charitableCodModifiedInput } from '../fixtures/charitable-cod-modified';
import { d } from '@/utils/decimal';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

it('shows distinct actual use modified absorption and comparison after the same reduction', () => {
  const input = charitableCodModifiedInput(true), result = calculateFederalTax(input), before = JSON.stringify(input);
  const cod = prepareCodNolReview(input), charity = prepareCharitableReview(input), redacted = redactReviewIdentifiers(input);
  const text = buildNetOperatingLossReview(redacted, result, undefined, cod, charity).join(' ');
  expect(text).toContain('Regular COD current-tax use 37520; modified absorption 39200; modified available before reduction 60800');
  expect(text).toContain('Regular COD: before 62480; reduction 5000; expiry 0; remaining 55800');
  expect(text).toContain('Regular COD charitable comparison: before 51075; remaining 46075; original NOL difference 9725; after COD difference 9725');
  expect(text).toContain('Alternative COD current-tax use 81900; modified absorption 84600; modified available before reduction 15400');
  expect(text).toContain('Alternative COD: before 18100; reduction 5000; expiry 0; remaining 10400');
  const summary = buildForm982ReferenceSummary(result);
  expect(summary.totals).toContainEqual({ label: 'Regular modified loss available before COD', value: '60800' });
  expect(summary.totals).toContainEqual({ label: 'Regular succeeding NOL difference after COD', value: '9725' });
  expect(summary.totals).toContainEqual({ label: 'Alternative modified loss available before COD', value: '15400' });
  for (const privateValue of [input.taxpayer.primary.ssn, 'Original account-A', 'Original statement-A', '12-3456789']) expect(text).not.toContain(privateValue);
  expect(JSON.stringify(input)).toBe(before);
});

it('rejects stale originals and altered compared loss vectors before output', async () => {
  const input = charitableCodModifiedInput(true), redacted = redactReviewIdentifiers(input), token = prepareCodNolReview(input), charity = prepareCharitableReview(input);
  const directory = await mkdtemp(join(tmpdir(), 'charitable-cod-reject-'));
  try {
    for (const mutate of [
      (value: typeof input) => { value.w2s[0].wages = '110001'; },
      (value: typeof input) => { if (value.form982NolSources?.debts?.[0]) value.form982NolSources.debts[0].amountDischarged = '5001'; },
      (value: typeof input) => { if (value.charitableCarryoverSources?.vintages?.[0]) value.charitableCarryoverSources.vintages[0].sourceReference = 'Different actual original'; },
    ]) {
      const changed = structuredClone(redacted); mutate(changed);
      await expect(fillReturn(changed, calculateFederalTax(input), { outputDir: directory, blankFormsDir: '/missing-private-cod-templates',
        codNolReview: token, charitableReview: charity })).rejects.toThrow(/original|source|stale|reconcile/i);
      expect(await readdir(directory)).toEqual([]);
    }
    for (const mutate of [
      (value: ReturnType<typeof calculateFederalTax>) => { if (value.codNolReduction?.regular) value.codNolReduction.regular.modifiedUseAdjustment = d('0'); },
      (value: ReturnType<typeof calculateFederalTax>) => { if (value.codNolReduction?.regular?.charitableComparison) value.codNolReduction.regular.charitableComparison.nolDifferenceAfterReduction = d('9724'); },
      (value: ReturnType<typeof calculateFederalTax>) => { const row = value.codNolReduction?.regular?.vintages.find(row => row.charitableComparison?.beforeReduction.gt(0));
        if (row?.charitableComparison) row.charitableComparison.modifiedAbsorption = row.charitableComparison.modifiedAbsorption.plus(1); },
    ]) {
      const result = calculateFederalTax(input); mutate(result);
      await expect(fillReturn(redacted, result, { outputDir: directory, blankFormsDir: '/missing-private-cod-templates',
        codNolReview: token, charitableReview: charity })).rejects.toThrow(/original|source|stale|reconcile/i);
      expect(await readdir(directory)).toEqual([]);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
