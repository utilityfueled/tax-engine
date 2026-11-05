// Spec: spec/state/oh-2026-magi-successor.yaml.
// Uses the existing calculation API for the statutory MAGI regression.
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateOhio2026Baseline, type Ohio2026BaselineInput } from '@/engine/state/oh-2026-baseline.js';

type SuccessorFacts = Ohio2026BaselineInput & {
  qualifyingCapitalGainsAndPayrollDeduction: Decimal | string;
};
const actual = (changes: Partial<SuccessorFacts> = {}): SuccessorFacts => ({
  taxYear: 2026,
  filingStatus: 'single',
  ohioAdjustedGrossIncome: '490000',
  businessIncomeDeduction: '0',
  qualifyingCapitalGainsAndPayrollDeduction: '10000',
  taxableBusinessIncome: '0',
  eligibleExemptions: 1,
  precedingCredits: '0',
  primaryQualifyingIncome: '490000',
  ...changes,
});

describe('Ohio 2026 actual statutory MAGI successor', () => {
  it('uses the actual A34 deduction at the exemption ceiling', () => {
    const facts = actual();
    const original = JSON.stringify(facts);
    const result = calculateOhio2026Baseline(facts);
    expect(result.modifiedAdjustedGrossIncome.toFixed()).toBe('500000');
    expect(result.exemptions.toFixed()).toBe('0');
    // 332 + (490000 - 26050) * .0275 = 13090.625 -> 13091.
    expect(result.taxableNonbusinessIncome.toFixed()).toBe('490000');
    expect(result.nonbusinessTax.toFixed()).toBe('13091');
    expect(result.filingQualified).toBe(false);
    expect(result.calculationStatus).toBe('incomplete');
    expect(JSON.stringify(facts)).toBe(original);
  });

  it('uses the same corrected MAGI for the joint ceiling', () => {
    const result = calculateOhio2026Baseline(actual({
      filingStatus: 'married_filing_jointly', eligibleExemptions: 2,
      primaryQualifyingIncome: '245000', spouseQualifyingIncome: '245000',
    }));
    expect(result.modifiedAdjustedGrossIncome.toFixed()).toBe('500000');
    expect(result.exemptions.toFixed()).toBe('0');
    expect(result.totalTax.toFixed()).toBe('13091');
    expect(result.jointFilingCredit.toFixed()).toBe('0');
    expect(result.taxAfterJointCredit.toFixed()).toBe('13091');
  });

  it('uses MAGI only for the exemption tier and preserves OhioAGI', () => {
    const result = calculateOhio2026Baseline(actual({
      ohioAdjustedGrossIncome: '39000',
      qualifyingCapitalGainsAndPayrollDeduction: '2000',
    }));
    expect(result.modifiedAdjustedGrossIncome.toFixed()).toBe('41000');
    expect(result.exemptionPerPerson.toFixed()).toBe('2150');
    expect(result.taxableNonbusinessIncome.toFixed()).toBe('36850');
    // 332 + (36850 - 26050) * .0275 = 629 exactly.
    expect(result.nonbusinessTax.toFixed()).toBe('629');
  });

  it('requires the completed actual A34 amount including explicit zero', () => {
    const result = calculateOhio2026Baseline(actual({ qualifyingCapitalGainsAndPayrollDeduction: '0' }));
    expect(result.modifiedAdjustedGrossIncome.toFixed()).toBe('490000');
    expect(result.exemptions.toFixed()).toBe('1900');
    expect(result.nonbusinessTax.toFixed()).toBe('13038');
    for (const missingOrInvalid of [undefined, null, 0, '', 'NaN', 'Infinity', '-1']) {
      expect(() => calculateOhio2026Baseline({
        ...actual(), qualifyingCapitalGainsAndPayrollDeduction: missingOrInvalid,
      } as unknown as SuccessorFacts)).toThrow();
    }
    const { qualifyingCapitalGainsAndPayrollDeduction: _amount, ...unknown } = actual();
    expect(() => calculateOhio2026Baseline(unknown as SuccessorFacts)).toThrow();
    expect(calculateOhio2026Baseline(actual({
      qualifyingCapitalGainsAndPayrollDeduction: new Decimal('10000'),
    })).modifiedAdjustedGrossIncome.toFixed()).toBe('500000');
  });
});
