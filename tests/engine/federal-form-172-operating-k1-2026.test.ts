// Spec: form-172-operating-k1.yaml isolated-2026-source-choice; public gates unchanged.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal';
import { operatingK1CharitableOriginInput } from '../fixtures/form-172-operating-k1';

it('retains isolated current K1 floor and source-based standard choice', () => {
  const input = operatingK1CharitableOriginInput(false, 2026), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.agi, result.scheduleA?.charitableTotal, result.form172?.regular.netOperatingLoss, result.form6251?.amti,
    result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['10000', '5950', '15950', '4050', '4050', '4050']);
  expect(JSON.stringify(input)).toBe(before);
  input.deductionElection = 'standard'; const standard = calculateFederalTax(input);
  expect([standard.deductionAmount, standard.nonitemizerCharitableDeduction, standard.form172?.regular.netOperatingLoss,
    standard.form6251?.amti, standard.carryforwards.charitableContributions, standard.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['16100', '1000', '7100', '9000', '4000', '4000']);
});
