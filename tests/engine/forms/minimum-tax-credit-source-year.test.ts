// Spec: spec/federal/minimum-tax-credit-source-year.yaml.
import { describe, expect, it } from 'vitest';
import { calculateForm8801, type Form8801SourceYearInput } from '@/engine/forms/form-8801.js';
import { d } from '@/utils/decimal.js';

function source(sourceYear: 2024 | 2025 | 2026 = 2025): Form8801SourceYearInput {
  return {
    sourceYear, sourceFactsConfirmed: true, sourceFactsComplete: true,
    priorYearFilingStatus: 'single', priorYearForm6251Line1And2e: d('200000'),
    priorYearExclusionItemAdjustments: d('10000'), priorYearMinimumTaxCreditNOLDeduction: d('0'),
    priorYearMinimumTaxForeignTaxCredit: d('0'), priorYearForm6251Line10: d('30000'), priorYearAMT: d('5000'),
    priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
  };
}
const calculate = (input: Form8801SourceYearInput) => calculateForm8801(input, { sourceYearOnly: true });

describe('actual minimum-tax-credit source period', () => {
  it('calculates the actual source year without reading future-year inputs', () => {
    const input = source(), before = JSON.stringify(input);
    for (const key of ['taxYear', 'priorYear', 'unusedMinimumTaxCreditCarryforward', 'priorYearUnallowedQualifiedElectricVehicleCredit',
      'currentYearRegularTaxAfterCredits', 'currentYearRegularTaxBeforeCredits', 'currentYearTMT']) {
      Object.defineProperty(input, key, { get() { throw new Error(`Future-year field ${key} must not be read`); } });
    }
    const result = calculate(input);
    expect(result.sourceYear).toBe(2025);
    expect(result.sourceFactsVerified).toBe(true);
    expect(result.exclusionOnlyAMTI.toFixed()).toBe('210000');
    expect(result.exemption.toFixed()).toBe('88100');
    expect(result.amtBaseOnExclusions.toFixed()).toBe('121900');
    expect(result.exclusionOnlyTMT.toFixed()).toBe('31694');
    expect(result.netMinTaxOnExclusionItems.toFixed()).toBe('1694');
    expect(result.minTaxCreditFromSourceYear.toFixed()).toBe('3306');
    for (const key of ['taxYear', 'creditAllowed', 'totalAvailableCredit', 'carryforwardToNextYear', 'currentYearLimitation']) {
      expect(key in result).toBe(false);
    }
    expect(result.lines.some(row => ['19', '20', '21', '22', '23', '24', '25', '26'].includes(row.line))).toBe(false);
    expect(result.lines.every(row => row.form === 'Minimum tax credit source year')).toBe(true);
    expect(result.lines.some(row => /prior.year/i.test(row.description))).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('preserves negative adjustments and actual ancillary worksheet amounts', () => {
    const negative = calculate({ ...source(), priorYearAMT: d('1000') });
    expect(negative.minTaxCreditFromSourceYear.toFixed()).toBe('-694');
    const noActualAMT = calculate({ ...source(), priorYearAMT: d('0') });
    expect(noActualAMT.minTaxCreditFromSourceYear.toFixed()).toBe('-1694');
    const ancillary = calculate({ ...source(), priorYearMinimumTaxCreditNOLDeduction: d('10000'),
      priorYearMinimumTaxForeignTaxCredit: d('500') });
    expect(ancillary.exclusionOnlyAMTI.toFixed()).toBe('200000');
    expect(ancillary.exclusionOnlyTMT.toFixed()).toBe('29094');
    expect(ancillary.tentativeMinimumTaxOnExclusionItems.toFixed()).toBe('28594');
    expect(ancillary.minTaxCreditFromSourceYear.toFixed()).toBe('5000');
  });

  it('uses independent source-year exemptions and phaseout rules', () => {
    for (const [year, exemption, adjustment] of [[2024, '85700', '2682'], [2025, '88100', '3306'], [2026, '90100', '3826']] as const) {
      const result = calculate(source(year));
      expect(result.exemption.toFixed()).toBe(exemption);
      expect(result.minTaxCreditFromSourceYear.toFixed()).toBe(adjustment);
    }
    for (const [income, exemption, tax] of [['500000', '90100', '109882'], ['500002', '90099', '109883']] as const) {
      const result = calculate({ ...source(2026), priorYearForm6251Line1And2e: d(income), priorYearExclusionItemAdjustments: d('0') });
      expect(result.exemption.toFixed()).toBe(exemption);
      expect(result.exclusionOnlyTMT.toFixed()).toBe(tax);
    }
  });

  it('derives the2026 MFS source-period addition and cap without opening filing', () => {
    for (const [income, amti, tax] of [['640200', '640200', '176811'], ['640201', '640202', '176812'], ['780400', '850500', '235695']] as const) {
      const result = calculate({ ...source(2026), priorYearFilingStatus: 'married_filing_separately',
        priorYearForm6251Line1And2e: d(income), priorYearExclusionItemAdjustments: d('0') });
      expect(result.exclusionOnlyAMTI.toFixed()).toBe(amti);
      expect(result.exemption.toFixed()).toBe('0');
      expect(result.exclusionOnlyTMT.toFixed()).toBe(tax);
    }
    const belowHalf = calculate({ ...source(2026), priorYearFilingStatus: 'married_filing_separately',
      priorYearForm6251Line1And2e: d('640200.49'), priorYearExclusionItemAdjustments: d('0') });
    const atHalf = calculate({ ...source(2026), priorYearFilingStatus: 'married_filing_separately',
      priorYearForm6251Line1And2e: d('640200.50'), priorYearExclusionItemAdjustments: d('0') });
    expect(belowHalf.exclusionOnlyAMTI.toFixed()).toBe('640200');
    expect(atHalf.exclusionOnlyAMTI.toFixed()).toBe('640202');
  });

  it('preserves actual capital and foreign worksheet branches', () => {
    const capital = calculate({ ...source(2026), priorYearExclusionItemAdjustments: d('0'),
      priorYearForm6251Line10: d('24000'), priorYearCapitalGainsRequired: true,
      priorYearCapitalGainsWorksheet: { method: 'qualified_dividends', preferentialIncome: d('25000'),
        ordinaryIncomeForZeroRate: d('175000'), ordinaryIncomeForFifteenRate: d('175000') } });
    expect(capital.exclusionOnlyTMT.toFixed()).toBe('25824');
    expect(capital.minTaxCreditFromSourceYear.toFixed()).toBe('3176');
    const foreign = calculate({ ...source(2026), priorYearForm6251Line1And2e: d('300000'),
      priorYearExclusionItemAdjustments: d('0'), priorYearForm6251Line10: d('50000'), priorYearAMT: d('8000'),
      priorYearFiledForm2555: true, priorYearForeignEarnedIncome: { form2555Lines45And50: d('100000'), disallowedDeductions: d('0') } });
    expect(foreign.exclusionOnlyTMT.toFixed()).toBe('55882');
    expect(foreign.minTaxCreditFromSourceYear.toFixed()).toBe('2118');
  });

  it('rejects missing sources and preserves the full-form year boundary', () => {
    for (const key of ['sourceFactsConfirmed', 'sourceFactsComplete', 'priorYearMinimumTaxCreditNOLDeduction',
      'priorYearMinimumTaxForeignTaxCredit', 'priorYearFiledForm2555', 'priorYearCapitalGainsRequired', 'sourceYear']) {
      expect(() => calculate({ ...source(), [key]: undefined } as Form8801SourceYearInput)).toThrow(/source|actual|known|complete|year/i);
    }
    expect(() => calculate({ ...source(), sourceYear: 2027 } as unknown as Form8801SourceYearInput)).toThrow(/source.*year|year.*source/i);
    expect(() => calculate({ ...source(), priorYearCapitalGainsRequired: true })).toThrow(/capital.*source|capital.*worksheet/i);
    expect(() => calculate({ ...source(), priorYearMinimumTaxForeignTaxCredit: d('50000') })).toThrow(/credit.*exceed/i);
    const { sourceYear: _, ...original } = source();
    const full = { ...original, taxYear: 2026, priorYear: 2025, unusedMinimumTaxCreditCarryforward: d('700'),
      priorYearUnallowedQualifiedElectricVehicleCredit: d('0'), currentYearRegularTaxAfterCredits: d('40000'), currentYearTMT: d('25000') };
    const result = calculateForm8801(full);
    expect(result.minTaxCreditFromPriorYear.toFixed()).toBe('3306');
    expect(result.totalAvailableCredit.toFixed()).toBe('4006');
    expect(result.creditAllowed.toFixed()).toBe('4006');
    expect(result.carryforwardToNextYear.toFixed()).toBe('0');
    expect(() => calculateForm8801({ ...full, taxYear: 2027, priorYear: 2026 })).toThrow(/supports.*2025.*2026/i);
  });
});
