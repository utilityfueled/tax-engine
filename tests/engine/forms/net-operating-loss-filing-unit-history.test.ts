import { describe, expect, it } from 'vitest';
import { calculateNetOperatingLoss } from '@/engine/forms/net-operating-loss';
import { TaxYearInputSchema } from '@/models/inputs';
import { changedNolSourceFixture, recurrentNolSourceFixture } from '../../fixtures/net-operating-loss-filing-unit';

type Fixture = ReturnType<typeof changedNolSourceFixture>;
function calculate(input: Fixture) {
  return calculateNetOperatingLoss({ taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus,
    taxpayer: input.taxpayer, facts: input.netOperatingLoss });
}

describe('actual changed NOL ownership', () => {
  // Spec: net-operating-loss-filing-unit-history.yaml original-joint-allocation
  it('derives the published original joint allocation without inheriting the other owner loss', () => {
    const input = changedNolSourceFixture(), before = structuredClone(input);
    const result = calculate(input);
    expect(result.availableCarryforward.toString()).toBe('1875');
    expect(result.vintages[0]!.originalLoss.toString()).toBe('1875');
    expect(result.deduction).toBeUndefined();
    expect(input).toEqual(before);
    input.netOperatingLoss.vintages[0]!.originalLoss = '3125';
    input.netOperatingLoss.vintages[0]!.openingCarryforward = '3125';
    expect(() => calculate(input)).toThrow(/original.*allocation|owner/i);
  });
  // Spec: net-operating-loss-filing-unit-history.yaml recurrent-owner-use
  it('preserves filed owner allocations through recurrent and new-spouse returns', () => {
    const input = recurrentNolSourceFixture(), result = calculate(input);
    expect(result.availableCarryforward.toString()).toBe('48000');
    expect(result.lines.some(row => row.form === 'Section172 Filing Unit History')).toBe(true);
    const reordered = structuredClone(input);
    reordered.netOperatingLoss.filingUnitHistory.persons.reverse();
    reordered.netOperatingLoss.filingUnitHistory.returns.reverse();
    reordered.netOperatingLoss.vintages[0]!.filingUnitOrigin.separateComputations.reverse();
    reordered.netOperatingLoss.vintages[0]!.history.reverse();
    for (const year of reordered.netOperatingLoss.vintages[0]!.history) {
      year.filingUnitUses.reverse(); for (const use of year.filingUnitUses) use.owners.reverse();
    }
    expect(calculate(reordered).availableCarryforward.toString()).toBe('48000');
    input.netOperatingLoss.vintages[0]!.openingCarryforward = '43800';
    expect(() => calculate(input)).toThrow(/reconcile|owner/i);
  });
  // Spec: net-operating-loss-filing-unit-history.yaml claim-versus-absorption
  it('uses actual modified absorption and attribute reductions without substituting the deduction', () => {
    const input = changedNolSourceFixture(), row = input.netOperatingLoss.vintages[0]!;
    row.history[0]!.nolUsed = '1500'; row.history[0]!.attributeReduction = '200'; row.openingCarryforward = '175';
    const use = row.history[0]!.filingUnitUses[0]!;
    use.claimedDeduction = '1000'; use.modifiedAbsorption = '1500'; use.attributeReduction = '200';
    Object.assign(use.owners[0]!, { claimedDeduction: '1000', modifiedAbsorption: '1500', attributeReduction: '200' });
    expect(calculate(input).availableCarryforward.toString()).toBe('175');
    row.history[0]!.nolUsed = '1000'; row.openingCarryforward = '675';
    expect(() => calculate(input)).toThrow(/absorption|reconcile/i);
  });
  // Spec: net-operating-loss-filing-unit-history.yaml actual-timeline
  it('requires complete source ownership and rejects changed or contradictory filed records', () => {
    const original = changedNolSourceFixture();
    const changes: Array<(input: Fixture) => void> = [
      input => { input.netOperatingLoss.filingUnitHistory.sourceFactsConfirmed = false; },
      input => { input.netOperatingLoss.filingUnitHistory.returns.splice(1, 1); },
      input => { input.netOperatingLoss.vintages[0]!.history.splice(0, 1); },
      input => { input.netOperatingLoss.vintages[0]!.history[0]!.filingUnitUses[0]!.owners[0]!.personId = 'riley'; },
      input => { input.netOperatingLoss.vintages[0]!.history[0]!.filingUnitUses[0]!.claimedDeduction = '1'; },
      input => { input.netOperatingLoss.vintages[0]!.history[0]!.filingUnitUses[0]!.sourceFactsConfirmed = false; },
      input => { input.netOperatingLoss.filingUnitHistory.persons[0]!.taxpayerIdLast4 = '0000'; },
      input => { input.netOperatingLoss.vintages[0]!.history[0]!.taxYear = 2025; },
    ];
    for (const change of changes) { const altered = structuredClone(original); change(altered); expect(() => calculate(altered)).toThrow(); }
    expect(calculate(original).availableCarryforward.toString()).toBe('1875');
  });
  // Spec: net-operating-loss-filing-unit-history.yaml current-joint-boundary
  it('retains the separate current joint method and exact original allocation boundary', () => {
    const input = changedNolSourceFixture();
    input.taxpayer.filingStatus = 'married_filing_jointly';
    expect(() => calculate(input)).toThrow(/current joint|owner.*income|changed.*membership/i);
    const fractional = changedNolSourceFixture();
    fractional.netOperatingLoss.vintages[0]!.filingUnitOrigin.originalReturnLoss = '5001';
    fractional.netOperatingLoss.vintages[0]!.filingUnitOrigin.separateComputations[0]!.netOperatingLoss = '1';
    fractional.netOperatingLoss.vintages[0]!.filingUnitOrigin.separateComputations[1]!.netOperatingLoss = '1';
    fractional.netOperatingLoss.vintages[0]!.originalLoss = '2501'; fractional.netOperatingLoss.vintages[0]!.openingCarryforward = '2501';
    expect(() => calculate(fractional)).toThrow(/exact.*allocation|precision|filed.*allocation/i);
  });
  // Spec: net-operating-loss-filing-unit-history.yaml source-expiry-and-year
  it('keeps original expiry and actual current-year ownership separate from source validation', () => {
    const expired = TaxYearInputSchema.parse(changedNolSourceFixture()), facts = expired.netOperatingLoss!, row = facts.vintages![0]!, timeline = facts.filingUnitHistory!;
    row.lossTaxYear = 2004; row.carrybackTreatment = 'waived'; row.carrybackSourceReference = 'Actual2004 carryback waiver';
    const origin = timeline.returns![0]!; origin.taxYear = 2004;
    timeline.returns = [origin, ...Array.from({ length: 21 }, (_, i) => ({ sourceId: `jane${2005 + i}`, taxYear: 2005 + i,
      filingStatus: 'single' as const, primaryPersonId: 'jane', sourceReference: `Actual filed ${2005 + i}` }))];
    const originalUse = structuredClone(row.history![0]!.filingUnitUses![0]!);
    row.history = Array.from({ length: 20 }, (_, i) => ({ taxYear: 2005 + i, nolUsed: '0', attributeReduction: '0', sourceReference: `Actual carry ${2005 + i}`,
      filingUnitUses: [{ ...structuredClone(originalUse), returnSourceId: `jane${2005 + i}` }] }));
    const result = calculateNetOperatingLoss({ taxYear: 2025, filingStatus: expired.taxpayer.filingStatus, taxpayer: expired.taxpayer, facts });
    expect(result.availableCarryforward.toString()).toBe('0');
    expect(result.vintages[0]!.expiredBeforeYear.toString()).toBe('1875');
    const nextYear = TaxYearInputSchema.parse(changedNolSourceFixture()), next = nextYear.netOperatingLoss!;
    nextYear.taxpayer.taxYear = 2026; next.sourceTaxYear = 2026; next.vintages![0]!.adjustedThroughTaxYear = 2025;
    next.filingUnitHistory!.returns!.push({ sourceId: 'jane2026', taxYear: 2026, filingStatus: 'single', primaryPersonId: 'jane', sourceReference: 'Actual2026 original' });
    next.filingUnitHistory!.currentReturnSourceId = 'jane2026';
    next.vintages![0]!.history!.push({ taxYear: 2025, nolUsed: '0', attributeReduction: '0', sourceReference: 'Actual2025 carry',
      filingUnitUses: [{ ...structuredClone(originalUse), returnSourceId: 'jane2025' }] });
    const current = () => calculateNetOperatingLoss({ taxYear: 2026, filingStatus: nextYear.taxpayer.filingStatus, taxpayer: nextYear.taxpayer,
      standardDeductionFacts: nextYear.standardDeductionFacts, facts: next });
    expect(current().availableCarryforward.toString()).toBe('1875');
    Object.assign(next.filingUnitHistory!.persons![0]!, { deathStatus: 'deceased', deathYear: 2026 });
    expect(current).toThrow(/final separate|deceased/i);
    next.filingUnitHistory!.returns!.at(-1)!.finalReturnForDeceased = true;
    nextYear.standardDeductionFacts = { ...nextYear.standardDeductionFacts, primaryDeathDate: '2026-05-01' };
    expect(current().availableCarryforward.toString()).toBe('1875');
    nextYear.standardDeductionFacts.primaryDeathDate = '2025-05-01';
    expect(current).toThrow(/death/i);
  });
});
