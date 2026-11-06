// Spec: current-minimum-tax-credit-sources.yaml aggregate-reference/aggregate-context.
import { expect, it } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFederalTax } from '@/engine/federal';
import { buildForm982ReferenceSummary } from '@/pdf/fill-form-982';
import { buildForm8801ReferenceSummary } from '@/pdf/fill-form-8801';
import { prepareCodNolReview } from '@/pdf/cod-nol-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { fillReturn } from '@/pdf/fill-return';
import { d } from '@/utils/decimal';
import { actualCurrentMtcInput } from '../fixtures/current-minimum-tax-credit';

it('prints separate source current-use and following-year aggregate amounts', () => {
  const result = calculateFederalTax(actualCurrentMtcInput({ reversal: true, priorAvailable: '70000', splitPrior: true }));
  const summary = buildForm982ReferenceSummary(result);
  const value = (label: string) => summary.totals.find(row => row.label === label)?.value;
  expect(value('Current full Form8801 carry before signed adjustment')).toBe('59639');
  expect(value('Signed current-year minimum tax credit adjustment')).toBe('-41639');
  expect(value('Beginning-next-year minimum tax credit before COD')).toBe('18000');
  expect(value('Minimum tax credit aggregate after COD')).toBe('17900');
  expect(value('Prior minimum tax credit source 1 original year')).toBe('2022');
  expect(value('Prior minimum tax credit source 2 original year')).toBe('2023');
  const current = buildForm8801ReferenceSummary(result.form8801!, result);
  expect(current.totals).toContainEqual({ label: 'Signed current-year minimum tax credit adjustment', value: '-41639' });
  expect(current.lines.find(row => row.line === '26')?.value).toBe('59639');
  const positive = buildForm982ReferenceSummary(calculateFederalTax(actualCurrentMtcInput()));
  expect(positive.totals).toContainEqual({ label: 'Current-source PartI line18', value: '41639' });
});

it('rejects missing duplicate and altered aggregate reference sources', () => {
  for (const change of [
    (r: ReturnType<typeof calculateFederalTax>) => { r.currentMinimumTaxCredit = undefined; },
    (r: ReturnType<typeof calculateFederalTax>) => { r.codAttributeReduction!.regular.minimumTaxCreditPool!.priorSourceRecords.push(r.codAttributeReduction!.regular.minimumTaxCreditPool!.priorSourceRecords[0]!); },
    (r: ReturnType<typeof calculateFederalTax>) => { r.codAttributeReduction!.regular.minimumTaxCreditPool!.remaining = d('17901'); },
    (r: ReturnType<typeof calculateFederalTax>) => { r.currentMinimumTaxCredit!.sourceCalculation.lines.push(r.currentMinimumTaxCredit!.sourceCalculation.lines[0]!); },
    (r: ReturnType<typeof calculateFederalTax>) => { r.currentMinimumTaxCredit!.signedCurrentAdjustment = d('-41638'); },
  ]) {
    const result = calculateFederalTax(actualCurrentMtcInput({ reversal: true, priorAvailable: '70000', splitPrior: true }));
    change(result); expect(() => buildForm982ReferenceSummary(result)).toThrow();
  }
});

it('rejects changed signed and canonical contexts before writing', async () => {
  const input = actualCurrentMtcInput({ reversal: true, priorAvailable: '70000' }), token = prepareCodNolReview(input);
  const directory = await mkdtemp(join(tmpdir(), 'current-mtc-context-'));
  try {
    for (const change of [
      (r: ReturnType<typeof calculateFederalTax>) => { r.currentMinimumTaxCredit!.sourceCalculation.exclusionOnlyAMTI = d('299999'); },
      (r: ReturnType<typeof calculateFederalTax>) => { r.form6251!.tentativeMinimumTax = d('3095'); },
    ]) {
      const result = calculateFederalTax(input); change(result);
      await expect(fillReturn(redactReviewIdentifiers(input), result, { outputDir: directory, blankFormsDir: 'forms/blank', codNolReview: token })).rejects.toThrow(/context|reconcile/i);
      expect(await readdir(directory)).toEqual([]);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
