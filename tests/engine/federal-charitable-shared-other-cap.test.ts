// Spec: spec/federal/charitable-contribution-worksheet.yaml. Test-only draft constants.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants:(year:number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { currentCategoryFixture } from '../fixtures/current-charitable-categories.js';
it('transfers the shared other ceiling through actual current receipts and selected carry', () => {
  for (const [election,carry,standard] of [['itemized','20500','0'],['standard','20500','16100']] as const) {
    const input = currentCategoryFixture('10000','0','20000','30000','10000');
    input.w2s[0].wages='100000'; input.w2s[0].federalWithheld='30000'; input.deductionElection=election;
    if (!input.standardDeductionFacts) throw Error('Missing actual synthetic standard facts');
    input.standardDeductionFacts.spouseItemizes=false;
    const before=JSON.stringify(input),result=calculateFederalTax(input);
    expect(result.deductionUsed).toBe(election);
    expect([result.scheduleA?.charitableCurrentCash,result.scheduleA?.charitableCurrentNoncash,result.scheduleA?.charitableTotal].map(v=>v?.toFixed())).toEqual(['30000','19500','49500']);
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(carry);
    expect(result.carryforwards.charitableContributionsByYear.map(row=>[row.category,row.amount.toFixed()])).toEqual([
      ['capital_gain_30','10500'],['capital_gain_20','10000'],
    ]);
    expect(result.deductionAmount.toFixed()).toBe(election==='itemized'?'49500':standard);
    expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe(election==='itemized'?'0':'1000');
    expect(JSON.stringify(input)).toBe(before);
  }
});
