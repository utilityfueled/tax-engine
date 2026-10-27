import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
    const original = await importOriginal<typeof import('@/models/constants.js')>();
    const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
    return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { k1PassiveCapitalFixture } from '../fixtures/k1-passive-capital.js';
import { requireRiskSource } from '../fixtures/k1-charitable-at-risk.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';

it('preserves original capital allocation and actual charitable selection under isolated2026 rules', () => {
    // Spec: K1 Passive Capital Sources, isolated-2026. This mock does not alter production readiness.
    const shift = (value: unknown): unknown => typeof value === 'number' && [2024, 2025].includes(value) ? value + 1
        : typeof value === 'string' && /^202[45]-/.test(value) ? String(Number(value.slice(0, 4)) + 1) + value.slice(4)
            : Array.isArray(value) ? value.map(shift) : value && typeof value === 'object'
                ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shift(item)])) : value;
    const input = shift(k1PassiveCapitalFixture('passive_activity', '0')) as ReturnType<typeof k1PassiveCapitalFixture>;
    requireRiskSource(requireRiskSource(charitableStatement(input).capitalCharacter).priorPassiveCapital).shortTermLoss = '8000';
    requireRiskSource(input.priorYear).suspendedPassiveLosses[0].amount = '8000';
    const before = JSON.stringify(input), itemized = calculateFederalTax(input);
    expect(itemized.agi.toDecimalPlaces(8).toFixed()).toBe('100000');
    expect(itemized.capitalGainLoss.toDecimalPlaces(8).toFixed()).toBe('1333.33333333');
    expect(requireRiskSource(itemized.scheduleA).charitableTotal.toFixed()).toBe('9500');
    expect(requireRiskSource(itemized.carryforwards.k1PassiveByCharacter)[0].shortTermCapital.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
    input.deductionElection = 'standard';
    const standard = calculateFederalTax(input);
    expect(requireRiskSource(standard.nonitemizerCharitableDeduction).toFixed()).toBe('1000');
    expect(standard.carryforwards.k1PassiveByCharacter).toEqual(itemized.carryforwards.k1PassiveByCharacter);
});
