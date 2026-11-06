// Spec: spec/federal/current-minimum-tax-credit-sources.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { actualCurrentMtcInput, actualCurrentMtc2026Input } from '../fixtures/current-minimum-tax-credit.js';

function withoutDischarge(input: ReturnType<typeof actualCurrentMtcInput>) {
  // The independent comparison has no carry claim or COD; explicit empty
  // inventories remain on the actual discharge originals below.
  return { ...input, form1099C: [], codExclusion: undefined, form982NolSources: undefined, form982AttributeSources: undefined, netOperatingLoss: undefined };
}

it('generates signed current credit only for the next-year aggregate', () => {
  const input = actualCurrentMtcInput(), before = JSON.stringify(input);
  const baseline = calculateFederalTax(withoutDischarge(input)), result = calculateFederalTax(input);
  expect(result.taxableIncome.toFixed()).toBe('84250');
  expect(result.form6251?.amt.toFixed()).toBe('41639');
  expect(result.form6251?.tentativeMinimumTax.toFixed()).toBe('55094');
  expect(result.currentMinimumTaxCredit?.sourceCalculation.minTaxCreditFromSourceYear.toFixed()).toBe('41639');
  expect(result.currentMinimumTaxCredit?.sourceCalculation.exclusionOnlyAMTI.toFixed()).toBe('100000');
  expect(result.currentMinimumTaxCredit?.sourceCalculation.netMinTaxOnExclusionItems.toFixed()).toBe('0');
  expect(result.currentMinimumTaxCredit?.currentCreditUsed.toFixed()).toBe('0');
  expect(result.currentMinimumTaxCredit?.currentFormCarry.toFixed()).toBe('0');
  expect(result.currentMinimumTaxCredit?.followingYearPool.toFixed()).toBe('41639');
  expect(result.carryforwards.minimumTaxCredit.toFixed()).toBe('41539');
  expect(result.totalTax.toFixed()).toBe('55094');
  expect(result.totalTax.eq(baseline.totalTax)).toBe(true);
  expect(JSON.stringify(input)).toBe(before);
});

it('combines a negative signed adjustment with the actual aggregate after current use', () => {
  const input = actualCurrentMtcInput({ reversal: true, priorAvailable: '70000' });
  const baseline = calculateFederalTax(withoutDischarge(input)), result = calculateFederalTax(input);
  expect(result.form6251?.amt.toFixed()).toBe('0');
  expect(result.form6251?.tentativeMinimumTax.toFixed()).toBe('3094');
  expect(result.currentMinimumTaxCredit?.sourceCalculation.exclusionOnlyAMTI.toFixed()).toBe('300000');
  expect(result.currentMinimumTaxCredit?.sourceCalculation.minTaxCreditFromSourceYear.toFixed()).toBe('-41639');
  expect(result.form8801?.totalAvailableCredit.toFixed()).toBe('70000');
  expect(result.form8801?.creditAllowed.toFixed()).toBe('10361');
  expect(result.form8801?.carryforwardToNextYear.toFixed()).toBe('59639');
  expect(result.currentMinimumTaxCredit?.followingYearPool.toFixed()).toBe('18000');
  expect(result.carryforwards.minimumTaxCredit.toFixed()).toBe('17900');
  expect(result.totalTax.toFixed()).toBe('3094');
  expect(result.totalTax.eq(baseline.totalTax)).toBe(true);
  expect(result.form8801?.lines.map(row => row.value.toFixed())).toEqual(baseline.form8801?.lines.map(row => row.value.toFixed()));
});

it('floors the combined negative pool without changing the current credit', () => {
  const result = calculateFederalTax(actualCurrentMtcInput({ reversal: true, priorAvailable: '30000' }));
  expect(result.currentMinimumTaxCredit?.sourceCalculation.minTaxCreditFromSourceYear.toFixed()).toBe('-41639');
  expect(result.form8801?.creditAllowed.toFixed()).toBe('10361');
  expect(result.form8801?.carryforwardToNextYear.toFixed()).toBe('19639');
  expect(result.currentMinimumTaxCredit?.followingYearPool.toFixed()).toBe('0');
  expect(result.carryforwards.minimumTaxCredit.toFixed()).toBe('0');
  expect(result.codAttributeReduction?.regular.unreducedExclusion.toFixed()).toBe('300');
  expect(result.codAttributeReduction?.regular.minimumTaxCreditPool?.attributeReduction.toFixed()).toBe('0');
});

it('retains distinct prior-source identities and ignores their input order', () => {
  const input = actualCurrentMtcInput({ reversal: true, priorAvailable: '70000', splitPrior: true });
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  const reordered = structuredClone(input); reordered.form982AttributeSources.regular!.records!.reverse();
  reordered.form982AttributeSources.currentMinimumTaxCredit.sourceYearCalculation.k1Statements.reverse();
  const opposite = calculateFederalTax(reordered);
  for (const value of [result, opposite]) {
    expect(value.carryforwards.minimumTaxCredit.toFixed()).toBe('17900');
    const pool = value.codAttributeReduction?.regular.minimumTaxCreditPool;
    expect(pool?.beforeReduction.toFixed()).toBe('18000');
    expect(pool?.incomeApplied.toFixed()).toBe('300');
    expect(pool?.attributeReduction.toFixed()).toBe('100');
    expect(pool?.priorSourceRecords.map(row => [row.sourceId, row.opening.toFixed(), row.currentUse.toFixed()]).sort()).toEqual([
      ['actual-origin-2022', '40000', '10361'], ['actual-origin-2023', '30000', '0'],
    ]);
    expect(value.codAttributeReduction?.regular.records.some(row => row.kind === 'minimum_tax_credit')).toBe(false);
    expect(pool && 'originTaxYear' in pool).toBe(false);
  }
  expect(JSON.stringify(input)).toBe(before);
});

it('rejects omitted duplicate and balanced changed adjustment originals', () => {
  const original = actualCurrentMtcInput();
  const second = { ...original.scheduleK1[0]!, partnershipName: 'Second original', partnershipEIN: '98-7654321', amtDepreciationAdjustment: '-100000' };
  original.scheduleK1.push(second);
  const packet = original.form982AttributeSources.currentMinimumTaxCredit.sourceYearCalculation;
  packet.k1Statements.push({ ...packet.k1Statements[0]!, sourceId: 'adjustment-original-B', entityName: 'Second original',
    entityEin: '98-7654321', depreciationAdjustment: '-100000' });
  const omitted = structuredClone(original); omitted.form982AttributeSources.currentMinimumTaxCredit.sourceYearCalculation.k1Statements.pop();
  const duplicate = structuredClone(original); duplicate.form982AttributeSources.currentMinimumTaxCredit.sourceYearCalculation.k1Statements[1]!.entityEin = '12-3456789';
  const balanced = structuredClone(original); balanced.scheduleK1[0]!.amtDepreciationAdjustment = '200001'; balanced.scheduleK1[1]!.amtDepreciationAdjustment = '-100001';
  for (const input of [omitted, duplicate, balanced]) expect(() => calculateFederalTax(input)).toThrow(/current.*minimum.*source|current.*MTC|adjustment.*original/i);
});

it('requires independent actual empty ancillary histories', () => {
  for (const change of [
    (packet: ReturnType<typeof actualCurrentMtcInput>['form982AttributeSources']['currentMinimumTaxCredit']['sourceYearCalculation']) => Reflect.deleteProperty(packet, 'minimumTaxCreditNolHistory'),
    (packet: ReturnType<typeof actualCurrentMtcInput>['form982AttributeSources']['currentMinimumTaxCredit']['sourceYearCalculation']) => { packet.minimumTaxCreditNolHistory.sourceFactsConfirmed = false; },
    (packet: ReturnType<typeof actualCurrentMtcInput>['form982AttributeSources']['currentMinimumTaxCredit']['sourceYearCalculation']) => { packet.minimumTaxCreditNolHistory.carryoverSources = [{ sourceReference: 'Actual positive exclusion-only NOL', amount: '1' }]; },
    (packet: ReturnType<typeof actualCurrentMtcInput>['form982AttributeSources']['currentMinimumTaxCredit']['sourceYearCalculation']) => Reflect.deleteProperty(packet.exclusionOnlyForeignHistory, 'carrybackSources'),
    (packet: ReturnType<typeof actualCurrentMtcInput>['form982AttributeSources']['currentMinimumTaxCredit']['sourceYearCalculation']) => { packet.exclusionOnlyForeignHistory.sourceTaxYear = 2024; },
    (packet: ReturnType<typeof actualCurrentMtcInput>['form982AttributeSources']['currentMinimumTaxCredit']['sourceYearCalculation']) => { packet.exclusionOnlyForeignHistory.currentSources = [{ sourceReference: 'Actual foreign tax', amount: '1' }]; },
  ]) {
    const input = actualCurrentMtcInput(); change(input.form982AttributeSources.currentMinimumTaxCredit.sourceYearCalculation);
    expect(() => calculateFederalTax(input)).toThrow(/current.*minimum.*source|current.*MTC|exclusion.only|MTCNOL|MTFTCE/i);
  }
});

it('preserves owner method and independent shared-credit boundaries', () => {
  const owner = actualCurrentMtcInput(); owner.form982AttributeSources.currentMinimumTaxCredit.sourceYearCalculation.taxpayerIdLast4 = '9999';
  const other = actualCurrentMtcInput(); other.scheduleK1[0]!.amtOtherItems = '1';
  other.form982AttributeSources.currentMinimumTaxCredit.sourceYearCalculation.k1Statements[0]!.otherAdjustment = '1';
  const legacy = actualCurrentMtcInput(); legacy.form982AttributeSources.currentMinimumTaxCredit.sourceYearCalculation.unallowedQualifiedElectricVehicleCredit = '1';
  const vector = actualCurrentMtcInput(); vector.form982AttributeSources.alternativeTax!.property!.immediatelyAfter!.money = '1';
  for (const input of [owner, other, legacy, vector]) expect(() => calculateFederalTax(input)).toThrow(/current.*minimum.*source|current.*MTC|shared.*vector|credit.*composition/i);
});

// Spec: current-minimum-tax-credit-sources.yaml production-2026-closed.
it('keeps the actual production2026 calculation gate closed', () => {
  expect(() => calculateFederalTax(actualCurrentMtc2026Input())).toThrow(/2026 rule pack .* is incomplete; calculation is unavailable/i);
});
