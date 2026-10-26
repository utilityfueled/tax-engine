// Spec: spec/federal/form-172-charitable-closure.yaml; test-only draft constants.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { currentCharitableOriginInput } from '../fixtures/form-172-charitable-origin.js';
import { originalCharitableOriginInput } from '../fixtures/form-172-charitable-closure.js';
import { singleCategoryCharitableNolInput } from '../fixtures/charitable-single-category-nol.js';

it('uses actual standard and nonitemized charitable deductions without inventing floor carry', () => {
  for (const method of ['standard', 'nonitemized'] as const) {
    const input = currentCharitableOriginInput('G', 2026); input.deductionElection = method;
    if (method === 'nonitemized') {
      input.taxpayer.filingStatus = 'married_filing_separately';
      if (!input.standardDeductionFacts || !input.charitableCarryoverSources) throw Error('Missing fictional actual eligibility/history');
      input.standardDeductionFacts.spouseItemizes = true;
      input.charitableCarryoverSources.filingStatus = 'married_filing_separately';
    }
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe(method);
    expect([result.agi, result.deductionAmount, result.nonitemizerCharitableDeduction,
      result.form172?.regular.netOperatingLoss, result.form172?.alternativeTax.netOperatingLoss,
      result.form6251?.amti, result.carryforwards.charitableContributions,
      result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
      .toEqual(['10000', method === 'standard' ? '16100' : '0', '1000', method === 'standard' ? '7100' : '0', '0', '9000', '14000', '14000']);
    expect(result.form172?.regular.partI[6].toFixed()).toBe(method === 'standard' ? '17100' : '1000');
    expect(JSON.stringify(input)).toBe(before);
  }
  for (const kind of ['crypto', 'partnership', 's_corporation'] as const) {
    const input = originalCharitableOriginInput(kind, 2026); input.deductionElection = 'standard';
    const result = calculateFederalTax(input);
    expect([result.nonitemizerCharitableDeduction, result.form172?.regular.netOperatingLoss, result.form6251?.amti,
      result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
      .toEqual(['0', '6100', '10000', '57000', '57000']);
  }
});

it('selects the actual candidate and preserves prior-loss and year boundaries', () => {
  const input = currentCharitableOriginInput('G', 2026); input.scheduleA = {}; input.deductionElection = 'automatic';
  expect(calculateFederalTax(input).deductionUsed).toBe('standard');
  input.standardDeductionFacts = undefined;
  expect(() => calculateFederalTax(input)).toThrow(/standard.*facts|facts.*standard/i);
  const missing = currentCharitableOriginInput('G', 2026); missing.deductionElection = 'standard';
  if (!missing.netOperatingLoss?.alternativeTax) throw Error('Missing fictional history');
  missing.netOperatingLoss.alternativeTax.charitableCarryoverHistory = undefined;
  expect(() => calculateFederalTax(missing)).toThrow(/charit.*histor|histor.*charit/i);
  for (const ledger of ['regular', 'alternative'] as const) {
    const positive = currentCharitableOriginInput('G', 2026); positive.deductionElection = 'standard';
    const source = singleCategoryCharitableNolInput('C', 2026);
    if (!positive.netOperatingLoss?.alternativeTax || !source.netOperatingLoss?.vintages?.[0]) throw Error('Missing actual fictional source');
    if (ledger === 'regular') positive.netOperatingLoss.vintages = source.netOperatingLoss.vintages;
    else positive.netOperatingLoss.alternativeTax.vintages = [{ ...source.netOperatingLoss.vintages[0], section1411OriginalLoss: undefined }];
    expect(() => calculateFederalTax(positive)).toThrow(/nonitemiz|origin|170.p|NOL/i);
  }
});
