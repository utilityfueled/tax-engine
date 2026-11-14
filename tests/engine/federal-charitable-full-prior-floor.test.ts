// Spec: spec/federal/charitable-full-prior-floor.yaml. Draft arithmetic only; actual production gate remains closed.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateSelectedCharitableCarryover } from '@/engine/forms/selected-charitable-carryover.js';
import { d } from '@/utils/decimal.js';
import { fullPriorFloorFixture as fixture } from '../fixtures/charitable-full-prior-floor.js';

it('selects whole-category prior consumption without reviving disallowed old contributions', () => {
  for (const [election, method] of [['itemized','itemized'], ['automatic','standard'], ['standard','standard'], ['nonitemized','nonitemized']] as const) {
    const input = fixture('200','300','10000',election), before = JSON.stringify(input), result = calculateFederalTax(input);
    const treatment = result.scheduleA?.charitableTreatment;
    if (!treatment) throw Error('Missing actual selected treatment');
    expect(result.deductionUsed).toBe(method);
    if (election === 'itemized' || election === 'automatic') {
      expect(result.scheduleA?.determinedCharitableFloor?.method).toBe('2026_full_prior_category_floor_no_excess');
    } else {
      expect(result.scheduleA?.nonitemizedCharitableCarryover?.method).toBe('2026_nonitemized_ordinary_categories');
    }
    expect(treatment.priorTreatedAsPaid.toFixed()).toBe('500'); expect(treatment.priorDeduction.toFixed()).toBe('0');
    expect(treatment.deduction.toFixed()).toBe(method === 'itemized' ? '10000' : '1000');
    expect(treatment.detail.map(row => [row.taxYear,row.treatedAsPaid?.toFixed(),row.amountUsed.toFixed(),row.amountRemaining.toFixed()]))
      .toEqual([[2024,'200','0','0'],[2025,'300','0','0']]);
    expect(treatment.carryforwards).toEqual([]); expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('rejects altered full-prior proof while keeping production2026 closed', async () => {
  const result=calculateFederalTax(fixture('200','300','10000')), schedule=result.scheduleA;
  if (!schedule?.determinedCharitableFloor) throw Error('Missing derived original proof');
  const proof=schedule.determinedCharitableFloor;
  const altered = [
    { ...schedule, determinedCharitableFloor: undefined },
    { ...schedule, determinedCharitableFloor: { ...proof, sourceDigest:'changed' } },
    { ...schedule, determinedCharitableFloor: { ...proof, method:'2026_determined_current_category_floor' as const } },
    { ...schedule, charitableCarryforwardDetail:schedule.charitableCarryforwardDetail.map(row => ({ ...row,amountUsed:d('1') })) },
    { ...schedule, charitableCarryforwardDetail:schedule.charitableCarryforwardDetail.map(row => ({ ...row,taxYear:2026 })) },
    { ...schedule, charitableCarryforwardDetail:schedule.charitableCarryforwardDetail.map(row => ({ ...row,sourceId:'changed' })) },
    { ...schedule, determinedCharitableFloor:{ ...proof,floorDisallowed:d('499.99') } },
    { ...schedule, charitableCarryforwardByYear:[{sourceId:'renewed',taxYear:2026,category:'capital_gain_30' as const,medium:'noncash' as const,amount:d('500')}] },
  ];
  for (const candidate of altered) expect(() => calculateSelectedCharitableCarryover({taxYear:2026,deductionMethod:'itemized',scheduleA:candidate})).toThrow();
  const actual=await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => actual.getConstants(2026)).toThrow(/review|readiness|unavailable|not.*ready|not.*supported/i);
});
