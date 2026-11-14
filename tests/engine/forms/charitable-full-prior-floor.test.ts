// Spec: spec/federal/charitable-full-prior-floor.yaml. Independently derived finite synthetic endpoints.
import { expect, it } from 'vitest';
import { calculateCharitableDeterminedFloor as calculate } from '@/engine/forms/charitable-determined-floor.js';
import { calculateCharitableCategoryUse } from '@/engine/forms/charitable-category-use.js';
import { fullPriorFloorFixture as fixture, fullPriorFloorContext as context } from '../../fixtures/charitable-full-prior-floor.js';
import { nonitemizedCategoryFixture, nonitemizedCategoryContext } from '../../fixtures/nonitemized-charitable-categories.js';
import { charitableFilingUnitFixture } from '../../fixtures/charitable-filing-unit-history.js';

it('absorbs the entire multi-vintage category without assigning or renewing a vintage', () => {
  const input = fixture(), before = JSON.stringify(input), result = calculate(input, context());
  expect(result.method).toBe('2026_full_prior_category_floor_no_excess');
  expect([result.priorTreatedAsPaid, result.priorDeduction, result.totalDeduction, result.floorDisallowed]
    .map(value => value.toFixed())).toEqual(['500', '0', '0', '500']);
  expect(result.detail.map(row => [row.taxYear, row.amountAvailable.toFixed(), row.treatedAsPaid.toFixed(),
    row.amountUsed.toFixed(), row.amountRemaining.toFixed(), row.amountExpired.toFixed()]))
    .toEqual([[2024, '200', '200', '0', '0', '0'], [2025, '300', '300', '0', '0', '0']]);
  expect(result.detail.every(row => row.amountAvailable.eq(row.treatedAsPaid.plus(row.amountRemaining).plus(row.amountExpired)))).toBe(true);
  expect(result.carryforwards).toEqual([]); expect(result.nonitemizedCarryforwards).toEqual([]);
  expect(JSON.stringify(input)).toBe(before);
});

it('distinguishes exact whole-category absorption from a partial multi-vintage floor', () => {
  for (const second of ['299.99', '300']) {
    const result = calculate(fixture('200', second), context());
    expect(result.priorDeduction.toFixed()).toBe('0');
    expect(result.floorDisallowed.toFixed()).toBe(second === '299.99' ? '499.99' : '500');
    expect(result.carryforwards).toEqual([]);
  }
  expect(() => calculate(fixture('200', '300.01'), context())).toThrow(/floor.*prior|prior.*floor/i);
});

it('conserves actual history and expiry without a new contribution clock', () => {
  const input = nonitemizedCategoryFixture('0', '0', '0', '0', '0', [
    { taxYear: 2021, category: 'capital_gain_30', amount: '200' },
    { taxYear: 2025, category: 'capital_gain_30', amount: '300' },
    { taxYear: 2020, category: 'noncash_50', amount: '70' },
  ]);
  const original = input.charitableCarryoverSources?.vintages?.find(row => row.contributionYear === 2021);
  if (!original?.history?.[0]) throw Error('Missing synthetic original annual history');
  original.originalExcess = '250'; original.history[0].treatedAsPaid = '50';
  const result = calculate(input, context());
  expect(result.expired.toFixed()).toBe('70'); expect(result.priorTreatedAsPaid.toFixed()).toBe('500');
  expect(result.priorDeduction.toFixed()).toBe('0'); expect(result.carryforwards).toEqual([]);
  expect(result.detail.map(row => [row.taxYear, row.amountAvailable.toFixed(), row.treatedAsPaid.toFixed(),
    row.amountRemaining.toFixed(), row.amountExpired.toFixed()]))
    .toEqual([[2020, '70', '0', '0', '70'], [2021, '200', '200', '0', '0'], [2025, '300', '300', '0', '0']]);
  const reordered = structuredClone(input); reordered.charitableCarryoverSources?.vintages?.reverse(); reordered.donations.reverse();
  const reverse = calculate(reordered, context());
  expect({ ...reverse, sourceDigest: result.sourceDigest }).toEqual(result);
  expect(reverse.sourceDigest).not.toBe(result.sourceDigest);
});

it('uses only a wholly absorbed prior category and retains unresolved composition guards', () => {
  const input = nonitemizedCategoryFixture('10000', '0', '0', '0', '100', [
    { taxYear: 2024, category: 'capital_gain_30', amount: '200' },
    { taxYear: 2025, category: 'capital_gain_30', amount: '200' },
  ]);
  const result = calculate(input, nonitemizedCategoryContext('10000', '0', '0', '0', '100'));
  expect(result.totalDeduction.toFixed()).toBe('10000'); expect(result.floorDisallowed.toFixed()).toBe('500');
  expect(result.currentFloorByCategory.capital_gain_20.toFixed()).toBe('100');
  expect(result.detail.map(row => row.amountUsed.toFixed())).toEqual(['0', '0']);
  expect(result.carryforwards).toEqual([]);
  input.donations[4].amount = '100.01';
  expect(() => calculate(input, nonitemizedCategoryContext('10000', '0', '0', '0', '100.01'))).toThrow(/floor.*prior|prior.*floor/i);
  for (const [cash, otherCash, capital, first, second] of [
    ['0', '0', '1', '200', '300'], // Competing allowed current gift in same C category.
    ['0', '60000', '0', '200', '300'], // Surviving current B percentage excess while prior C is treated.
    ['0', '0', '0', '30000', '1'], // Partial prior percentage consumption.
  ]) {
    const guarded = nonitemizedCategoryFixture(cash, '0', otherCash, capital, '0', [
      { taxYear: 2024, category: 'capital_gain_30', amount: first }, { taxYear: 2025, category: 'capital_gain_30', amount: second },
    ]);
    expect(() => calculate(guarded, nonitemizedCategoryContext(cash, '0', otherCash, capital, '0'))).toThrow(/floor.*prior|prior.*floor/i);
  }
  const nol = fixture(); nol.netOperatingLoss = {};
  expect(() => calculate(nol, context())).toThrow(/NOL|loss/i);
  const pooled = fixture();
  if (!pooled.charitableCarryoverSources) throw Error('Missing original packet');
  pooled.charitableCarryoverSources.returnMembership = 'changed_filing_unit';
  pooled.charitableCarryoverSources.membershipUnchangedConfirmed = false;
  expect(() => calculate(pooled, context())).toThrow(/filing|timeline|history/i);
});

it('requires unique actual original sources and complete annual history', () => {
  const changes: Array<(input: ReturnType<typeof fixture>) => void> = [
    input => { input.charitableCarryoverSources = undefined; },
    input => { if (input.charitableCarryoverSources) input.charitableCarryoverSources.sourceFactsConfirmed = false; },
    input => { if (input.charitableCarryoverSources) input.charitableCarryoverSources.primaryTaxpayerIdLast4 = '9999'; },
    input => { if (input.charitableCarryoverSources) input.charitableCarryoverSources.sourceTaxYear = 2025; },
    input => { const row=input.charitableCarryoverSources?.vintages?.[0]; if (row) row.sourceReference = ''; },
    input => { const row=input.charitableCarryoverSources?.vintages?.[0]; if (row) row.category = undefined; },
    input => { const row=input.charitableCarryoverSources?.vintages?.[0]; if (row) row.originalExcess = undefined; },
    input => { const row=input.charitableCarryoverSources?.vintages?.[0]; if (row) row.allHistoryIncluded = false; },
    input => { const row=input.charitableCarryoverSources?.vintages?.[0]; if (row) row.history = []; },
    input => { const rows=input.charitableCarryoverSources?.vintages; if (rows?.[0] && rows[1]) rows[1].sourceId=rows[0].sourceId; },
    input => { const row=input.charitableCarryoverSources?.vintages?.[0]; if (row) input.charitableCarryoverSources?.vintages?.push({ ...structuredClone(row), sourceId:'different-id-same-vintage' }); },
  ];
  for (const change of changes) { const input = fixture(); change(input); expect(() => calculate(input, context())).toThrow(); }
  const knownZero = calculate(fixture('0', '300'), context());
  expect(knownZero.priorTreatedAsPaid.toFixed()).toBe('300');
  expect(knownZero.detail[0].amountAvailable.toFixed()).toBe('0');
  expect(knownZero.method).toBe('2026_single_prior_floor_no_excess');
});

it('rejects otherwise complete changed-unit sources at the prior floor boundary', () => {
  const input = charitableFilingUnitFixture(), packet = input.charitableCarryoverSources;
  const timeline = packet?.filingUnitHistory, original = packet?.vintages?.[0];
  if (!packet || !timeline?.returns || !original?.filingUnitOrigin?.separateComputations || !original.history) {
    throw Error('Missing actual fictional changed-unit original');
  }
  input.taxpayer.taxYear = 2026; packet.sourceTaxYear = 2026;
  timeline.currentReturnSourceId = 'jane-2026';
  timeline.returns.push({ sourceId:'jane-2026',taxYear:2026,filingStatus:'single',primaryPersonId:'jane',sourceReference:'Fictional actual2026 return' });
  original.category = 'capital_gain_30'; original.originalExcess = '1000'; original.openingCarryforward = '200';
  original.adjustedThroughTaxYear = 2025;
  original.filingUnitOrigin.separateComputations[0].originalExcess = '400';
  original.filingUnitOrigin.separateComputations[1].originalExcess = '600';
  for (const row of original.history) {
    row.treatedAsPaid = row.taxYear === 2023 ? '500' : '0';
    for (const use of row.filingUnitUses ?? []) use.treatedAsPaid = row.treatedAsPaid;
  }
  original.history.push({ taxYear:2025,treatedAsPaid:'0',nolReduction:'0',sourceReference:'Fictional actual2025 zero use',
    filingUnitUses:[{returnSourceId:'jane-2025',treatedAsPaid:'0',nolReduction:'0',sourceReference:'Fictional actual2025 individual use'}] });
  packet.vintages?.push({ sourceId:'individual-stock-2025',contributionYear:2025,category:'capital_gain_30',medium:'noncash',
    sourceReference:'Fictional actual2025 individual ordinary stock carry300',originalExcess:'300',originNolReduction:'0',openingCarryforward:'300',
    adjustedThroughTaxYear:2025,allHistoryIncluded:true,ordinaryPercentageMethodConfirmed:true,history:[],filingUnitOrigin:{returnSourceId:'jane-2025'} });
  const source = calculateCharitableCategoryUse(input, context());
  expect(source.detail.map(row => row.treatedAsPaid.toFixed())).toEqual(['200','300']);
  expect(source.detail.every(row => row.filingUnitSources?.length === 1)).toBe(true);
  expect(source.carryforwards).toEqual([]);
  expect(() => calculate(input, context())).toThrow(/floor.*prior|prior.*floor/i);
});
