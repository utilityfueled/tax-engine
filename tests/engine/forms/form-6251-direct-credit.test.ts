// Spec: spec/federal/foreign-tax-direct-credit.yaml,6251-8-10.
import { describe, expect, it } from 'vitest';
import { calculateForm6251, type Form6251Input } from '@/engine/forms/form-6251.js';
import { calculateForm8801 } from '@/engine/forms/form-8801.js';
import { getConstants } from '@/models/constants.js';
import { d } from '@/utils/decimal.js';

describe('Elected direct foreign credit in AMT', () => {
  it('uses the elected credit in AMT lines eight through eleven', () => {
    const input = { taxableIncome: d('200000'), saltDeduction: d('10000'), regularTax: d('30000'), filingStatus: 'single', isItemizing: true,
      directCreditElectionForeignTaxCredit: d('200') } as Form6251Input;
    const result = calculateForm6251(input, getConstants(2025));
    const line = (id: string) => result.lines.find(row => row.line === id)?.value.toFixed();
    // (210000-88100)*26%=31694. Same actual200 credit reduces both sides.
    expect(line('7')).toBe('31694'); expect(line('8')).toBe('200'); expect(line('9')).toBe('31494');
    expect(line('10')).toBe('29800'); expect(result.amt.toFixed()).toBe('1694');
    const noAmt = calculateForm6251({ ...input, regularTax: d('40000') }, getConstants(2025));
    expect(noAmt.lines.some(row => row.line === '8')).toBe(false);
    expect(noAmt.amt.toFixed()).toBe('0');
    expect(() => calculateForm6251({ ...input, directCreditElectionForeignTaxCredit: d('30001') } as Form6251Input, getConstants(2025))).toThrow(/credit|regular/i);
  });
  it('retains actual net tentative minimum tax for a later minimum tax credit', () => {
    const input = { taxableIncome: d('91946'), saltDeduction: d('0'), regularTax: d('2000'), filingStatus: 'single', isItemizing: true,
      directCreditElectionForeignTaxCredit: d('200'), requiresTentativeMinimumTaxForCredits: true } as Form6251Input;
    const result = calculateForm6251(input, getConstants(2025));
    // (91946-88100)*.26=999.96 ->1000. Statutory TMT is1000-200=800,
    // even though regular tax after the200 credit exceeds line7 and no AMT is due.
    expect(result.lines.find(row => row.line === '7')?.value.toFixed()).toBe('1000');
    expect(result.lines.find(row => row.line === '8')?.value.toFixed()).toBe('200');
    expect(result.tentativeMinimumTax.toFixed()).toBe('800');
    expect(result.amt.toFixed()).toBe('0');
    const credit = calculateForm8801({ taxYear: 2025, priorYearFilingStatus: 'single', priorYearTaxableIncome: d('0'),
      priorYearExclusionItemAdjustments: d('0'), priorYearAMT: d('0'), priorYearRegularTax: d('0'),
      unusedMinimumTaxCreditCarryforward: d('2000'), currentYearRegularTaxAfterCredits: d('1800'), currentYearTMT: result.tentativeMinimumTax });
    expect(credit.creditAllowed.toFixed()).toBe('1000');
  });
});
