import { requireRiskSource } from '../fixtures/k1-charitable-at-risk.js';
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
    const original = await importOriginal<typeof import('@/models/constants.js')>();
    const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
    return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal';
import { k1CharitableRiskOriginFixture } from '../fixtures/k1-charitable-at-risk';
it('preserves source allocation through isolated current floor and actual choice', () => {
    const input = k1CharitableRiskOriginFixture(2026), before = JSON.stringify(input), r = calculateFederalTax(input);
    expect(r.agi.toFixed()).toBe('25000'); expect(requireRiskSource(r.scheduleA).charitableTotal.toFixed()).toBe('9875');
    expect(r.carryforwards.charitableContributions.toFixed()).toBe('0'); expect(requireRiskSource(r.form172).regular.netOperatingLoss.toFixed()).toBe('4875');
    expect(requireRiskSource(r.carryforwards.k1AtRiskByCharacter)[0].charitable[0].suspended.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
    input.deductionElection = 'standard'; const standard = calculateFederalTax(input);
    expect(requireRiskSource(standard.nonitemizerCharitableDeduction).toFixed()).toBe('1000'); expect(requireRiskSource(standard.form6251).amti.toFixed()).toBe('24000');
    expect(requireRiskSource(standard.carryforwards.k1AtRiskByCharacter)[0].charitable[0].suspended.toFixed()).toBe('0');
});
