import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { changedNolReturnFixture, changedNolSourceFixture } from '../fixtures/net-operating-loss-filing-unit';

describe('canonical changed NOL ownership', () => {
  // Spec: net-operating-loss-filing-unit-history.yaml independent-amt
  it('computes the current separate return from independent regular and AMT owner histories', () => {
    const input = TaxYearInputSchema.parse(changedNolReturnFixture()), before = structuredClone(input);
    const result = calculateFederalTax(input), nol = result.netOperatingLoss!;
    expect(nol.deduction.toString()).toBe('27400');
    expect(nol.carryforward.toString()).toBe('20600');
    expect(result.agi.toString()).toBe('22600');
    expect(nol.alternativeTax.deduction.toString()).toBe('20000');
    expect(nol.alternativeTax.carryforward.toString()).toBe('0');
    expect(result.form6251!.amti.toString()).toBe('30000');
    expect(input).toEqual(before);
  });
  // Spec: net-operating-loss-filing-unit-history.yaml independent-amt
  it('requires independent AMT timeline evidence and reconciles common historical identities', () => {
    const input = TaxYearInputSchema.parse(changedNolReturnFixture());
    delete input.netOperatingLoss!.alternativeTax!.filingUnitHistory;
    expect(() => calculateFederalTax(input)).toThrow(/history|timeline/i);
    const conflict = TaxYearInputSchema.parse(changedNolReturnFixture());
    Object.assign(conflict.netOperatingLoss!.alternativeTax!.filingUnitHistory!.persons![1]!, { deathStatus: 'deceased', deathYear: 2025 });
    expect(() => calculateFederalTax(conflict)).toThrow(/conflict|independent.*identit|death/i);
  });
  // Spec: net-operating-loss-filing-unit-history.yaml original-joint-allocation
  it('preserves an actual zero owner allocation without inheriting the other spouse loss', () => {
    const input = TaxYearInputSchema.parse(changedNolSourceFixture()), row = input.netOperatingLoss!.vintages![0]!;
    row.filingUnitOrigin!.separateComputations![0]!.netOperatingLoss = '0';
    row.originalLoss = '0'; row.openingCarryforward = '0';
    const result = calculateFederalTax(input);
    expect(result.netOperatingLoss!.deduction.toString()).toBe('0');
    expect(result.netOperatingLoss!.section1411Deduction.toString()).toBe('0');
    expect(result.agi.toString()).toBe('50000');
  });
});
