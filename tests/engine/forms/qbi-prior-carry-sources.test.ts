import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { jointEblNolSourceFixture } from '../../fixtures/net-operating-loss-joint-ebl';
import { k1QbiLossSourceInput } from '../../fixtures/k1-qbi-loss-sources';

function actualPrior(input = jointEblNolSourceFixture(), amount = '0') {
  const nol = input.netOperatingLoss!;
  return { sourceTaxYear: 2024, sourceReference: 'Actual filed2024 ordinary QBI carry', sourceFactsConfirmed: true,
    returnSourceId: 'joint2024', formKind: 'form_8995_line_16',
    primaryName: nol.primaryName, primaryTaxpayerIdLast4: nol.primaryTaxpayerIdLast4,
    spouseName: nol.spouseName, spouseTaxpayerIdLast4: nol.spouseTaxpayerIdLast4,
    lossCarryforward: amount };
}
function attach(input = jointEblNolSourceFixture(), amount = '0') {
  Object.assign(input.qbiLossSources!, { priorQbiCarry: actualPrior(input, amount) });
  input.priorYear!.qbiLossCarryforward = amount;
  delete input.priorYear!.activeQbiLossCarryforward;
  return input;
}

describe('actual ordinary prior QBI source within joint EBL composition', () => {
  // Spec: net-operating-loss-joint-ebl.yaml ordinary-prior-source
  it('requires an actual ordinary prior carry separately from EBL suspension', () => {
    const absent = jointEblNolSourceFixture();
    Object.assign(absent.qbiLossSources!, { priorQbiCarry: undefined });
    expect(() => calculateFederalTax(absent)).toThrow(/prior.*QBI|ordinary.*carry/i);
    const missingLegacy = attach(); missingLegacy.priorYear = undefined;
    expect(() => calculateFederalTax(missingLegacy)).toThrow(/prior.*QBI|ordinary.*carry/i);
  });
  // Spec: net-operating-loss-joint-ebl.yaml ordinary-prior-amounts
  it('composes recorded zero and positive prior ordinary carries independently', () => {
    const zero = calculateFederalTax(attach()), positive = calculateFederalTax(attach(undefined, '7000'));
    expect(zero.carryforwards.qbiLossCarryforward.toFixed()).toBe('25000');
    expect(positive.carryforwards.qbiLossCarryforward.toFixed()).toBe('32000');
    expect(positive.qbiEblNol!.currentQualifiedDeduction!.toFixed()).toBe('25000');
    expect(positive.qbiEblNol!.vintages[0]!.qualifiedRemainingCarryforward!.toFixed()).toBe('0');
    expect(positive.nolDeduction.toFixed()).toBe('85000');
    expect(positive.netOperatingLoss!.alternativeTax.deduction.toFixed()).toBe('20000');
    const unused = calculateFederalTax(attach(jointEblNolSourceFixture('30000'), '7000'));
    expect(unused.carryforwards.qbiLossCarryforward.toFixed()).toBe('7000');
    expect(unused.qbiEblNol!.vintages[0]!.qualifiedRemainingCarryforward!.toFixed()).toBe('25000');
    const input = attach(undefined, '7000'), k1 = k1QbiLossSourceInput();
    Object.assign(k1.scheduleK1[0]!, { ordinaryIncome: '100000', section199AQBI: '100000' });
    Object.assign(k1.scheduleK1[0]!.form6198!, { ordinaryIncome: '100000', currentYearIncreases: '100000' });
    const activity = k1.qbiLossSources!.activities![0]!; activity.recipientName = 'Jane Doe';
    Object.assign(activity.statement!, { ordinaryIncome: '100000', section199AQBI: '100000' }); activity.atRisk!.currentYearIncreases = '100000';
    input.scheduleK1 = k1.scheduleK1; input.qbiLossSources!.activities = k1.qbiLossSources!.activities;
    input.qbiLossSources!.excessBusinessLossHistories![0]!.materiallyParticipatedInCurrentYear = true;
    input.priorYear = { ...input.priorYear!, suspendedPassiveLosses: k1.priorYear!.suspendedPassiveLosses };
    const current = calculateFederalTax(input);
    expect(current.form8995!.qbiDeduction.toFixed()).toBe('13600');
    expect(current.agi.toFixed()).toBe('215000'); expect(current.form6251!.amti.toFixed()).toBe('266400');
  });
  // Spec: net-operating-loss-joint-ebl.yaml ordinary-prior-identity
  it('rejects conflicting original return facts and legacy carry values', () => {
    for (const patch of [{ sourceTaxYear: 2023 }, { sourceFactsConfirmed: false }, { returnSourceId: 'joint2022' },
      { primaryTaxpayerIdLast4: '0000' }, { spouseName: 'Another owner' }, { lossCarryforward: undefined },
      { lossCarryforward: '-1' }, { lossCarryforward: '7000' },
      { formKind: 'completed_prior_return_no_carry', lossCarryforward: '7000' },
      { activeLossCarryforward: '1', activeSourceReference: 'Actual active record' }]) {
      const input = attach(); Object.assign(input.qbiLossSources!, { priorQbiCarry: { ...actualPrior(input), ...patch } });
      expect(() => calculateFederalTax(input)).toThrow(/prior.*QBI|ordinary.*carry/i);
    }
  });
  // Spec: net-operating-loss-joint-ebl.yaml ordinary-prior-presence
  it('preserves absent prior ordinary carry when parsing canonical input', () => {
    const input = jointEblNolSourceFixture(); delete input.priorYear!.qbiLossCarryforward;
    expect(TaxYearInputSchema.parse(input).priorYear!.qbiLossCarryforward).toBeUndefined();
  });
  // Spec: net-operating-loss-joint-ebl.yaml ordinary-prior-unit
  it('preserves prior spouse order and actual source form without allocating a changed couple', () => {
    const input = attach(undefined, '7000'), record = input.qbiLossSources!.priorQbiCarry!;
    record.formKind = 'form_8995a_schedule_c_line_6';
    for (const timeline of [input.netOperatingLoss!.filingUnitHistory!, input.netOperatingLoss!.alternativeTax!.filingUnitHistory!]) {
      const prior = timeline.returns!.find(row => row.sourceId === 'joint2024')!;
      [prior.primaryPersonId, prior.spousePersonId] = [prior.spousePersonId, prior.primaryPersonId];
    }
    [record.primaryName, record.spouseName] = [record.spouseName, record.primaryName];
    [record.primaryTaxpayerIdLast4, record.spouseTaxpayerIdLast4] = [record.spouseTaxpayerIdLast4, record.primaryTaxpayerIdLast4];
    const before = structuredClone(input);
    expect(calculateFederalTax(input).carryforwards.qbiLossCarryforward.toFixed()).toBe('32000');
    expect(input).toEqual(before); expect(input.priorYear!.activeQbiLossCarryforward).toBeUndefined();
    const zero = attach(); zero.qbiLossSources!.priorQbiCarry!.formKind = 'completed_prior_return_no_carry';
    expect(calculateFederalTax(zero).carryforwards.qbiLossCarryforward.toFixed()).toBe('25000');
    const other = attach(undefined, '7000'), timeline = other.netOperatingLoss!.filingUnitHistory!;
    timeline.persons!.push({ sourceId: 'former', name: 'Former Owner', taxpayerIdLast4: '1234', deathStatus: 'alive_through_return_year' });
    timeline.returns!.find(row => row.sourceId === 'joint2024')!.spousePersonId = 'former';
    Object.assign(other.qbiLossSources!.priorQbiCarry!, { spouseName: 'Former Owner', spouseTaxpayerIdLast4: '1234' });
    expect(() => calculateFederalTax(other)).toThrow(/prior.*QBI|same.*couple/i);
  });
});
