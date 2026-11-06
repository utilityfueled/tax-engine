// Spec: spec/federal/form-8814-amt-sources.yaml.
import { describe, expect, it } from 'vitest';
import { calculateForm8814AmtSources } from '@/engine/forms/form-8814-amt-sources.js';
import { Form8814ChildSchema } from '@/models/inputs.js';

function child(overrides: Record<string, unknown> = {}) {
  return Form8814ChildSchema.parse({
    taxableInterest: '3000', taxExemptInterest: '1000', ordinaryDividends: '0',
    qualifiedDividends: '0', capitalGainDistributions: '0',
    amtSources: {
      taxYear: 2026, allStatementsConfirmed: true,
      statements: [
        { sourceId: 'synthetic-child-int', form: '1099-INT', taxExemptInterest: '600', specifiedPrivateActivityBondInterest: '350.25' },
        { sourceId: 'synthetic-child-div', form: '1099-DIV', taxExemptInterest: '400', specifiedPrivateActivityBondInterest: '150.25' },
      ],
      otherwiseAllowableDeduction: '25.25',
      deductionSourceReference: 'Synthetic completed allowable-deduction worksheet',
      deductionAllowanceAndNoDuplicationConfirmed: true,
    }, ...overrides,
  });
}

describe('Actual child Form8814 AMT sources', () => {
  it('uses reported interest and dividend preferences with actual deductions and a zero floor', () => {
    const input = child();
    const result = calculateForm8814AmtSources([input], 2026);
    // Actual reported boxes 350.25+150.25 less documented 25.25 =475.25.
    expect(result.privateActivityBondInterest.toFixed()).toBe('475.25');
    expect(result.lines.some(line => line.value.toFixed() === '475.25')).toBe(true);
    expect(calculateForm8814AmtSources([child({ amtSources: { ...input.amtSources, otherwiseAllowableDeduction: '600' } })], 2026).privateActivityBondInterest.toFixed()).toBe('0');
    expect(calculateForm8814AmtSources([child({ amtSources: { ...input.amtSources, otherwiseAllowableDeduction: '0', deductionSourceReference: undefined, deductionAllowanceAndNoDuplicationConfirmed: undefined } })], 2026).privateActivityBondInterest.toFixed()).toBe('500.5');
    expect(calculateForm8814AmtSources([], 2026).privateActivityBondInterest.toFixed()).toBe('0');
  });

  it('requires complete matching actual sources instead of treating unknown preference as zero', () => {
    const input = child();
    const source = input.amtSources!;
    const mutations = [
      undefined,
      { ...source, taxYear: 2025 },
      { ...source, allStatementsConfirmed: false },
      { ...source, statements: [] },
      { ...source, otherwiseAllowableDeduction: undefined },
      { ...source, deductionSourceReference: '' },
      { ...source, deductionAllowanceAndNoDuplicationConfirmed: false },
      { ...source, statements: source.statements.map((entry, index) => index ? entry : { ...entry, specifiedPrivateActivityBondInterest: undefined }) },
      { ...source, statements: source.statements.map((entry, index) => index ? entry : { ...entry, specifiedPrivateActivityBondInterest: '600.01' }) },
      { ...source, statements: source.statements.map((entry, index) => index ? entry : { ...entry, taxExemptInterest: '-600' }) },
      { ...source, statements: source.statements.map((entry, index) => index ? entry : { ...entry, sourceId: '' }) },
      { ...source, statements: source.statements.map(entry => ({ ...entry, sourceId: 'same-source' })) },
    ];
    for (const amtSources of mutations) {
      expect(() => calculateForm8814AmtSources([{ ...input, amtSources } as typeof input], 2026)).toThrow();
    }
    expect(() => child({ amtSources: { ...source, otherwiseAllowableDeduction: undefined } })).toThrow();
    expect(() => calculateForm8814AmtSources([input, input], 2026)).toThrow(/duplicate/i);
    expect(() => calculateForm8814AmtSources([input], 2027)).toThrow(/year/i);
    const explicitZero = child({ taxExemptInterest: '0', amtSources: undefined });
    expect(calculateForm8814AmtSources([explicitZero], 2026).privateActivityBondInterest.toFixed()).toBe('0');
    expect(() => child({ taxExemptInterest: undefined, amtSources: undefined })).toThrow();
  });

  it('keeps zero preferences and source cents distinct across children and historical years', () => {
    const input = child();
    const second = child({ taxExemptInterest: '100.25', amtSources: {
      taxYear: 2026, allStatementsConfirmed: true, otherwiseAllowableDeduction: '0',
      statements: [{ sourceId: 'second-child-int', form: '1099-INT', taxExemptInterest: '100.25', specifiedPrivateActivityBondInterest: '0' }],
    } });
    expect(calculateForm8814AmtSources([input, second], 2026).privateActivityBondInterest.toFixed()).toBe('475.25');
    expect(calculateForm8814AmtSources([{ ...input, amtSources: { ...input.amtSources!, taxYear: 2025 } }], 2025).privateActivityBondInterest.toFixed()).toBe('475.25');
  });
});
