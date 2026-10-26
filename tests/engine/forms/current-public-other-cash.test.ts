// Spec: spec/federal/current-public-other-cash.yaml.
import { expect, it } from 'vitest';
import { calculateCurrentCharitableCandidates } from '@/engine/forms/current-charitable-candidates.js';
import { d } from '@/utils/decimal.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { getConstants } from '@/models/constants.js';
import { nonitemizerCarryFixture } from '../../fixtures/nonitemizer-carry.js';

function source(publicCash: string, privateCash: string) {
  const input = nonitemizerCarryFixture(publicCash);
  input.donations.push({ organization: 'Actual qualified second-category charity', type: 'cash', amount: privateCash,
    dateOfDonation: '2026-05-15', qualifiedOrganization: true, isPrivateFoundation: true, recipientCategory: "other-thirty-percent",
    supportingOrganization: false, donorAdvisedFund: false });
  return input;
}
function context(publicCash: string, privateCash: string, base = '100000') {
  return { contributionBase: d(base), current: { cashPublic: d(publicCash), cashPrivate: d(privateCash),
    noncashPublic: d('0'), capitalGainPublic: d('0'), noncashPrivate: d('0'), capitalGainPrivate: d('0') } };
}
const rows = (values: { category: string; amount: { toFixed(): string } }[]) => values.map(row => [row.category, row.amount.toFixed()]);

it('keeps current public and other-recipient cash carries in their actual categories', () => {
  for (const [g, b, total, itemized, nonitemized] of [
    ['40000', '30000', '59500', [['other_30', '10500']], [['other_30', '10000']]],
    ['60000', '1000', '59500', [['cash_60', '500'], ['other_30', '1000']], [['other_30', '1000']]],
    ['0', '100000', '29500', [['other_30', '70500']], [['other_30', '70000']]],
  ] as const) {
    const input = source(g, b), before = JSON.stringify(input);
    const result = calculateCurrentCharitableCandidates(input, context(g, b));
    expect(result.itemized.exactCashDeduction.toFixed()).toBe(total);
    expect(result.itemized.exactNonCashDeduction.toFixed()).toBe('0');
    expect(rows(result.itemized.carryforwards)).toEqual(itemized);
    expect(rows(result.nonitemizedCarryforwards)).toEqual(nonitemized);
    expect(result.itemized.carryforwards.every(row => row.medium === 'cash')).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('requires actual cash category sources and preserves exact floor boundaries', () => {
  const exact = calculateCurrentCharitableCandidates(source('4000.11', '3000.99'), context('4000.11', '3000.99', '10000.49'));
  expect(exact.itemized.allowedBeforeFloor.other_30.toFixed()).toBe('2000.184');
  expect(exact.itemized.floorDisallowed.toFixed()).toBe('50.00245');
  expect(rows(exact.itemized.carryforwards)).toEqual([['other_30', '1050.80845']]);
  expect(rows(exact.nonitemizedCarryforwards)).toEqual([['other_30', '1000.806']]);
  for (const [amount, itemized, nonitemized] of [['20000', [], []], ['20000.01', [['other_30', '500.01']], [['other_30', '0.01']]]] as const) {
    const result = calculateCurrentCharitableCandidates(source('40000', amount), context('40000', amount));
    expect(rows(result.itemized.carryforwards)).toEqual(itemized);
    expect(rows(result.nonitemizedCarryforwards)).toEqual(nonitemized);
  }
  const zeroBase = calculateCurrentCharitableCandidates(source('0.01', '0.02'), context('0.01', '0.02', '0'));
  expect(rows(zeroBase.itemized.carryforwards)).toEqual([['cash_60', '0.01'], ['other_30', '0.02']]);
  expect(rows(zeroBase.nonitemizedCarryforwards)).toEqual(rows(zeroBase.itemized.carryforwards));
  for (const mutate of [
    (input: ReturnType<typeof source>) => { input.donations[1].recipientCategory = undefined; },
    (input: ReturnType<typeof source>) => { input.donations[1].amount = '29999.99'; },
    (input: ReturnType<typeof source>) => { input.donations[1].recipientCategory = 'fifty-percent'; },
    (input: ReturnType<typeof source>) => { input.donations[1].type = 'property'; input.donations[1].costBasis = '30000'; input.donations[1].isLongTermCapitalGain = false; },
    (input: ReturnType<typeof source>) => { input.charitableCarryoverSources = undefined; },
    (input: ReturnType<typeof source>) => { input.priorYear = { ...input.priorYear, nolCarryforward: '1' }; },
  ]) {
    const input = source('40000', '30000'); mutate(input);
    expect(() => calculateCurrentCharitableCandidates(input, context('40000', '30000'))).toThrow();
  }
  const ineligible = source('40000', '30000'); ineligible.donations[1].qualifiedOrganization = false;
  const excluded = calculateCurrentCharitableCandidates(ineligible, context('40000', '0'));
  expect(excluded.itemized.exactCashDeduction.toFixed()).toBe('39500');
  expect(excluded.itemized.carryforwards).toEqual([]);
});

it('retains historical cash capacity and the separate mixed-property method', () => {
  const historical = source('40000', '30000');
  historical.taxpayer.taxYear = 2025;
  historical.deductionElection = 'itemized';
  historical.donations.forEach(row => { row.dateOfDonation = '2025-05-15'; });
  if (!historical.charitableCarryoverSources) throw new Error('Missing actual synthetic empty history');
  historical.charitableCarryoverSources.sourceTaxYear = 2025;
  const before = JSON.stringify(historical);
  const result = calculateScheduleA(historical, d('100000'), 'married_filing_separately', getConstants(2025));
  expect(result.cashCharitable.toFixed()).toBe('50000');
  expect(result.charitableCarryforward.toFixed()).toBe('20000');
  expect(result.charitableCarryforwardByYear.map(row => [row.category, row.medium, row.amount.toFixed()]))
    .toEqual([['other_30', 'cash', '20000']]);
  expect(result.currentCharitableCandidates).toBeUndefined();
  expect(JSON.stringify(historical)).toBe(before);
  const mixed = source('40000', '30000');
  mixed.donations.push({ organization:'Actual public property recipient', type:'property', amount:'1', costBasis:'1',
    isLongTermCapitalGain:false, dateOfDonation:'2026-05-15', qualifiedOrganization:true, recipientCategory:'fifty-percent' });
  const mixedContext = context('40000','30000');mixedContext.current.noncashPublic = d('1');
  expect(rows(calculateCurrentCharitableCandidates(mixed,mixedContext).itemized.carryforwards)).toEqual([['other_30','10501']]);
  mixed.donations[2].isLongTermCapitalGain = true;
  mixedContext.current.noncashPublic = d('0');mixedContext.current.capitalGainPublic = d('1');
  expect(()=>calculateCurrentCharitableCandidates(mixed,mixedContext)).toThrow(/separate|categories/);
});
