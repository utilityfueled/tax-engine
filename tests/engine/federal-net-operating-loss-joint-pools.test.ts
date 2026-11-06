import { describe, expect, it, vi } from 'vitest';
// Isolated 2026 arithmetic only; the actual complete-return readiness gate stays closed.
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { jointNolSourceFixture } from '../fixtures/net-operating-loss-joint-pools';

describe('canonical same-couple joint NOL pools', () => {
  // Spec: net-operating-loss-joint-pools.yaml independent-amt
  it('computes independent regular and alternative joint pools from the original return', () => {
    const input = TaxYearInputSchema.parse(jointNolSourceFixture()), before = structuredClone(input), result = calculateFederalTax(input), nol = result.netOperatingLoss!;
    expect(nol.deduction.toString()).toBe('54800'); expect(nol.carryforward.toString()).toBe('30200');
    expect(result.agi.toString()).toBe('45200'); expect(nol.alternativeTax.deduction.toString()).toBe('20000');
    expect(nol.alternativeTax.carryforward.toString()).toBe('0'); expect(result.form6251!.amti.toString()).toBe('80000');
    expect(nol.vintages).toHaveLength(1); expect(nol.alternativeTax.vintages).toHaveLength(1); expect(input).toEqual(before);
  });
  // Spec: net-operating-loss-joint-pools.yaml fixed-niit-character
  it('preserves determined original investment character and rejects partial differing fractions', () => {
    const raw = jointNolSourceFixture(); raw.netOperatingLoss.vintages[0]!.section1411OriginalLoss = '30000';
    raw.netOperatingLoss.vintages[1]!.section1411OriginalLoss = '20000';
    const result = calculateFederalTax(TaxYearInputSchema.parse(raw)); expect(result.netOperatingLoss!.section1411Deduction.toString()).toBe('27400');
    raw.netOperatingLoss.vintages[1]!.section1411OriginalLoss = '0';
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(raw))).toThrow(/different.*fraction|component.*attribution/i);
    raw.w2s[0]!.wages = '200000'; const full = calculateFederalTax(TaxYearInputSchema.parse(raw));
    expect(full.netOperatingLoss!.deduction.toString()).toBe('85000'); expect(full.netOperatingLoss!.section1411Deduction.toString()).toBe('25000');
    raw.w2s[0]!.wages = '30000'; const none = calculateFederalTax(TaxYearInputSchema.parse(raw));
    expect(none.netOperatingLoss!.deduction.toString()).toBe('0'); expect(none.netOperatingLoss!.section1411Deduction.toString()).toBe('0');
    const half = jointNolSourceFixture(); half.w2s[0]!.wages = '31503';
    for (const [index, original, used] of [[0, '3', '2'], [1, '6', '5']] as const) {
      const source = half.netOperatingLoss.vintages[index]!, history = source.history[0]!, filed = history.filingUnitUses[0]!;
      source.originalLoss = original; source.openingCarryforward = '1'; source.section1411OriginalLoss = '1';
      source.filingUnitOrigin.originalReturnLoss = original; source.filingUnitOrigin.separateComputations[0]!.netOperatingLoss = original;
      history.nolUsed = used; filed.claimedDeduction = used; filed.modifiedAbsorption = used;
      filed.owners[0]!.claimedDeduction = used; filed.owners[0]!.modifiedAbsorption = used;
    }
    const exact = calculateFederalTax(TaxYearInputSchema.parse(half));
    expect(exact.netOperatingLoss!.deduction.toString()).toBe('2'); expect(exact.netOperatingLoss!.section1411Deduction.toString()).toBe('1');
  });
  // Spec: net-operating-loss-joint-pools.yaml independent-identities
  it('keeps actual year and independent history identity boundaries', () => {
    const input = jointNolSourceFixture(); const alt = input.netOperatingLoss.alternativeTax;
    alt.sameCoupleJointHistory.years[0]!.secondPersonId = 'former';
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(input))).toThrow(/same.couple|marital|pair|owner|history/i);
    const next = jointNolSourceFixture(2026); const result = calculateFederalTax(TaxYearInputSchema.parse(next));
    expect(result.netOperatingLoss!.deduction.toString()).toBe('54240'); expect(result.netOperatingLoss!.carryforward.toString()).toBe('30760');
    expect(result.agi.toString()).toBe('45760'); expect(result.form6251!.amti.toString()).toBe('80000');
  });
});
