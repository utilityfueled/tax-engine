// Spec: current-minimum-tax-credit-sources.yaml isolated-2026-* and production-2026-closed.
// Draft constants exist only in this isolated test module. Production gates remain unchanged.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { actualCurrentMtc2026Input } from '../fixtures/current-minimum-tax-credit.js';

it('retains isolated2026 positive signed generation and current tax', () => {
  const input = actualCurrentMtc2026Input(), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.deductionAmount, result.taxableIncome, result.form6251!.amti, result.form6251!.tentativeMinimumTax,
    result.form6251!.amt, result.currentMinimumTaxCredit!.sourceCalculation.minTaxCreditFromSourceYear,
    result.currentMinimumTaxCredit!.currentCreditUsed, result.currentMinimumTaxCredit!.followingYearPool,
    result.carryforwards.minimumTaxCredit, result.totalTax].map(value => value.toFixed()))
    .toEqual(['16100', '83900', '300000', '54574', '41404', '41404', '0', '41404', '41304', '54574']);
  expect(result.currentMinimumTaxCredit!.sourceCalculation.netMinTaxOnExclusionItems.toFixed()).toBe('0');
  expect(JSON.stringify(input)).toBe(before);
});

it('retains actual2022 sources at isolated2026 aggregate zero and dollar boundaries', () => {
  for (const [prior, currentCarry, pool, remainingCod] of [['52000', '41404', '0', '300'], ['52001', '41405', '1', '297']] as const) {
    const input = actualCurrentMtc2026Input({ reversal: true, priorAvailable: prior }), before = JSON.stringify(input);
    const result = calculateFederalTax(input);
    expect([result.form6251!.amti, result.form6251!.tentativeMinimumTax, result.form6251!.amt,
      result.currentMinimumTaxCredit!.sourceCalculation.exclusionOnlyAMTI, result.currentMinimumTaxCredit!.signedCurrentAdjustment,
      result.form8801!.creditAllowed, result.form8801!.carryforwardToNextYear, result.currentMinimumTaxCredit!.followingYearPool,
      result.carryforwards.minimumTaxCredit, result.codAttributeReduction!.regular.unreducedExclusion, result.totalTax].map(value => value.toFixed()))
      .toEqual(['100000', '2574', '0', '300000', '-41404', '10596', currentCarry, pool, '0', remainingCod, '2574']);
    expect(input.form982AttributeSources.regular!.records![0]!.originTaxYear).toBe(2022);
    expect(input.form982AttributeSources.regular!.records![0]!.history!.map(row => row.taxYear)).toEqual([2023, 2024, 2025]);
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('keeps2026 export closed after isolated source calculation', async () => {
  const input = actualCurrentMtc2026Input(), result = calculateFederalTax(input);
  const directory = await mkdtemp(join(tmpdir(), 'current-mtc-2026-closed-'));
  try {
    await expect(fillReturn(input, result, { outputDir: directory, blankFormsDir: 'forms/blank' })).rejects.toThrow(/2026|template|review.*unavailable/i);
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
