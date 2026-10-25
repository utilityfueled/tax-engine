// Spec: spec/federal/form-8814-amt-sources.yaml.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

describe('Child Form8814 preference canonical transfer', () => {
  it('transfers actual child preferences once into AMT without adding regular parent exempt interest', () => {
    for (const year of [2025, 2026]) {
      const actual = TaxYearInputSchema.parse({
        ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
        form1099Int: [{ privateActivityBondInterest: "0", payer: 'Synthetic parent bank', interestIncome: '0', taxExemptInterest: '125' }],
        form8814: [{ taxableInterest: '3000', taxExemptInterest: '1000', ordinaryDividends: '0', qualifiedDividends: '0', capitalGainDistributions: '0',
          amtSources: { taxYear: year, allStatementsConfirmed: true, otherwiseAllowableDeduction: '0', statements: [
            { sourceId: 'synthetic-child-interest', form: '1099-INT', taxExemptInterest: '1000', specifiedPrivateActivityBondInterest: '500' },
          ] },
        }],
      });
      const result = calculateFederalTax(actual);
      expect(result.allLines.find(line => line.form === 'Form 6251' && line.line === '2g')?.value.toFixed()).toBe('500');
      expect(result.allLines.find(line => line.form === '1040' && line.line === '2a')?.value.toFixed()).toBe('125');
      expect(result.form8814?.totalTaxExemptInterest.toFixed()).toBe('1000');
      const noPreference = structuredClone(actual);
      noPreference.form8814![0].amtSources!.statements[0].specifiedPrivateActivityBondInterest = '0';
      const baseline = calculateFederalTax(noPreference);
      expect(result.form6251.amti.minus(baseline.form6251.amti).toFixed()).toBe('500');
      expect(result.agi.eq(baseline.agi)).toBe(true);
      const incomplete = structuredClone(actual);
      delete incomplete.form8814![0].amtSources;
      expect(() => calculateFederalTax(incomplete)).toThrow(/actual.*source/i);
    }
  });
});
