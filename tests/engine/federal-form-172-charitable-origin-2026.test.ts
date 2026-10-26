// Spec: spec/federal/form-172-charitable-origin.yaml isolated-2026-floor.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { currentCharitableOriginInput } from '../fixtures/form-172-charitable-origin.js';

it('retains the isolated current floor and the distinct actual standard choice', () => {
  const input = currentCharitableOriginInput('G', 2026), original = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.agi, result.scheduleA?.charitableTotal, result.deductionAmount, result.form172?.regular.netOperatingLoss,
    result.form172?.alternativeTax.netOperatingLoss, result.carryforwards.charitableContributions,
    result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['10000', '5950', '25950', '15950', '0', '14050', '14050']);
  expect(JSON.stringify(input)).toBe(original);
  input.deductionElection = 'standard';
  const standard = calculateFederalTax(input);
  expect([standard.deductionAmount, standard.nonitemizerCharitableDeduction, standard.form172?.regular.netOperatingLoss,
    standard.carryforwards.charitableContributions, standard.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['16100', '1000', '7100', '14000', '14000']);
});
