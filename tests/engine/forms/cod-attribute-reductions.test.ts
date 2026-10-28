// Spec: spec/federal/cod-ordinary-attribute-sources.yaml.
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateCodAttributeReductions } from '@/engine/forms/cod-attribute-reductions.js';
import { codAttributeRecord, codPropertyRecord, emptyCodAttributeLedger } from '../../fixtures/cod-ordinary-attributes.js';

const calculate = (remaining: string, sources = emptyCodAttributeLedger()) => calculateCodAttributeReductions({
  taxYear: 2025, dischargeDate: '2025-10-01', remainingExclusion: new Decimal(remaining), sources,
});

it('preserves statutory order and distinct credit consumption units', () => {
  const sources = emptyCodAttributeLedger();
  sources.records = [codAttributeRecord('foreign_tax_credit', '2'), codAttributeRecord('passive_loss', '1'),
    codAttributeRecord('capital_loss', '2'), codAttributeRecord('minimum_tax_credit', '1'), codAttributeRecord('general_business_credit', '2')];
  sources.property.immediatelyAfter.properties = [codPropertyRecord('original-chair', '1')];
  sources.property.followingYear.properties = structuredClone(sources.property.immediatelyAfter.properties);
  const before = JSON.stringify(sources);
  // The preceding NOL stage consumed3 of the original19; this helper receives16.
  const result = calculate('16', sources);
  expect(result.stages.map(row => [row.kind, row.incomeApplied.toFixed()])).toEqual([
    ['general_business_credit', '6'], ['minimum_tax_credit', '3'], ['capital_loss', '2'],
    ['basis', '1'], ['passive', '1'], ['foreign_tax_credit', '3'],
  ]);
  expect(result.records.find(row => row.kind === 'foreign_tax_credit')?.remaining.toFixed()).toBe('1');
  expect(result.incomeApplied.toFixed()).toBe('16');
  expect(result.unreducedExclusion.toFixed()).toBe('0');
  expect(JSON.stringify(sources)).toBe(before);

  const credit = emptyCodAttributeLedger(); credit.records = [codAttributeRecord('general_business_credit', '1')];
  const partial = calculate('1', credit).records[0]!;
  expect(partial.reductionRatio.amount.toFixed()).toBe('1');
  expect(partial.reductionRatio.denominator?.toFixed()).toBe('3');
  expect(partial.attributeReduction.toDecimalPlaces(18).toFixed()).toBe('0.333333333333333333');
  expect(partial.remaining.toDecimalPlaces(18).toFixed()).toBe('0.666666666666666667');
});

it('reduces actual passive credits and guards undetermined competing components', () => {
  const sources = emptyCodAttributeLedger(); sources.records = [codAttributeRecord('passive_credit', '2')];
  const result = calculate('3', sources);
  expect(result.records[0]?.remaining.toFixed()).toBe('1');
  sources.records.push(codAttributeRecord('passive_loss', '4'));
  expect(() => calculate('3', sources)).toThrow(/COD.*passive.*allocation/i);
  const exhausted = calculate('10', sources);
  expect(exhausted.records.map(row => row.remaining.toFixed())).toEqual(['0', '0']);
  expect(exhausted.unreducedExclusion.toFixed()).toBe('0');
});

it('retains original years and applies only established ordering', () => {
  const sources = emptyCodAttributeLedger();
  const old = codAttributeRecord('capital_loss', '5000');
  const current = { ...codAttributeRecord('capital_loss', '2000'), sourceId: 'capital:current', originTaxYear: 2025,
    originalAmountMeaning: 'current_year_before_use' as const };
  sources.records = [old, current];
  const result = calculate('3000', sources);
  expect(result.records.find(row => row.sourceId === old.sourceId)?.remaining.toFixed()).toBe('4000');
  expect(result.records.find(row => row.sourceId === current.sourceId)?.remaining.toFixed()).toBe('0');
  expect(calculate('3000', { ...sources, records: [...sources.records].reverse() }).records.map(row => [row.sourceId, row.remaining.toFixed()]).sort())
    .toEqual(result.records.map(row => [row.sourceId, row.remaining.toFixed()]).sort());
  const long = { ...old, sourceId: 'capital:other-term', term: 'long' as const };
  expect(() => calculate('3000', { ...sources, records: [old, long] })).toThrow(/COD.*capital.*allocation/i);
  expect(() => calculate('3000', { ...sources, records: [old, old] })).toThrow(/COD.*duplicate/i);
});

it('requires explicit original amount meaning and validates expiry before use', () => {
  const sources = emptyCodAttributeLedger();
  const prior = codAttributeRecord('foreign_tax_credit', '10', '10');
  prior.originTaxYear = 2014;
  prior.history = Array.from({ length: 10 }, (_, index) => ({ taxYear: 2015 + index,
    used: '0', reduced: '0', expired: '0', sourceReference: `Actual filed ${2015 + index} credit worksheet` }));
  sources.records = [prior];
  expect(() => calculate('1', sources)).toThrow(/COD.*expir/i);
  prior.history[9]!.expired = '10'; prior.currentYearUse = '0';
  expect(calculate('1', sources).records[0]?.opening.toFixed()).toBe('0');
  prior.history[9]!.expired = '0'; prior.history[8]!.expired = '10';
  expect(() => calculate('1', sources)).toThrow(/COD.*expir/i);
  prior.originTaxYear = 2015; prior.history = prior.history.slice(1).map(row => ({ ...row, expired: '0' }));
  prior.currentYearUse = '4'; prior.currentYearExpired = '6';
  const finalYear = calculate('3', sources).records[0]!;
  expect(finalYear.beforeReduction.toFixed()).toBe('6');
  expect(finalYear.attributeReduction.toFixed()).toBe('1');
  expect(finalYear.expiredAfterReduction.toFixed()).toBe('5');
  expect(finalYear.remaining.toFixed()).toBe('0');
  prior.originalAmountMeaning = 'current_year_before_use';
  expect(() => calculate('3', sources)).toThrow(/COD.*original.*meaning/i);
});

it('requires actual disposition and acquisition records between property dates', () => {
  const sources = emptyCodAttributeLedger();
  sources.property.immediatelyAfter.properties = [codPropertyRecord('sold-chair', '100')];
  expect(() => calculate('50', sources)).toThrow(/COD.*disposition/i);
  sources.property.followingYear.dispositions = [{ propertyId: 'sold-chair', disposedDate: '2025-11-01',
    sourceReference: 'Actual later sale and removal from January inventory', sourceFactsConfirmed: true }];
  expect(calculate('50', sources).property.attributeReduction.toFixed()).toBe('0');
  sources.property.followingYear.properties = [codPropertyRecord('new-chair', '100')];
  expect(() => calculate('50', sources)).toThrow(/COD.*acquisition/i);
  sources.property.followingYear.properties[0]!.acquiredDate = '2025-12-01';
  expect(calculate('50', sources).property.attributeReduction.toFixed()).toBe('50');
  sources.property.followingYear.dispositions[0]!.disposedDate = '2025-09-30';
  expect(() => calculate('50', sources)).toThrow(/COD.*disposition/i);
});

it('requires independently confirmed alternative property records', () => {
  const regular = emptyCodAttributeLedger();
  regular.property.immediatelyAfter.money = '60';
  regular.property.immediatelyAfter.properties = [codPropertyRecord('property', '100')];
  regular.property.immediatelyAfter.liabilities = [{ sourceId: 'debt', amount: '60', sourceReference: 'Actual liability after discharge' }];
  regular.property.followingYear.properties = [codPropertyRecord('property', '100')];
  const alternative = structuredClone(regular);
  alternative.sourceReference = 'Independent alternative property worksheet';
  alternative.property.immediatelyAfter.properties[0]!.adjustedBasis = '40';
  alternative.property.followingYear.properties[0]!.adjustedBasis = '40';
  expect(calculate('1500', regular).property.attributeReduction.toFixed()).toBe('100');
  expect(calculate('1500', alternative).property.attributeReduction.toFixed()).toBe('40');
  expect(() => calculate('1500', { ...alternative, sourceFactsConfirmed: false })).toThrow(/COD.*confirmed/i);
});

it('retains actual property priority, two-date changes and global Decimal settings', () => {
  const precision = Decimal.precision, rounding = Decimal.rounding;
  const sources = emptyCodAttributeLedger();
  sources.property.immediatelyAfter.properties = [codPropertyRecord('business', '70', 'other_business'), codPropertyRecord('personal', '30')];
  sources.property.followingYear.properties = [codPropertyRecord('business', '60', 'other_business'), codPropertyRecord('personal', '30')];
  const result = calculate('80', sources);
  expect(result.property.basisCap.toFixed()).toBe('100');
  expect(result.property.properties.map(row => [row.propertyId, row.attributeReduction.toFixed(), row.remainingBasis.toFixed()]))
    .toEqual([['business', '60', '0'], ['personal', '20', '10']]);
  sources.property.followingYear.properties[0]!.priorSnapshotChangeReference = '';
  expect(() => calculate('80', sources)).toThrow(/COD.*property.*change/i);
  expect(Decimal.precision).toBe(precision); expect(Decimal.rounding).toBe(rounding);
});
