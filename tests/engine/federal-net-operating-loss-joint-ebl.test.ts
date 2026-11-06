import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { differentYearJointEblNolSourceFixture, independentJointEblAlternativeFixture,
  jointEblNolSourceFixture, zeroOrdinaryJointEblNolSourceFixture } from '../fixtures/net-operating-loss-joint-ebl';
import { k1QbiLossSourceInput } from '../fixtures/k1-qbi-loss-sources';

describe('actual joint EBL and ordinary source composition', () => {
  // Spec: net-operating-loss-joint-ebl.yaml fully-consumed
  it('composes fully consumed actual EBL and ordinary sources once', () => {
    const input = jointEblNolSourceFixture(), before = structuredClone(input), result = calculateFederalTax(input);
    expect(result.nolDeduction.toString()).toBe('85000'); expect(result.agi.toString()).toBe('115000');
    expect(result.netOperatingLoss!.absorbed.toString()).toBe('85000');
    expect(result.netOperatingLoss!.carryforward.toString()).toBe('0');
    expect(result.netOperatingLoss!.section1411Deduction.toString()).toBe('8750');
    expect(result.qbiEblNol!.currentQualifiedDeduction!.toString()).toBe('25000');
    expect(result.qbiEblNol!.vintages[0]!.qualifiedRemainingCarryforward!.toString()).toBe('0');
    expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('25000');
    expect(result.form8995!.qbiLossCarryforward.toString()).toBe('25000');
    expect(input).toEqual(before);
    const reversed = structuredClone(input); reversed.netOperatingLoss!.vintages!.reverse();
    expect(calculateFederalTax(reversed).netOperatingLoss!.vintages).toEqual(result.netOperatingLoss!.vintages);
    input.priorYear!.excessBusinessLossNOL = '50000';
    expect(calculateFederalTax(input).nolDeduction.toString()).toBe('85000');
    input.priorYear!.excessBusinessLossNOL = '85000';
    expect(() => calculateFederalTax(input)).toThrow(/Legacy EBL.*reconcile/);
    const active = jointEblNolSourceFixture(), k1 = k1QbiLossSourceInput();
    Object.assign(k1.scheduleK1[0]!, { ordinaryIncome: '100000', section199AQBI: '100000' });
    Object.assign(k1.scheduleK1[0]!.form6198!, { ordinaryIncome: '100000', currentYearIncreases: '100000' });
    const actual = k1.qbiLossSources!.activities![0]!; actual.recipientName = 'Jane Doe';
    Object.assign(actual.statement!, { ordinaryIncome: '100000', section199AQBI: '100000' }); actual.atRisk!.currentYearIncreases = '100000';
    active.scheduleK1 = k1.scheduleK1; active.qbiLossSources!.activities = k1.qbiLossSources!.activities;
    active.qbiLossSources!.excessBusinessLossHistories![0]!.materiallyParticipatedInCurrentYear = true;
    active.priorYear = { ...active.priorYear, ...k1.priorYear };
    const positive = calculateFederalTax(active);
    expect(positive.agi.toString()).toBe('215000'); expect(positive.form8995!.qbiDeduction.toString()).toBe('15000');
    expect(positive.carryforwards.qbiLossCarryforward.toString()).toBe('0'); expect(positive.form6251!.amti.toString()).toBe('265000');
  });
  // Spec: net-operating-loss-joint-ebl.yaml single-positive
  it('separates released negative QBI from the qualified EBL still suspended', () => {
    const result = calculateFederalTax(zeroOrdinaryJointEblNolSourceFixture());
    expect(result.nolDeduction.toString()).toBe('14800'); expect(result.agi.toString()).toBe('35200');
    expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('7400');
    expect(result.qbiEblNol!.vintages[0]!.qualifiedRemainingCarryforward!.toString()).toBe('17600');
    const none = calculateFederalTax(jointEblNolSourceFixture('30000'));
    expect(none.nolDeduction.toString()).toBe('0'); expect(none.carryforwards.qbiLossCarryforward.toString()).toBe('0');
    expect(none.qbiEblNol!.vintages[0]!.qualifiedRemainingCarryforward!.toString()).toBe('25000');
  });
  // Spec: net-operating-loss-joint-ebl.yaml year-order
  it('retains determined partial use across different original loss years', () => {
    const input = differentYearJointEblNolSourceFixture(), result = calculateFederalTax(input);
    expect(result.netOperatingLoss!.vintages.map(row => [row.lossTaxYear, row.deduction!.toString(), row.remainingCarryforward!.toString()]))
      .toEqual([[2021, '50000', '0'], [2023, '4800', '30200']]);
    expect(result.agi.toString()).toBe('45200'); expect(result.netOperatingLoss!.section1411Deduction.toString()).toBe('1200');
    expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('25000');
    expect(result.qbiEblNol!.vintages[0]!.qualifiedRemainingCarryforward!.toString()).toBe('0');
    input.netOperatingLoss!.vintages!.reverse();
    expect(calculateFederalTax(input).netOperatingLoss!.vintages).toEqual(result.netOperatingLoss!.vintages);
  });
  // Spec: net-operating-loss-joint-ebl.yaml independent-alternative
  it('resolves independent alternative components from their own actual histories', () => {
    const input = independentJointEblAlternativeFixture(), result = calculateFederalTax(input);
    expect(result.netOperatingLoss!.deduction.toString()).toBe('85000');
    expect(result.netOperatingLoss!.alternativeTax.deduction.toString()).toBe('35000');
    expect(result.netOperatingLoss!.alternativeTax.carryforward.toString()).toBe('0');
    expect(result.form6251!.amti.toString()).toBe('165000');
    expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('25000');
    const partial = independentJointEblAlternativeFixture();
    partial.netOperatingLoss!.vintages = []; partial.qbiLossSources!.excessBusinessLossHistories = [];
    partial.w2s[0]!.wages = '30000';
    expect(() => calculateFederalTax(partial)).toThrow(/same.year.*component|component.*attribution|determined/i);
  });
  // Spec: net-operating-loss-joint-ebl.yaml multiple-qualified-originals
  it('keeps distinct qualified origins stable when their complete year pool is used', () => {
    const input = jointEblNolSourceFixture(), original = input.netOperatingLoss!.vintages![1]!;
    original.originKind = 'excess_business_loss';
    const history = structuredClone(input.qbiLossSources!.excessBusinessLossHistories![0]!);
    Object.assign(history, { nolSourceId: original.sourceId, accountHolder: 'spouse', recipientName: 'Alex Rowe',
      recipientTaxpayerIdLast4: '4321', originalNol: structuredClone(original), originalQualifiedLoss: '10000',
      qualifiedOpeningCarryforward: '8750' });
    history.history![0]!.qualifiedNolAbsorption = '1250';
    input.qbiLossSources!.excessBusinessLossHistories!.push(history);
    const result = calculateFederalTax(input);
    expect(result.qbiEblNol!.currentQualifiedDeduction!.toString()).toBe('33750');
    expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('33750');
    expect(result.qbiEblNol!.vintages.map(row => [row.sourceId, row.qualifiedRemainingCarryforward!.toString()]))
      .toEqual([['alex-loss2021', '0'], ['jane-loss2021', '0']]);
    input.netOperatingLoss!.vintages!.reverse(); input.qbiLossSources!.excessBusinessLossHistories!.reverse();
    expect(calculateFederalTax(input).qbiEblNol!.vintages).toEqual(result.qbiEblNol!.vintages);
  });
});
