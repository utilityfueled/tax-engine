import { describe, expect, it } from 'vitest';
import { calculateNetOperatingLoss, type NetOperatingLossContext } from '@/engine/forms/net-operating-loss';
import { d } from '@/utils/decimal';
import { jointNolSourceFixture, recurrentJointNolSourceFixture } from '../../fixtures/net-operating-loss-joint-pools';

type Input = ReturnType<typeof jointNolSourceFixture>;
function calculate(input: Input, context?: NetOperatingLossContext) {
  return calculateNetOperatingLoss({ taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus,
    taxpayer: input.taxpayer, facts: input.netOperatingLoss, context });
}
function complete(input: Input, income = '60000', modified = '65000') {
  const initial = calculate(input, { taxableIncomeWithoutNolQbiAndSection250: d(income), modifiedTaxableIncomeWithoutNolQbiAndSection250: d(modified) });
  return calculate(input, { taxableIncomeWithoutNolQbiAndSection250: d(income), modifiedTaxableIncomeWithoutNolQbiAndSection250: d(modified),
    carryoverContexts: initial.vintages.filter(row => row.openingCarryforward.gt(row.expiredBeforeYear)).map(row => ({ sourceId: row.sourceId,
      priorNolDeductions: row.earlierModifiedNolDeductions!, modifiedTaxableIncomeBeforeTwentyPercentReduction: d(modified).minus(row.earlierModifiedNolDeductions!) })) });
}
describe('same-couple current joint NOL pools', () => {
  // Spec: net-operating-loss-joint-pools.yaml separate-to-joint
  it('pools separate originals once by year without assigning current owner amounts', () => {
    const input = jointNolSourceFixture(), original = structuredClone(input), result = complete(input);
    expect(result.vintages).toHaveLength(1);
    expect(result.availableCarryforward.toString()).toBe('85000');
    expect(result.deduction!.toString()).toBe('48000'); expect(result.absorbed!.toString()).toBe('52000');
    expect(result.carryforward!.toString()).toBe('33000');
    expect(result.vintages[0]).toMatchObject({ sourceId: 'joint-nol:2021', jointPool: { components: [
      { sourceId: 'alex-loss2021', ownerPersonId: 'alex' }, { sourceId: 'jane-loss2021', ownerPersonId: 'jane' }] } });
    expect(JSON.stringify(result.vintages[0])).not.toMatch(/ownerDeduction|ownerClosing|ownerAbsorbed/);
    const reverse = structuredClone(input); reverse.netOperatingLoss.vintages.reverse();
    reverse.netOperatingLoss.sameCoupleJointHistory.years.reverse(); reverse.netOperatingLoss.filingUnitHistory.returns.reverse();
    const reversed = complete(reverse); expect(reversed.vintages).toEqual(result.vintages);
    expect([reversed.deduction!.toString(), reversed.absorbed!.toString(), reversed.carryforward!.toString()]).toEqual(['48000', '52000', '33000']);
    expect(input).toEqual(original);
  });
  // Spec: net-operating-loss-joint-pools.yaml recurrent-joint
  it('retains recurrent filed owner allocations and rejects inconsistent duplicated histories', () => {
    const input = recurrentJointNolSourceFixture(), result = complete(input as Input);
    expect(result.availableCarryforward.toString()).toBe('73000'); expect(result.carryforward!.toString()).toBe('21000');
    const conflict = structuredClone(input); const use = conflict.netOperatingLoss.vintages[1]!.history[1]!.filingUnitUses[0]!;
    use.claimedDeduction = '9999'; use.owners[0]!.claimedDeduction = '2999';
    expect(() => calculate(conflict as Input)).toThrow(/same original|conflict|inconsistent/i);
    const missing = structuredClone(input); missing.netOperatingLoss.vintages.splice(1, 1);
    expect(() => calculate(missing as Input)).toThrow(/each original owner|all.*owner|missing.*owner/i);
  });
  // Spec: net-operating-loss-joint-pools.yaml actual-same-couple
  it('requires actual same-couple years and every original owner without invented shares', () => {
    const changes: Array<(input: Input) => void> = [
      input => { input.netOperatingLoss.sameCoupleJointHistory.sourceFactsConfirmed = false; },
      input => { input.netOperatingLoss.sameCoupleJointHistory.years.splice(1, 1); },
      input => { input.netOperatingLoss.sameCoupleJointHistory.years[0]!.marriedToEachOther = false; },
      input => { input.netOperatingLoss.sameCoupleJointHistory.years[0]!.secondPersonId = 'unrelated'; },
      input => { input.netOperatingLoss.vintages[0]!.filingUnitOrigin.ownerPersonId = 'unrelated'; },
      input => { input.netOperatingLoss.vintages[0]!.openingCarryforward = '50001'; },
      input => { input.netOperatingLoss.vintages[1]!.sourceId = input.netOperatingLoss.vintages[0]!.sourceId!; },
      input => { input.netOperatingLoss.vintages.push({ ...structuredClone(input.netOperatingLoss.vintages[0]!), sourceId: 'duplicate-owner' }); },
    ];
    for (const change of changes) { const input = jointNolSourceFixture(); change(input); expect(() => calculate(input)).toThrow(); }
    const zero = jointNolSourceFixture(); const row = zero.netOperatingLoss.vintages[0]!;
    row.history[0]!.nolUsed = '60000'; row.history[0]!.filingUnitUses[0]!.modifiedAbsorption = '60000';
    row.history[0]!.filingUnitUses[0]!.owners[0]!.modifiedAbsorption = '60000'; row.openingCarryforward = '0';
    expect(calculate(zero).availableCarryforward.toString()).toBe('35000');
    expect(complete(zero).carryforward!.toString()).toBe('0');
  });
  // Spec: net-operating-loss-joint-pools.yaml year-order-and-expiry
  it('keeps loss-year ordering and expiry with independent modified contexts', () => {
    const input = jointNolSourceFixture(), row = structuredClone(input.netOperatingLoss.vintages[0]!);
    row.sourceId = 'jane-loss2005'; row.lossTaxYear = 2005; row.originalLoss = '10000'; row.openingCarryforward = '10000';
    row.carrybackTreatment = 'waived'; row.carrybackSourceReference = 'Filed2005 waiver';
    row.filingUnitOrigin.returnSourceId = 'jane2005'; row.filingUnitOrigin.originalReturnLoss = '10000'; row.filingUnitOrigin.separateComputations[0]!.netOperatingLoss = '10000';
    for (let year = 2005; year < 2021; year++) {
      input.netOperatingLoss.sameCoupleJointHistory.years.push({ taxYear: year, firstPersonId: 'jane', secondPersonId: 'alex', marriedToEachOther: true, sourceReference: `Actual married ${year}` });
      input.netOperatingLoss.filingUnitHistory.returns.push(...['jane', 'alex'].map(person => ({ sourceId: `${person}${year}`, taxYear: year,
        filingStatus: 'married_filing_separately' as const, primaryPersonId: person, sourceReference: `Filed ${person} ${year}` })));
    }
    row.history = Array.from({ length: 19 }, (_, i) => {
      const year = 2006 + i; return { taxYear: year, nolUsed: '0', attributeReduction: '0', sourceReference: `Filed carry ${year}`,
        filingUnitUses: [{ returnSourceId: [2022, 2024].includes(year) ? `joint${year}` : `jane${year}`, sourceReference: `Filed use ${year}`,
          sourceFactsConfirmed: true, allOriginOwnersIncluded: true, allOtherNolSourcesIncluded: true,
          claimedDeduction: '0', modifiedAbsorption: '0', attributeReduction: '0', owners: [{ personId: 'jane', claimedDeduction: '0', modifiedAbsorption: '0', attributeReduction: '0' }] }] };
    });
    input.netOperatingLoss.vintages.push(row);
    const result = complete(input); expect(result.deduction!.toString()).toBe('50000');
    expect(result.absorbed!.toString()).toBe('54000'); expect(result.carryforward!.toString()).toBe('41000');
    expect(result.vintages.map(value => value.lossTaxYear)).toEqual([2005, 2021]);
    const low = complete(input, '0', '0'); expect(low.expired!.toString()).toBe('10000'); expect(low.carryforward!.toString()).toBe('85000');
  });
});
