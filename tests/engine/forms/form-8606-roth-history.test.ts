import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateForm8606 } from '@/engine/forms/form-8606.js';
import { Form8606Schema } from '@/models/inputs.js';

// Spec: spec/federal/form-8606-roth-history.yaml. Literal worksheet controls,
// including the IRS's published line25c examples, independent of engine outputs.
const calculate = (source: Record<string, unknown>) => calculateForm8606(Form8606Schema.parse({ yearEndValue: '0', ...source }));

describe('Roth basis history and qualifying repayments', () => {
  it('depletes contribution history using line19 before the homebuyer exclusion', () => {
    const result = calculate({ rothDistributions: '6000', qualifiedFirstTimeHomebuyerExpenses: '2000',
      rothContributionBasisByYear: [
        { year: 2020, contributionAmount: '3000', previouslyWithdrawnTaxFree: '1000' },
        { year: 2022, contributionAmount: '8000', previouslyWithdrawnTaxFree: '0' },
      ] });
    expect(result.line19.toFixed()).toBe('6000');
    expect(result.line21.toFixed()).toBe('4000');
    expect(result.line25c.toFixed()).toBe('0');
    expect(result.rothContributionBasisByYearCarryforward?.map(row => row.basisRemaining.toFixed())).toEqual(['0', '4000']);
    expect(result.rothContributionBasisByYearCarryforward?.map(row => row.previouslyWithdrawnTaxFree.toFixed())).toEqual(['3000', '4000']);
  });

  it('depletes conversion history without changing current homebuyer relief', () => {
    const result = calculate({ rothDistributions: '12000', qualifiedFirstTimeHomebuyerExpenses: '5000',
      rothContributionBasisByYear: [{ year: 2020, contributionAmount: '5000', previouslyWithdrawnTaxFree: '0' }],
      rothConversionBasisByYear: [
        { year: 2021, conversionAmount: '5000', previouslyRecoveredTaxFree: '1000' },
        { year: 2022, conversionAmount: '6000', previouslyRecoveredTaxFree: '0' },
      ] });
    expect(result.line23.toFixed()).toBe('2000');
    expect(result.line25a.toFixed()).toBe('0');
    expect(result.rothContributionBasisByYearCarryforward?.[0].basisRemaining.toFixed()).toBe('0');
    expect(result.rothConversionBasisByYearCarryforward?.map(row => row.basisRemaining.toFixed())).toEqual(['0', '3000']);
    // Even an entirely homebuyer-excluded current distribution uses history.
    const allHomebuyer = calculate({ rothDistributions: '1000', qualifiedFirstTimeHomebuyerExpenses: '1000',
      rothContributionBasisByYear: [{ year: 2020, contributionAmount: '400', previouslyWithdrawnTaxFree: '0' }],
      rothConversionBasisByYear: [{ year: 2021, conversionAmount: '1000', previouslyRecoveredTaxFree: '0' }] });
    expect(allHomebuyer.line21.toFixed()).toBe('0');
    expect(allHomebuyer.rothContributionBasisByYearCarryforward?.[0].basisRemaining.toFixed()).toBe('0');
    expect(allHomebuyer.rothConversionBasisByYearCarryforward?.[0].basisRemaining.toFixed()).toBe('400');
  });

  it('preserves original source cents and excludes rolled-over distributions', () => {
    const source = { rothDistributions: '2001.49', rothRolledOverDistributions: '1000', qualifiedFirstTimeHomebuyerExpenses: '100',
      rothContributionBasisByYear: [{ year: 2020, contributionAmount: '2100.49', previouslyWithdrawnTaxFree: '100' }] };
    const before = structuredClone(source);
    const result = calculate(source);
    const entry = result.rothContributionBasisByYearCarryforward![0];
    expect(result.line19.toFixed()).toBe('1001');
    expect(entry.contributionAmount.toFixed()).toBe('2100.49');
    expect(entry.previouslyWithdrawnTaxFree.toFixed()).toBe('1101');
    expect(entry.basisRemaining.toFixed()).toBe('999.49');
    expect(entry.previouslyWithdrawnTaxFree.plus(entry.basisRemaining).eq(new Decimal('2100.49'))).toBe(true);
    expect(source).toEqual(before);
    const excluded = calculate({ ...source, rothRolledOverDistributions: '2001.49' });
    expect(excluded.rothContributionBasisByYearCarryforward?.[0].basisRemaining.toFixed()).toBe('2000.49');
  });

  it('matches all published Roth repayment examples without a proportional tax cap', () => {
    for (const [basis, eligible, repaid, taxable, adjustment] of [
      ['2500', '5000', '3000', '7000', '0'], // Published example1.
      ['2500', '5000', '5000', '5000', '0'], // Published example2.
      ['2500', '5000', '3000', '7000', '0'], // Example3 amended distribution year.
      ['4500', '12500', '12500', '0', '4500'], // Published example4.
    ]) {
      const result = calculate({ rothDistributions: '12500', rothContributionBasis: basis,
        rothRepaymentEligibleDistributions: eligible, rothRepaymentsWithin3YearWindow: repaid });
      expect(result.line25c.toFixed()).toBe(taxable);
      expect(result.line25cBasisAdjustment.toFixed()).toBe(adjustment);
    }
    const bounded = calculate({ rothDistributions: '15000', rothContributionBasis: '5000',
      rothRepaymentEligibleDistributions: '3000', rothRepaymentsWithin3YearWindow: '4000' });
    expect(bounded.rothRepaymentsWithin3YearWindow.toFixed()).toBe('3000');
    expect(bounded.line25c.toFixed()).toBe('7000');
    expect(bounded.line25cBasisAdjustment.toFixed()).toBe('0');
    const none = calculate({ rothDistributions: '15000', rothContributionBasis: '5000',
      rothRepaymentEligibleDistributions: '0', rothRepaymentsWithin3YearWindow: '4000' });
    expect(none.line25c.toFixed()).toBe('10000');
    expect(none.line25cBasisAdjustment.toFixed()).toBe('0');
  });
});
