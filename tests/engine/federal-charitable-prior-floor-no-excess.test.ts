// Spec: spec/federal/charitable-prior-floor-no-excess.yaml. Draft arithmetic only; production gate unchanged.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateSelectedCharitableCarryover } from '@/engine/forms/selected-charitable-carryover.js';
import { d } from '@/utils/decimal.js';
import { priorFloorNoExcessFixture as fixture } from '../fixtures/charitable-prior-floor-no-excess.js';

it('selects the actual prior deductible amount independently of treated-paid consumption', () => {
  for (const [election, method] of [['itemized', 'itemized'], ['automatic', 'standard'], ['standard', 'standard'], ['nonitemized', 'nonitemized']] as const) {
    const input = fixture('0', election), before = JSON.stringify(input), result = calculateFederalTax(input);
    const treatment = result.scheduleA?.charitableTreatment;
    if (!treatment) throw new Error('Missing actual selected charitable treatment');
    expect(result.deductionUsed).toBe(method);
    expect(treatment.priorTreatedAsPaid.toFixed()).toBe('5000');
    expect(treatment.priorDeduction.toFixed()).toBe(method === 'itemized' ? '4500' : '0');
    expect(treatment.deduction.toFixed()).toBe(method === 'itemized' ? '14500' : '1000');
    expect(treatment.detail.map(row => [row.taxYear, row.amountRemaining.toFixed(), row.amountExpired.toFixed()])).toEqual([[2025, '0', '0']]);
    expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
    expect(treatment.carryforwards).toEqual([]);
    expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe(method === 'itemized' ? '0' : '1000');
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('rejects stale or altered selected prior-floor evidence', () => {
  const result = calculateFederalTax(fixture()), a = result.scheduleA;
  if (!a?.determinedCharitableFloor) throw new Error('Missing derived original floor');
  const proof = a.determinedCharitableFloor;
  const candidates = [
    { ...a, determinedCharitableFloor: undefined },
    { ...a, determinedCharitableFloor: { ...proof, sourceDigest: 'stale' } },
    { ...a, charitableCarryforwardDetail: a.charitableCarryforwardDetail.map(row => ({ ...row, amountUsed: d('5000') })) },
    { ...a, charitableCarryforwardDetail: a.charitableCarryforwardDetail.map(row => ({ ...row, sourceId: 'different-original' })) },
    { ...a, charitableCarryforwardDetail: a.charitableCarryforwardDetail.map(row => ({ ...row, treatedAsPaid: d('4500'), amountRemaining: d('500') })) },
    { ...a, determinedCharitableFloor: { ...proof, floorDisallowed: d('499.99') } },
    { ...a, charitableCarryforwardByYear: [{ sourceId: 'invented-current', taxYear: 2026, category: 'capital_gain_30' as const, medium: 'noncash' as const, amount: d('500') }] },
  ];
  for (const candidate of candidates) expect(() => calculateSelectedCharitableCarryover({ taxYear: 2026, deductionMethod: 'itemized', scheduleA: candidate })).toThrow(/source|floor|reconcil|method|carry/i);
});

it('keeps actual2026 production constants closed', async () => {
  const actual = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => actual.getConstants(2026)).toThrow(/review|readiness|unavailable|not.*ready|not.*supported/i);
});
