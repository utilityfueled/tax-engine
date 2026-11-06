import { describe, expect, it } from 'vitest';
import type { TaxYearInput } from '@/models/inputs';
import { calculateNetOperatingLoss, type NetOperatingLossContext } from '@/engine/forms/net-operating-loss';
import { calculateQbiEblNol } from '@/engine/forms/qbi-ebl-nol';
import { d } from '@/utils/decimal';
import { jointEblNolSourceFixture, zeroOrdinaryJointEblNolSourceFixture } from '../../fixtures/net-operating-loss-joint-ebl';

function source(input: TaxYearInput, context?: NetOperatingLossContext) {
  return calculateNetOperatingLoss({ taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus,
    taxpayer: input.taxpayer, facts: input.netOperatingLoss!, context });
}
function complete(input: TaxYearInput, income: string, modified = income) {
  const context = { taxableIncomeWithoutNolQbiAndSection250: d(income), modifiedTaxableIncomeWithoutNolQbiAndSection250: d(modified) };
  const initial = source(input, context);
  return source(input, { ...context, carryoverContexts: initial.vintages.filter(row => row.openingCarryforward.gt(row.expiredBeforeYear))
    .map(row => ({ sourceId: row.sourceId, priorNolDeductions: row.earlierModifiedNolDeductions!,
      modifiedTaxableIncomeBeforeTwentyPercentReduction: d(modified).minus(row.earlierModifiedNolDeductions!) })) });
}

describe('determined same-year joint EBL components', () => {
  // Spec: net-operating-loss-joint-ebl.yaml independent-vectors
  it('keeps deduction absorption and closing component proofs independent', () => {
    const input = jointEblNolSourceFixture(), before = structuredClone(input), incomplete = source(input);
    expect(incomplete.calculationComplete).toBe(false);
    expect(incomplete.vintages[0]!.jointPool!.components).toEqual([
      expect.objectContaining({ sourceId: 'alex-loss2021', originKind: 'individual_nol' }),
      expect.objectContaining({ sourceId: 'jane-loss2021', originKind: 'excess_business_loss' }),
    ]);
    const zero = complete(input, '-1500'), zeroQbi = calculateQbiEblNol(input, { regular: zero });
    expect([zero.deduction!.toString(), zero.absorbed!.toString(), zero.carryforward!.toString()]).toEqual(['0', '0', '85000']);
    expect(zeroQbi.currentQualifiedDeduction!.toString()).toBe('0');
    expect(zeroQbi.vintages[0]!.qualifiedRemainingCarryforward!.toString()).toBe('25000');
    expect(() => complete(input, '-1500', '68500')).toThrow(/same.year.*component|component.*attribution|determined/i);
    const fullAbsorption = complete(input, '-1500', '200000');
    const noCurrentQbi = calculateQbiEblNol(input, { regular: fullAbsorption });
    expect([fullAbsorption.deduction!.toString(), fullAbsorption.absorbed!.toString(), fullAbsorption.carryforward!.toString()]).toEqual(['0', '85000', '0']);
    expect(noCurrentQbi.currentQualifiedDeduction!.toString()).toBe('0');
    expect(noCurrentQbi.vintages[0]!.qualifiedRemainingCarryforward!.toString()).toBe('0');
    expect(input).toEqual(before);
  });
  // Spec: net-operating-loss-joint-ebl.yaml single-positive
  it('retains known-zero originals without inventing a partial source priority', () => {
    const input = zeroOrdinaryJointEblNolSourceFixture(), result = complete(input, '18500');
    const qbi = calculateQbiEblNol(input, { regular: result });
    expect([result.deduction!.toString(), result.absorbed!.toString(), result.carryforward!.toString()]).toEqual(['14800', '14800', '35200']);
    expect(result.vintages[0]!.jointPool!.components).toEqual([
      expect.objectContaining({ sourceId: 'alex-loss2021', deduction: d('0'), absorbed: d('0'), remainingCarryforward: d('0') }),
      expect.objectContaining({ sourceId: 'jane-loss2021', deduction: d('14800'), absorbed: d('14800'), remainingCarryforward: d('35200') }),
    ]);
    expect(qbi.currentQualifiedDeduction!.toString()).toBe('7400');
    expect(qbi.vintages[0]!.qualifiedRemainingCarryforward!.toString()).toBe('17600');
    input.netOperatingLoss!.vintages!.reverse();
    expect(complete(input, '18500').vintages).toEqual(result.vintages);
    const exhaustedEbl = jointEblNolSourceFixture('50000'), original = exhaustedEbl.netOperatingLoss!.vintages![0]!;
    original.openingCarryforward = '0'; original.history![0]!.nolUsed = '60000';
    const filed = original.history![0]!.filingUnitUses![0]!;
    filed.claimedDeduction = '60000'; filed.modifiedAbsorption = '60000';
    filed.owners![0]!.claimedDeduction = '60000'; filed.owners![0]!.modifiedAbsorption = '60000';
    const qualified = exhaustedEbl.qbiLossSources!.excessBusinessLossHistories![0]!;
    qualified.originalNol = structuredClone(original); qualified.qualifiedOpeningCarryforward = '0';
    qualified.history![0]!.qualifiedNolAbsorption = '30000';
    const ordinaryUse = complete(exhaustedEbl, '18500'), noQualifiedUse = calculateQbiEblNol(exhaustedEbl, { regular: ordinaryUse });
    expect([ordinaryUse.deduction!.toString(), ordinaryUse.carryforward!.toString()]).toEqual(['14800', '20200']);
    expect(noQualifiedUse.currentQualifiedDeduction!.toString()).toBe('0');
    expect(noQualifiedUse.vintages[0]!.qualifiedRemainingCarryforward!.toString()).toBe('0');
  });
  // Spec: net-operating-loss-joint-ebl.yaml source-qualified-owner
  it('binds original qualified character and owner before current aggregation', () => {
    const input = jointEblNolSourceFixture(); expect(calculateQbiEblNol(input).vintages).toHaveLength(1);
    const wrongOwner = structuredClone(input), history = wrongOwner.qbiLossSources!.excessBusinessLossHistories![0]!;
    history.accountHolder = 'spouse'; history.recipientName = 'Alex Rowe'; history.recipientTaxpayerIdLast4 = '4321';
    expect(() => calculateQbiEblNol(wrongOwner)).toThrow(/original.*owner|owner.*original|filing.unit/i);
    const missing = structuredClone(input); delete missing.qbiLossSources!.excessBusinessLossHistories;
    expect(() => calculateQbiEblNol(missing)).toThrow(/complete.*histor/i);
    const stale = structuredClone(input); stale.qbiLossSources!.excessBusinessLossHistories![0]!.originalNol!.sourceReference = 'Other filed source';
    expect(() => calculateQbiEblNol(stale)).toThrow(/snapshot.*match/i);
    const regular = complete(input, '168500');
    const redistributed = { ...regular, vintages: regular.vintages.map(row => ({ ...row,
      jointPool: { components: row.jointPool!.components.map((part, index) => ({ ...part,
        deduction: part.deduction!.plus(index === 0 ? '1' : '-1') })) } })) };
    expect(() => calculateQbiEblNol(input, { regular: redistributed })).toThrow(/component.*use|determined.*vector/i);
  });
  // Spec: net-operating-loss-joint-ebl.yaml unresolved-partial
  it('rejects partial multi-positive use even with known-zero qualified fractions', () => {
    const input = jointEblNolSourceFixture('100000'), history = input.qbiLossSources!.excessBusinessLossHistories![0]!;
    history.originalQualifiedLoss = '0'; history.qualifiedOpeningCarryforward = '0';
    for (const row of history.history!) row.qualifiedNolAbsorption = '0';
    expect(source(input).availableCarryforward.toString()).toBe('85000');
    expect(calculateQbiEblNol(input).vintages[0]!.qualifiedOpeningCarryforward.toString()).toBe('0');
    expect(() => complete(input, '68500')).toThrow(/same.year.*component|component.*attribution|determined/i);
  });
});
