// Spec: spec/federal/form-8960.yaml; final2025 Form8960 lines1-17.
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateForm8960 } from '@/engine/forms/form-8960.js';
import { getConstants } from '@/models/constants.js';
const d = (value: string) => new Decimal(value);
describe('Form8960 official lines', () => {
  it('records the official individual lines without reassigning their meanings', () => {
    const result = calculateForm8960({
taxableInterest: d('10000'), ordinaryDividends: d('2000'), netCapitalGain: d('-3000'),
      annuityIncome: d('400'), tradeOrBusinessIncome: d('15000'), nonInvestmentBusinessAdjustment: d('-10000'),
      excludedDispositionAdjustment: d('1000'), passthroughDispositionAdjustment: d('-200'),
      cfcPficInvestmentAdjustment: d('300'), otherModifications: d('-100'), investmentInterestExpense: d('1000'),
      investmentIncomeTaxes: d('400'), miscellaneousInvestmentExpenses: d('0'), additionalModifications: d('600'), magi: d('240000')
}, 'single', getConstants(2025));
    const expected: Record<string, string> = { '1': '10000', '2': '2000', '3': '400', '4a': '15000', '4b': '-10000', '4c': '5000', '5a': '-3000', '5b': '1000', '5c': '-200', '5d': '-2200', '6': '300', '7': '-100', '8': '15400', '9a': '1000', '9b': '400', '9c': '0', '9d': '1400', '10': '600', '11': '2000', '12': '13400', '13': '240000', '14': '200000', '15': '40000', '16': '13400', '17': '509' };
    for (const [line, value] of Object.entries(expected)) expect(result.lines.filter(x => x.form === 'Form 8960' && x.line === line).map(x => x.value.toString())).toEqual([value]);
    expect(result.magi.toString()).toBe('240000');
    expect(result.requiresForm8960).toBe(true);
  });
  it('preserves signed totals and refuses invalid or contradictory expense inputs', () => {
    const input = { taxableInterest: d('1000'), ordinaryDividends: d('0'), netCapitalGain: d('-3000'), magi: d('190000') };
    const result = calculateForm8960(input, 'single', getConstants(2025));
    expect(result.grossInvestmentIncome.toString()).toBe('-2000');
    expect(result.netInvestmentIncome.toString()).toBe('0');
    expect(result.magi.toString()).toBe('190000');
    expect(result.requiresForm8960).toBe(false);
    expect(() => calculateForm8960({ ...input, magi: d('NaN') }, 'single', getConstants(2025))).toThrow(/finite/);
    expect(() => calculateForm8960({ ...input, investmentInterestExpense: d('100'), investmentExpenses: d('10') }, 'single', getConstants(2025))).toThrow(/reconcile/);
  });
});
