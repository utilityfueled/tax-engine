// Spec: spec/federal/charitable-single-category-nol.yaml source-binding.
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { calculateSelectedCharitableCarryover } from '@/engine/forms/selected-charitable-carryover.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { readCurrentCharitableSourceForNol, validateCharitableNolContributionLimit } from '@/utils/charitable-nol-source.js';
import { d } from '@/utils/decimal.js';
import { singleCategoryCharitableNolInput } from '../../fixtures/charitable-single-category-nol.js';

it('binds the replay to original valuation year category medium and empty histories', () => {
  const input = singleCategoryCharitableNolInput('A');
  input.donations = [{ ...input.donations[0], amount: '100.49', costBasis: '50.01' },
    { ...input.donations[0], amount: '50.02', costBasis: '100.99' }];
  const source = readCurrentCharitableSourceForNol(input);
  expect([source.category, source.medium, source.amount.toFixed()]).toEqual(['noncash_50', 'noncash', '100.03']);
  const limit = { ...source, amount: d('50'), ledger: 'regular' as const };
  expect(validateCharitableNolContributionLimit(input, limit).amount.toFixed()).toBe('100.03');
  for (const patch of [{ category: 'other_30' as const }, { medium: 'cash' as const }, { amount: d('101') }, { sourceDigest: 'stale' }]) {
    expect(() => validateCharitableNolContributionLimit(input, { ...limit, ...patch })).toThrow(/source|reconcile/);
  }
  const changed = structuredClone(input); changed.donations[0].organization = 'Different actual recipient';
  expect(() => validateCharitableNolContributionLimit(changed, limit)).toThrow(/source|reconcile/);
  const year = structuredClone(input); year.taxpayer.taxYear = 2026;
  expect(() => validateCharitableNolContributionLimit(year, limit)).toThrow(/year/);
  const history = structuredClone(input);
  if (!history.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory) throw new Error('Missing synthetic history');
  history.netOperatingLoss.alternativeTax.charitableCarryoverHistory.sourceReference = 'Different actual history';
  expect(() => validateCharitableNolContributionLimit(history, limit)).toThrow(/source|reconcile/);
  history.netOperatingLoss.alternativeTax.charitableCarryoverHistory.priorRegularCarryovers = undefined;
  expect(() => readCurrentCharitableSourceForNol(history)).toThrow(/histor/);
  const mixed = singleCategoryCharitableNolInput('B-cash');
  mixed.donations.push(singleCategoryCharitableNolInput('B-property').donations[0]);
  expect(() => readCurrentCharitableSourceForNol(mixed)).toThrow(/mixed.*media/i);
  const parsed = TaxYearInputSchema.parse({ ...singleCategoryCharitableNolInput(), nolContributionLimit: limit });
  expect(parsed).not.toHaveProperty('nolContributionLimit');
  expect(calculateFederalTax(parsed).carryforwards.charitableContributions.toFixed()).toBe('33360');
  expect(() => calculateFederalTax(singleCategoryCharitableNolInput('C', 2026))).toThrow(/2026|review|calculat/i);
});

it('requires the original current-only itemized tag before selecting the 2026 NOL history', () => {
  const input = singleCategoryCharitableNolInput('C', 2026);
  const scheduleA = calculateScheduleA(input, d('43600'), input.taxpayer.filingStatus, FEDERAL_2026_CONSTANTS);
  expect(calculateSelectedCharitableCarryover({ taxYear: 2026, deductionMethod: 'itemized', scheduleA }).deduction.toFixed()).toBe('12862');
  for (const kind of ['absent', 'wrong-method', 'stale-source', 'nonitemized'] as const) {
    const changed = { ...scheduleA, currentCharitableNol: scheduleA.currentCharitableNol && { ...scheduleA.currentCharitableNol } };
    if (kind === 'absent') changed.currentCharitableNol = undefined;
    if (kind === 'wrong-method' && changed.currentCharitableNol) Object.assign(changed.currentCharitableNol, { method: 'unrecognized' });
    if (kind === 'stale-source' && changed.currentCharitableNol) changed.currentCharitableNol.sourceDigest = 'stale';
    expect(() => calculateSelectedCharitableCarryover({ taxYear: 2026, deductionMethod: kind === 'nonitemized' ? 'nonitemized' : 'itemized', scheduleA: changed }))
      .toThrow(/charit|source|NOL/i);
  }
});
