import { describe, expect, it } from 'vitest';
import { calculateForm8606 } from '@/engine/forms/form-8606.js';
import { Form8606Schema } from '@/models/inputs.js';

// Independent literal form arithmetic: spec/federal/form-8606-rounding.yaml.
const calculate = (source: Record<string, unknown>) => calculateForm8606(Form8606Schema.parse(source));

describe('Form8606 whole-dollar form amounts', () => {
  it('carries whole-dollar traditional basis and taxable distributions', () => {
    for (const [basis, yearEnd, distribution, carry] of [
      ['1000.49', '2002.49', '1001.49', '667'],
      ['1000.50', '2001.50', '1000.50', '668'],
    ]) {
      const result = calculate({ priorYearBasis: basis, yearEndValue: yearEnd, traditionalDistributions: distribution });
      expect(result.line9.toFixed()).toBe('3003');
      expect(result.line10.toFixed()).toBe('0.333');
      expect(result.line12.toFixed()).toBe('333');
      expect(result.line14.toFixed()).toBe(carry);
      expect(result.taxableTraditionalDistributions.toFixed()).toBe('668');
      expect(result.lines.find(row => row.line === '14')?.value.toFixed()).toBe(carry);
    }
  });

  it('aggregates source cents before rounding each traditional line', () => {
    const source = {
      nondeductibleContributions: '1000.49', qualifiedReservistDistributionRepayments: '0.49',
      priorYearBasis: '0', yearEndValue: '2000.49', outstandingRollovers: '100.49',
      currentYearRepaymentsTreatedAsRollovers: '0.48', traditionalDistributions: '1001.49',
      qualifiedCharitableDistributions: '0.49', rolledOverDistributions: '0.49',
    };
    const before = structuredClone(source);
    const result = calculate(source);
    expect(result.line1.toFixed()).toBe('1001');
    expect(result.line6.toFixed()).toBe('2101');
    expect(result.line7.toFixed()).toBe('1001');
    expect(source).toEqual(before);
  });

  it('rounds each conversion and distribution allocation before adding them', () => {
    const result = calculate({ priorYearBasis: '1002', yearEndValue: '2004', traditionalDistributions: '1002', rothConversions: '1002' });
    expect(result.line10.toFixed()).toBe('0.25');
    expect(result.line11.toFixed()).toBe('251');
    expect(result.line12.toFixed()).toBe('251');
    expect(result.line13.toFixed()).toBe('502');
    expect(result.line14.toFixed()).toBe('500');
    expect(result.taxableTraditionalDistributions.toFixed()).toBe('751');
    expect(result.taxableRothConversions.toFixed()).toBe('751');
  });

  it('rounds disaster and repayment dollar entries without rounding their fractions', () => {
    const ordinary = { priorYearBasis: '1000', yearEndValue: '2002', traditionalDistributions: '1001' };
    const disaster = calculate({ ...ordinary, qualifiedDisasterDistributions: '333.49' });
    expect(disaster.line15a.toFixed()).toBe('668');
    expect(disaster.line15b.toFixed()).toBe('222');
    expect(disaster.line15c.toFixed()).toBe('446');
    const repayment = calculate({ ...ordinary, repaymentEligibleDistributions: '500.49', repaymentWithin3YearWindow: '400.50' });
    expect(repayment.line15cRepaymentEligibleTaxableShare.toFixed()).toBe('334');
    expect(repayment.line15cRepaymentReduction.toFixed()).toBe('334');
    expect(repayment.line15cBasisAdjustment.toFixed()).toBe('67');
    expect(repayment.line15c.toFixed()).toBe('334');
  });

  it('sums Roth basis vintages before rounding the form lines', () => {
    const source = {
      yearEndValue: '0', rothDistributions: '101.49', rothRolledOverDistributions: '0.49',
      qualifiedFirstTimeHomebuyerExpenses: '1.50', rothQualifiedDisasterDistributions: '11',
      rothContributionBasisByYear: [
        { year: 2023, contributionAmount: '40.49', previouslyWithdrawnTaxFree: '0' },
        { year: 2024, contributionAmount: '20.49', previouslyWithdrawnTaxFree: '0' },
      ],
      rothConversionBasisByYear: [
        { year: 2023, conversionAmount: '10.49', previouslyRecoveredTaxFree: '0' },
        { year: 2024, conversionAmount: '10.49', previouslyRecoveredTaxFree: '0' },
      ],
    };
    const result = calculate(source);
    expect(result.line19.toFixed()).toBe('101');
    expect(result.line20.toFixed()).toBe('2');
    expect(result.line21.toFixed()).toBe('99');
    expect(result.line22.toFixed()).toBe('61');
    expect(result.line24.toFixed()).toBe('21');
    expect(result.line25a.toFixed()).toBe('17');
    expect(result.line25b.toFixed()).toBe('2');
    expect(result.line25c.toFixed()).toBe('15');
    expect(result.rothContributionBasisByYearCarryforward?.[0].contributionAmount.toFixed()).toBe('40.49');
    expect(result.rothConversionBasisByYearCarryforward?.[1].conversionAmount.toFixed()).toBe('10.49');
    for (const row of result.lines.filter(row => row.line !== '10')) expect(row.value.isInteger(), row.line).toBe(true);
  });

  it('retains the published line15c repayment examples', () => {
    for (const [paid, reduction, taxable, carry] of [
      ['3000', '3000', '7000', '0'], ['5000', '4000', '6000', '1000'],
    ]) {
      const result = calculate({ priorYearBasis: '2500', yearEndValue: paid, currentYearRepaymentsTreatedAsRollovers: paid,
        traditionalDistributions: '12500', repaymentEligibleDistributions: '5000', repaymentWithin3YearWindow: paid });
      expect(result.line15a.toFixed()).toBe('10000');
      expect(result.line15cRepaymentEligibleTaxableShare.toFixed()).toBe('4000');
      expect(result.line15cRepaymentReduction.toFixed()).toBe(reduction);
      expect(result.line15c.toFixed()).toBe(taxable);
      expect(result.line15cBasisAdjustment.toFixed()).toBe(carry);
    }
  });
});
