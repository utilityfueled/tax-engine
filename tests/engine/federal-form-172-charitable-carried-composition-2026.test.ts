// Spec: form-172-charitable-carried-composition.yaml; isolated constants preserve real gates.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal';
import { carriedCurrentCharitableHistoriesInput } from '../fixtures/form-172-charitable-carried-composition';

it('retains current170p once with actual old regular and alternative carries', () => {
  const input = carriedCurrentCharitableHistoriesInput({ year: 2026 }); input.deductionElection = 'standard';
  const result = calculateFederalTax(input);
  expect([result.deductionAmount, result.nonitemizerCharitableDeduction, result.netOperatingLoss?.deduction,
    result.form172?.regular.netOperatingLoss, result.carryforwards.nolCarryforward,
    result.netOperatingLoss?.alternativeTax.deduction, result.netOperatingLoss?.alternativeTax.carryforward,
    result.form6251?.amti, result.form172?.alternativeTax.netOperatingLoss,
    result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['16100', '1000', '0', '7100', '107100', '8100', '91900', '900', '0', '2000', '0']);
});

it('does not invent standard entitlement when old NOL is claimed', () => {
  const input = carriedCurrentCharitableHistoriesInput({ year: 2026 });
  input.deductionElection = 'nonitemized'; input.taxpayer.filingStatus = 'married_filing_separately';
  const regular = input.charitableCarryoverSources, alternative = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources;
  if (!input.standardDeductionFacts || !regular || !alternative) throw new Error('Missing fictional actual entitlement and histories');
  input.standardDeductionFacts.spouseItemizes = true;
  regular.filingStatus = 'married_filing_separately'; alternative.filingStatus = 'married_filing_separately';
  const result = calculateFederalTax(input);
  expect(result.deductionUsed).toBe('nonitemized');
  expect([result.deductionAmount, result.nonitemizerCharitableDeduction, result.netOperatingLoss?.deduction, result.agi,
    result.netOperatingLoss?.carryforward, result.form172?.regular.partI[23], result.form172?.regular.netOperatingLoss,
    result.netOperatingLoss?.alternativeTax.deduction, result.carryforwards.alternativeTaxNolCarryforward,
    result.form6251?.amti, result.form172?.alternativeTax.netOperatingLoss,
    result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['0', '1000', '7200', '2800', '92800', '7200', '0', '8100', '91900', '900', '0', '5320', '820']);
  expect(result.netOperatingLoss?.determinedCharitableCarryover?.rows.find(row => row.kind === 'prior')?.normalUse.toFixed()).toBe('0');
});
