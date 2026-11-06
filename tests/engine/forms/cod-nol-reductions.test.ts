// Spec: spec/federal/cod-nol-reductions.yaml.
import { expect, it } from 'vitest';
import { calculateCodNolReduction } from '@/engine/forms/cod-nol-reductions.js';
import { calculateNetOperatingLoss } from '@/engine/forms/net-operating-loss.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { actualCodNolInput } from '../../fixtures/cod-nol.js';

it('validates actual insolvency sources without inventing a loss reduction', () => {
  const input = actualCodNolInput(), before = JSON.stringify(input);
  const result = calculateCodNolReduction(input);
  expect(result.sourceFactsVerified).toBe(true); expect(result.calculationComplete).toBe(false);
  expect(result.sourceExcludedAmount.toFixed()).toBe('40000');
  expect(result.regular).toBeUndefined(); expect(result.alternativeTax).toBeUndefined();
  expect(JSON.stringify(input)).toBe(before);
});
it('accepts actual origin-year attribute reductions without same-year loss use', () => {
  const input = actualCodNolInput();
  if (!input.netOperatingLoss?.vintages?.[0]) throw new Error('Missing fixture');
  input.netOperatingLoss.vintages = [{ ...input.netOperatingLoss.vintages[0], sourceId: 'loss2024', lossTaxYear: 2024,
    originalLoss: '80000', openingCarryforward: '60000',
    history: [{ taxYear: 2024, nolUsed: '0', attributeReduction: '20000', sourceReference: 'Filed2024Form982' }] }];
  const params = { taxYear: 2025, filingStatus: input.taxpayer.filingStatus, taxpayer: input.taxpayer, facts: input.netOperatingLoss };
  expect(calculateNetOperatingLoss(params).availableCarryforward.toFixed()).toBe('60000');
  input.netOperatingLoss.vintages[0].history[0].nolUsed = '1';
  expect(() => calculateNetOperatingLoss(params)).toThrow(/same|origin|use/i);
});
it('retains unknown and future-year boundaries for actual cancellation sources', () => {
  const input = actualCodNolInput();
  if (!input.form982NolSources?.debts?.[0] || !input.form982NolSources.insolvency || !input.netOperatingLoss?.alternativeTax) throw new Error('Missing fixture');
  input.taxpayer.taxYear = 2026; input.form982NolSources.sourceTaxYear = 2026;
  input.form982NolSources.debts[0].sourceTaxYear = 2026; input.form982NolSources.debts[0].dischargeDate = '2026-10-01';
  input.form982NolSources.insolvency.asOfDate = '2026-10-01';
  input.netOperatingLoss.sourceTaxYear = 2026;
  for (const row of [...(input.netOperatingLoss.vintages ?? []), ...(input.netOperatingLoss.alternativeTax.vintages ?? [])]) {
    row.adjustedThroughTaxYear = 2025;
  }
  expect(calculateCodNolReduction(input).calculationComplete).toBe(false);
  expect(() => calculateFederalTax(input)).toThrow(/readiness|not.*ready|not.*implemented|incomplete/i);
  const missing = actualCodNolInput(); delete missing.netOperatingLoss;
  expect(() => calculateFederalTax(missing)).toThrow(/carry|NOL|source/i);
});
