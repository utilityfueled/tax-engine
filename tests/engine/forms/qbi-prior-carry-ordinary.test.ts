import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { calculateQbiPriorCarrySources } from '@/engine/forms/qbi-prior-carry-sources';
import { TaxYearInputSchema } from '@/models/inputs';
import { ordinaryPriorQbiFixture, ordinaryPriorQbiRecord } from '../../fixtures/prior-qbi-ordinary';
import { jointEblNolSourceFixture } from '../../fixtures/net-operating-loss-joint-ebl';

describe('ordinary prior QBI from actual same-unit sources', () => {
  // Spec: qbi-prior-carry-sources.yaml direct-source
  it('requires actual ordinary carry for complete K1 sources without inventing zero', () => {
    const missing = ordinaryPriorQbiFixture(); delete missing.qbiLossSources!.priorQbiCarry;
    expect(() => calculateFederalTax(missing)).toThrow(/ordinary.*carry|prior.*QBI/i);
    const zeroCurrent = ordinaryPriorQbiFixture('0'); delete zeroCurrent.qbiLossSources!.priorQbiCarry;
    expect(() => calculateFederalTax(zeroCurrent)).toThrow(/ordinary.*carry|prior.*QBI/i);
    const absentAmount = ordinaryPriorQbiFixture(); delete absentAmount.qbiLossSources!.priorQbiCarry!.lossCarryforward;
    expect(() => calculateFederalTax(absentAmount)).toThrow(/ordinary.*carry|prior.*QBI/i);
  });
  // Spec: qbi-prior-carry-sources.yaml positive-negative-zero
  it('combines recorded ordinary carries with positive negative and zero current QBI', () => {
    const input = ordinaryPriorQbiFixture(), before = structuredClone(input);
    const positive = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(positive.agi.toFixed()).toBe('200000'); expect(positive.form8995!.qbiDeduction.toFixed()).toBe('18600');
    expect(positive.carryforwards.qbiLossCarryforward.toFixed()).toBe('0'); expect(input).toEqual(before);
    expect(calculateFederalTax(ordinaryPriorQbiFixture('100000', '0')).form8995!.qbiDeduction.toFixed()).toBe('20000');
    const negative = calculateFederalTax(ordinaryPriorQbiFixture('-5000'));
    expect(negative.carryforwards.qbiLossCarryforward.toFixed()).toBe('12000');
    expect(negative.carryforwards.qbiSuspendedLosses).toEqual([]);
    const zero = calculateFederalTax(ordinaryPriorQbiFixture('0'));
    expect(zero.carryforwards.qbiLossCarryforward.toFixed()).toBe('7000');
  });
  // Spec: qbi-prior-carry-sources.yaml actual-owner
  it('binds original status people and year without allocating a different filing unit', () => {
    const reversed = ordinaryPriorQbiFixture(), record = reversed.qbiLossSources!.priorQbiCarry!;
    [record.primaryName, record.spouseName] = [record.spouseName, record.primaryName];
    [record.primaryTaxpayerIdLast4, record.spouseTaxpayerIdLast4] = [record.spouseTaxpayerIdLast4, record.primaryTaxpayerIdLast4];
    expect(calculateQbiPriorCarrySources(reversed)?.qbiLossCarryforward).toBe('7000');
    for (const patch of [{ sourceTaxYear: 2023 }, { sourceFactsConfirmed: false }, { primaryName: 'Other Owner' },
      { spouseName: 'Jane Doe', spouseTaxpayerIdLast4: '6789' },
      { sameFilingUnit: { priorFilingStatus: 'married_filing_jointly', sameTaxpayersConfirmed: false } },
      { sameFilingUnit: { sameTaxpayersConfirmed: true } },
      { sameFilingUnit: { priorFilingStatus: 'single', sameTaxpayersConfirmed: true } }]) {
      const input = ordinaryPriorQbiFixture(); Object.assign(input.qbiLossSources!.priorQbiCarry!, patch);
      expect(() => calculateQbiPriorCarrySources(input)).toThrow(/prior.*QBI|ordinary.*carry/i);
    }
    const individual = ordinaryPriorQbiFixture(); individual.taxpayer.filingStatus = 'head_of_household'; individual.taxpayer.spouse = undefined;
    individual.qbiLossSources!.priorQbiCarry = ordinaryPriorQbiRecord(individual);
    Object.assign(individual.qbiLossSources!.priorQbiCarry!, { sameFilingUnit: { priorFilingStatus: 'single', sameTaxpayersConfirmed: true } });
    expect(calculateQbiPriorCarrySources(individual)?.qbiLossCarryforward).toBe('7000');
    Object.assign(individual.qbiLossSources!.priorQbiCarry!, { sameFilingUnit: { priorFilingStatus: 'married_filing_jointly', sameTaxpayersConfirmed: true } });
    expect(() => calculateQbiPriorCarrySources(individual)).toThrow(/prior.*QBI|ordinary.*carry/i);
  });
  // Spec: qbi-prior-carry-sources.yaml known-timeline
  it('reconciles supplied NOL identities while preserving the existing timeline route', () => {
    const legacy = jointEblNolSourceFixture(); expect(calculateQbiPriorCarrySources(legacy)?.qbiLossCarryforward).toBe('0');
    const direct = jointEblNolSourceFixture();
    Object.assign(direct.qbiLossSources!.priorQbiCarry!, { sameFilingUnit: { priorFilingStatus: 'married_filing_jointly', sameTaxpayersConfirmed: true } });
    expect(calculateQbiPriorCarrySources(direct)?.qbiLossCarryforward).toBe('0');
    const independentIds = structuredClone(direct), alternative = independentIds.netOperatingLoss!.alternativeTax!.filingUnitHistory!;
    alternative.persons!.forEach(person => { person.sourceId = `alt-${person.sourceId}`; });
    alternative.returns!.forEach(row => { row.sourceId = `alt-${row.sourceId}`; row.primaryPersonId = `alt-${row.primaryPersonId}`;
      if (row.spousePersonId) row.spousePersonId = `alt-${row.spousePersonId}`; });
    alternative.currentReturnSourceId = `alt-${alternative.currentReturnSourceId}`;
    expect(calculateQbiPriorCarrySources(independentIds)?.qbiLossCarryforward).toBe('0');
    const wrongPrior = structuredClone(direct);
    wrongPrior.netOperatingLoss!.alternativeTax!.filingUnitHistory!.returns!.find(row => row.sourceId === 'joint2024')!.spousePersonId = 'jane';
    expect(() => calculateQbiPriorCarrySources(wrongPrior)).toThrow(/filing|identity|prior|joint/i);
    const otherId = structuredClone(direct); otherId.qbiLossSources!.priorQbiCarry!.returnSourceId = 'another-original';
    expect(() => calculateQbiPriorCarrySources(otherId)).toThrow(/prior.*QBI|ordinary.*carry/i);
  });
  // Spec: qbi-prior-carry-sources.yaml active-presence
  it('keeps active character unknown until its separate source is recorded', () => {
    const input = ordinaryPriorQbiFixture(); expect(calculateQbiPriorCarrySources(input)?.activeQbiLossCarryforward).toBeUndefined();
    Object.assign(input.qbiLossSources!.priorQbiCarry!, { activeLossCarryforward: '0', activeSourceReference: 'Actual ordinary active-character ledger' });
    input.priorYear!.activeQbiLossCarryforward = '0';
    expect(calculateQbiPriorCarrySources(input)?.activeQbiLossCarryforward).toBe('0');
    for (const patch of [{ activeLossCarryforward: '7001' }, { activeLossCarryforward: undefined },
      { activeSourceReference: undefined }, { activeLossCarryforward: '0.5' }]) {
      const invalid = structuredClone(input); Object.assign(invalid.qbiLossSources!.priorQbiCarry!, patch);
      expect(() => calculateQbiPriorCarrySources(invalid)).toThrow(/prior.*QBI|ordinary.*carry/i);
    }
  });
  // Spec: qbi-prior-carry-sources.yaml legacy-boundary
  it('preserves legacy raw inputs while validating deliberately supplied records', () => {
    const legacy = ordinaryPriorQbiFixture(); delete legacy.qbiLossSources; delete legacy.priorYear!.suspendedPassiveLosses;
    expect(calculateFederalTax(legacy).form8995!.qbiDeduction.toFixed()).toBe('18600');
    const standalone = ordinaryPriorQbiFixture(); standalone.scheduleK1 = []; standalone.qbiLossSources!.activities = []; delete standalone.priorYear!.suspendedPassiveLosses; delete standalone.qbiLossSources!.form461Classification;
    expect(calculateFederalTax(standalone).carryforwards.qbiLossCarryforward.toFixed()).toBe('7000');
    standalone.qbiLossSources!.priorQbiCarry!.sourceFactsConfirmed = false;
    expect(() => calculateFederalTax(standalone)).toThrow(/prior.*QBI|ordinary.*carry/i);
  });
});
