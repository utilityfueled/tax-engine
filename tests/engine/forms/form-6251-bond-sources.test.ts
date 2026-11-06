// Spec: spec/federal/form-6251-bond-sources.yaml.
import { describe, expect, it } from 'vitest';
import { calculateForm6251BondSources } from '@/engine/forms/form-6251-bond-sources.js';
import { Form1099IntSchema, Form1099DivSchema } from '@/models/inputs.js';

const facts = (sourceId: string) => ({ taxYear: 2026, sourceId, recipientAmountsConfirmed: true,
  otherwiseAllowableDeduction: '0' });
const interest = (changes: Record<string, unknown> = {}) => Form1099IntSchema.parse({
  payer: 'Synthetic bank', accountHolder: 'primary', interestIncome: '0', taxExemptInterest: '500.25',
  privateActivityBondInterest: '125.10', privateActivityBondFacts: facts('parent-int'), ...changes,
});
const dividend = (changes: Record<string, unknown> = {}) => Form1099DivSchema.parse({
  payer: 'Synthetic fund', accountHolder: 'primary', ordinaryDividends: '0', exemptInterestDividends: '400.25',
  specifiedPrivateActivityBondInterest: '20.20', privateActivityBondFacts: facts('parent-div'), ...changes,
});

describe('Parent Form6251 bond source preferences', () => {
  it('nets actual source preferences and deductions without adding exempt income twice', () => {
    const actual = interest({ privateActivityBondFacts: { ...facts('parent-int'), otherwiseAllowableDeduction: '5.05',
      deductionSourceReference: 'Actual synthetic allowed deduction worksheet', deductionAllowanceAndNoDuplicationConfirmed: true } });
    const result = calculateForm6251BondSources([actual], [dividend()], 2026, 'single');
    expect(result.privateActivityBondInterest.toFixed()).toBe('140.25');
    expect(actual.taxExemptInterest).toBe('500.25');
    expect(result.lines.find(line => line.line === 'total')?.value.toFixed()).toBe('140.25');
    const floored = interest({ privateActivityBondFacts: { ...actual.privateActivityBondFacts, otherwiseAllowableDeduction: '200' } });
    expect(calculateForm6251BondSources([floored], [], 2026, 'single').privateActivityBondInterest.toFixed()).toBe('0');
    expect(calculateForm6251BondSources([], [], 2025, 'single').privateActivityBondInterest.toFixed()).toBe('0');
    expect(calculateForm6251BondSources([interest({ privateActivityBondInterest: '0', privateActivityBondFacts: undefined })], [], 2026, 'single').privateActivityBondInterest.toFixed()).toBe('0');
  });

  it('rejects unknown conflicting duplicate and stale parent preference sources', () => {
    const base = interest();
    for (const change of [
      { privateActivityBondInterest: undefined }, { privateActivityBondInterest: '-1' }, { privateActivityBondInterest: '501' },
      { privateActivityBondFacts: undefined }, { accountHolder: undefined }, { accountHolder: 'spouse' },
      { privateActivityBondFacts: { ...facts('parent-int'), taxYear: 2025 } },
      { privateActivityBondFacts: { ...facts('parent-int'), sourceId: '' } },
      { privateActivityBondFacts: { ...facts('parent-int'), recipientAmountsConfirmed: false } },
      { privateActivityBondFacts: { ...facts('parent-int'), otherwiseAllowableDeduction: undefined } },
      { privateActivityBondFacts: { ...facts('parent-int'), otherwiseAllowableDeduction: '1' } },
    ]) expect(() => calculateForm6251BondSources([{ ...base, ...change } as typeof base], [], 2026, 'single')).toThrow();
    expect(() => calculateForm6251BondSources([base, base], [], 2026, 'single')).toThrow(/duplicate/i);
    expect(() => calculateForm6251BondSources([base], [dividend({ privateActivityBondFacts: facts('parent-int') })], 2026, 'single')).toThrow(/duplicate/i);
    expect(() => calculateForm6251BondSources([base], [], 2026, 'single', ['parent-int'])).toThrow(/duplicate/i);
    expect(() => calculateForm6251BondSources([], [], 2027, 'single')).toThrow(/year/i);
    expect(calculateForm6251BondSources([interest({ accountHolder: 'spouse' })], [], 2026, 'married_filing_jointly').privateActivityBondInterest.toFixed()).toBe('125.1');
  });

  it('keeps parent preference invariant when actual amounts are split across statements', () => {
    const source = (sourceId: string, preference: string, deduction: string) => interest({
      privateActivityBondInterest: preference,
      privateActivityBondFacts: { ...facts(sourceId), otherwiseAllowableDeduction: deduction,
        deductionSourceReference: 'Actual otherwise-allowable parent deduction worksheet',
        deductionAllowanceAndNoDuplicationConfirmed: true },
    });
    const split = [source('first', '100', '200'), source('second', '100', '0')];
    const combined = [source('combined', '200', '200')];
    expect(calculateForm6251BondSources(split, [], 2026, 'single').privateActivityBondInterest.toFixed()).toBe('0');
    expect(calculateForm6251BondSources(combined, [], 2026, 'single').privateActivityBondInterest.toFixed()).toBe('0');
    expect(calculateForm6251BondSources([source('first', '100', '200')], [dividend({
      specifiedPrivateActivityBondInterest: '100',
    })], 2026, 'single').privateActivityBondInterest.toFixed()).toBe('0');
    expect(calculateForm6251BondSources([source('first', '100', '200')], [], 2026, 'single', [], '150')
      .privateActivityBondInterest.toFixed()).toBe('50');
    expect(calculateForm6251BondSources([], [], 2026, 'single', [], '150').privateActivityBondInterest.toFixed()).toBe('150');
  });
});
