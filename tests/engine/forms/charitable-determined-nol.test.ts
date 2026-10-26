// Spec: spec/federal/charitable-determined-nol.yaml.
import { expect, it, vi } from 'vitest';
import { d } from '@/utils/decimal';
import { readCharitableNolOrigins, createCharitableNolOriginLimit, validateCharitableNolOriginLimit } from '@/utils/charitable-nol-origins';
import { calculateDeterminedCharitableNol } from '@/engine/forms/charitable-determined-nol';
import { charitableNolOriginsInput } from '../../fixtures/charitable-nol-origins';

it('binds complete independent charitable origins and internal comparison limits', () => {
  const input = charitableNolOriginsInput({ prior:true, alternative:'5000' }), before = structuredClone(input);
  const sources = readCharitableNolOrigins(input);
  expect(sources.regular.map(row => row.amount.toFixed())).toEqual(['60000']);
  expect(sources.alternative.map(row => row.amount.toFixed())).toEqual(['5000']);
  const limit = createCharitableNolOriginLimit(input, 'regular');
  expect(validateCharitableNolOriginLimit(input, limit).current.noncashPublic.toFixed()).toBe('10000');
  for (const changed of [ { ...limit, sourceDigest:'stale' }, { ...limit, rows:limit.rows.slice(1) },
    { ...limit, rows:[...limit.rows, limit.rows[0]] }, { ...limit, rows:limit.rows.map((row,index) => index ? row : { ...row, category:'cash_60' as const }) } ]) {
    expect(() => validateCharitableNolOriginLimit(input, changed)).toThrow(/original|source|complete/i);
  }
  const unknown = structuredClone(input);
  if (!unknown.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory) throw new Error('Missing fictional history');
  unknown.netOperatingLoss.alternativeTax.charitableCarryoverHistory.alternativeCarryoverSources = undefined;
  expect(() => readCharitableNolOrigins(unknown)).toThrow(/independent|complete/i);
  expect(input).toEqual(before);
});
it('reduces one current excess without assigning benefit to fully used categories', () => {
  const input = charitableNolOriginsInput();
  const result = calculateDeterminedCharitableNol({ input, ledger:'regular', normalContributionBase:d('52000'),
    normalDeductionUsed:'itemized', nolCarryforward:d('52000'), computeCarryover:limit => {
      expect(limit.rows.map(row => [row.category,row.retainedAmount.toFixed()])).toEqual([['noncash_50','10000'],['capital_gain_30','15600']]);
      return d('40480');
    } });
  expect(result.rows.map(row => [row.category,row.normalUse.toFixed(),row.reduction.toFixed(),row.carryforward.toFixed()]))
    .toEqual([['noncash_50','10000','0','0'],['capital_gain_30','15600','11520','32880']]);
  expect(result.normalDeduction.toFixed()).toBe('25600');
});
it('retains original prior expiry and independent alternative use', () => {
  const input = charitableNolOriginsInput({ prior:true, alternative:'5000' });
  const regular = calculateDeterminedCharitableNol({ input, ledger:'regular', normalContributionBase:d('52000'), normalDeductionUsed:'itemized',
    nolCarryforward:d('52000'), computeCarryover:() => d('40480') });
  expect(regular.rows.find(row => row.kind === 'prior')?.carryforward.toFixed()).toBe('32880');
  expect(regular.rows.find(row => row.kind === 'prior')?.contributionYear).toBe(2024);
  const alternative = calculateDeterminedCharitableNol({ input, ledger:'alternative', normalContributionBase:d('52000'), normalDeductionUsed:'itemized',
    nolCarryforward:d('0'), computeCarryover:() => { throw new Error('No succeeding alternative loss'); } });
  expect([alternative.normalDeduction.toFixed(),alternative.carryforward.toFixed()]).toEqual(['15000','0']);
  const expired = structuredClone(input);
  for (const packet of [expired.charitableCarryoverSources, expired.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources]) {
    if (!packet?.vintages?.[0]) throw new Error('Missing fictional prior');
    const row=packet.vintages[0]; row.contributionYear=2020;
    row.history=[2021,2022,2023,2024].map(taxYear => ({ taxYear,treatedAsPaid:'0',nolReduction:'0',sourceReference:'Synthetic no-use return' }));
  }
  const history=expired.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if (!history) throw new Error('Missing fictional history');
  history.priorRegularCarryovers?.forEach(row => { row.taxYear=2020; });
  history.priorAlternativeCarryovers?.forEach(row => { row.taxYear=2020; });
  const closing=calculateDeterminedCharitableNol({ input:expired,ledger:'regular',normalContributionBase:d('52000'),normalDeductionUsed:'itemized',nolCarryforward:d('52000'),computeCarryover:()=>d('40480') });
  expect(closing.rows.find(row=>row.kind==='prior')?.expired.toFixed()).toBe('32880');
  expect(closing.carryforward.toFixed()).toBe('0');
});
it('preserves all original excess when the simultaneous NOL benefit is zero', () => {
  const input=charitableNolOriginsInput();
  input.donations[0]={ organization:'Synthetic public cash recipient',type:'cash',amount:'80000',dateOfDonation:'2025-05-01',qualifiedOrganization:true,isPrivateFoundation:false };
  const callback=vi.fn(()=>d('0'));
  const result=calculateDeterminedCharitableNol({ input,ledger:'regular',normalContributionBase:d('60000'),normalDeductionUsed:'itemized',nolCarryforward:d('0'),computeCarryover:callback });
  expect(result.rows.map(row=>[row.category,row.carryforward.toFixed()])).toEqual([['cash_60','44000'],['capital_gain_30','60000']]);
  expect(callback).not.toHaveBeenCalled();
  const positive=calculateDeterminedCharitableNol({ input,ledger:'regular',normalContributionBase:d('60000'),normalDeductionUsed:'itemized',nolCarryforward:d('50000'),computeCarryover:()=>d('50000') });
  expect(positive.carryforward.toFixed()).toBe('104000');
});
it('rejects positive multiple-origin attribution and contradictory comparisons', () => {
  const input=charitableNolOriginsInput(); input.donations[0].amount='80000';input.donations[0].costBasis='80000';
  for (const comparison of ['49999','-1','50001','0.5']) {
    expect(()=>calculateDeterminedCharitableNol({ input,ledger:'regular',normalContributionBase:d('60000'),normalDeductionUsed:'itemized',nolCarryforward:d('50000'),computeCarryover:()=>d(comparison) })).toThrow(/multiple|comparison|succeeding/i);
  }
});
it('keeps exact origin cents and rejects stale balanced source changes', () => {
  const input=charitableNolOriginsInput();
  input.donations[0].amount='10000.01';input.donations[0].costBasis='10000.01';
  input.donations[1].amount='60000.49';
  const result=calculateDeterminedCharitableNol({ input,ledger:'regular',normalContributionBase:d('52000'),normalDeductionUsed:'itemized',nolCarryforward:d('52000'),computeCarryover:()=>d('40480') });
  expect(result.carryforward.toFixed()).toBe('32880.49');
  const limit=createCharitableNolOriginLimit(input,'regular');
  const changed=structuredClone(input);changed.donations[1].costBasis='29999';
  expect(()=>validateCharitableNolOriginLimit(changed,limit)).toThrow(/source|original/i);
  const reverse=structuredClone(input);reverse.donations.reverse();
  const reordered=calculateDeterminedCharitableNol({ input:reverse,ledger:'regular',normalContributionBase:d('52000'),normalDeductionUsed:'itemized',nolCarryforward:d('52000'),computeCarryover:()=>d('40480') });
  expect(reordered.carryforward.toFixed()).toBe('32880.49');
});
