// Spec: spec/federal/charitable-determined-floor.yaml. All literals are derived controls.
import { expect, it } from 'vitest';
import { calculateCharitableDeterminedFloor as calculate } from '@/engine/forms/charitable-determined-floor.js';
import { d, sum } from '@/utils/decimal.js';
import { nonitemizedCategoryFixture as fixture, nonitemizedCategoryContext as context } from '../../fixtures/nonitemized-charitable-categories.js';
import { cryptoCharitableNolInput, k1CharitableNolInput } from '../../fixtures/charitable-original-source-nol.js';
import { charitableStatement } from '../../fixtures/k1-charitable-return.js';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
const balances = (rows: ReturnType<typeof calculate>['carryforwards']) => rows.map(row => [row.taxYear,row.category,row.medium,row.amount.toFixed()]);
it('uses the actual percentage ledger before a determined current-category floor',()=>{
  const input=fixture('10000','0','0','40000','10000',[{taxYear:2025,category:'cash_60',amount:'20000'}]);
  input.deductionElection='automatic';
  const before=JSON.stringify(input),r=calculate(input,context('10000','0','0','40000','10000'));
  expect([r.currentCash,r.currentNoncash,r.priorDeduction,r.totalDeduction,r.floorDisallowed].map(x=>x.toFixed())).toEqual(['10000','29500','20000','59500','500']);
  expect(r.currentBeforeFloor).toEqual({cash_60:d('10000'),noncash_50:d('0'),other_30:d('0'),capital_gain_30:d('20000'),capital_gain_20:d('10000')});
  expect(balances(r.carryforwards)).toEqual([[2026,'capital_gain_30','noncash','20000'],[2026,'capital_gain_20','noncash','500']]);
  expect(balances(r.nonitemizedCarryforwards)).toEqual([[2026,'capital_gain_30','noncash','20000'],[2026,'capital_gain_20','noncash','500']]);
  expect(r.detail[0].treatedAsPaid.toFixed()).toBe('20000');expect(r.detail[0].amountUsed.toFixed()).toBe('20000');
  expect(r.currentFloorByCategory.capital_gain_20.toFixed()).toBe('500');
  expect(JSON.stringify(input)).toBe(before);
});
it('preserves shared capacities and current percentage versus floor carry',()=>{
  const input=fixture('10000','0','40000','20000','1000',[{taxYear:2025,category:'noncash_50',amount:'5000'}]);
  input.deductionElection='itemized';const r=calculate(input,context('10000','0','40000','20000','1000'));
  expect([r.currentCash,r.currentNoncash,r.priorDeduction,r.totalDeduction].map(x=>x.toFixed())).toEqual(['35000','9500','5000','49500']);
  expect(balances(r.carryforwards)).toEqual([[2026,'capital_gain_30','noncash','10500'],[2026,'other_30','cash','15000'],[2026,'capital_gain_20','noncash','1000']]);
  expect(balances(r.nonitemizedCarryforwards)).toEqual([[2026,'capital_gain_30','noncash','10500'],[2026,'other_30','cash','15000'],[2026,'capital_gain_20','noncash','1000']]);
  const noExcess=fixture('10000','0','0','0','600',[{taxYear:2025,category:'capital_gain_30',amount:'5000'}]);
  expect(calculate(noExcess,context('10000','0','0','0','600')).carryforwards).toEqual([]);
});
it('requires every positive floor hit to have a determined current origin and medium',()=>{
  const input=fixture('10000','0','0','0','500',[{taxYear:2025,category:'capital_gain_30',amount:'5000'}]);
  const exact=calculate(input,context('10000','0','0','0','500'));
  expect(exact.totalDeduction.toFixed()).toBe('15000');expect(exact.priorDeduction.toFixed()).toBe('5000');expect(exact.carryforwards).toEqual([]);
  const below=fixture('10000','0','0','0','499.99',[{taxYear:2025,category:'capital_gain_30',amount:'5000'}]);
  expect(()=>calculate(below,context('10000','0','0','0','499.99'))).toThrow(/floor.*prior|prior.*floor/i);
  const same=fixture('0','0','0','10000','0',[{taxYear:2025,category:'capital_gain_30',amount:'5000'}]);
  expect(()=>calculate(same,context('0','0','0','10000','0'))).toThrow(/floor.*prior|prior.*floor/i);
  const mixed=fixture('0','0','1000','0','0',[{taxYear:2025,category:'cash_60',amount:'1000'}]);
  mixed.donations.push({...mixed.donations[1],recipientCategory:'other-thirty-percent',amount:'1000',costBasis:'1000'});
  const mixedContext=context('0','0','1000','0','0');mixedContext.current.noncashPrivate=d('1000');
  expect(()=>calculate(mixed,mixedContext)).toThrow(/partial.*cash\/noncash|allocation method/i);
});
it('conserves exact source history through zero floor and original expiration',()=>{
  const input=fixture('0.01','0.02','0','0.49','0',[
    {taxYear:2025,category:'cash_60',amount:'0.05'},{taxYear:2020,category:'capital_gain_30',amount:'0.03'},
    {taxYear:2021,category:'noncash_50',amount:'0.04'},
  ]);
  for(const base of ['0','-1']){
    const r=calculate(input,context('0.01','0.02','0','0.49','0',base));
    expect(r.floorDisallowed.toFixed()).toBe('0');expect(r.priorTreatedAsPaid.toFixed()).toBe('0');expect(r.expired.toFixed()).toBe('0.07');
    expect(sum(...r.carryforwards.map(x=>x.amount)).toFixed()).toBe('0.57');expect(r.carryforwards).toEqual(r.nonitemizedCarryforwards);
    for(const row of r.detail)expect(row.amountAvailable.eq(row.treatedAsPaid.plus(row.amountRemaining).plus(row.amountExpired))).toBe(true);
    const reversed=structuredClone(input);reversed.donations.reverse();reversed.charitableCarryoverSources?.vintages?.reverse();
    const reordered=calculate(reversed,context('0.01','0.02','0','0.49','0',base));
    expect(reordered.sourceDigest).not.toBe(r.sourceDigest);
    expect({...reordered,sourceDigest:r.sourceDigest}).toEqual(r);
  }
  const split=fixture('0','0','0','0.24','0',[{taxYear:2025,category:'cash_60',amount:'1'}]);
  split.donations.push({...split.donations[3],amount:'0.25'});
  const r=calculate(split,context('0','0','0','0.49','0','10'));
  expect(r.currentNoncash.toFixed()).toBe('0.44');expect(r.floorDisallowed.toFixed()).toBe('0.05');expect(r.carryforwards).toEqual([]);
});
it('binds the determined candidates to original current and prior sources',()=>{
  for(const change of [
    (i:ReturnType<typeof fixture>)=>{i.charitableCarryoverSources=undefined;},
    (i:ReturnType<typeof fixture>)=>{if(i.charitableCarryoverSources)i.charitableCarryoverSources.primaryTaxpayerIdLast4='9999';},
    (i:ReturnType<typeof fixture>)=>{if(i.charitableCarryoverSources)i.charitableCarryoverSources.sourceFactsConfirmed=false;},
    (i:ReturnType<typeof fixture>)=>{i.donations[3].amount='39999.99';},
    (i:ReturnType<typeof fixture>)=>{i.donations[3].recipientCategory=undefined;},
    (i:ReturnType<typeof fixture>)=>{i.taxpayer.taxYear=2025;},
    (i:ReturnType<typeof fixture>)=>{i.netOperatingLoss={};},
  ]){const i=fixture('10000','0','0','40000','10000',[{taxYear:2025,category:'cash_60',amount:'20000'}]);change(i);expect(()=>calculate(i,context('10000','0','0','40000','10000'))).toThrow();}
  const unresolved=fixture('10000','0','30000','0','1000',[{taxYear:2025,category:'capital_gain_30',amount:'40000'}]);
  expect(()=>calculate(unresolved,context('10000','0','30000','0','1000'))).toThrow(/prior.*capital.*offset|offset.*prior.*capital/i);
});
it('retains actual crypto and K1 source values before the determined floor',()=>{
  const input=fixture('0','0','0','0','0',[{taxYear:2025,category:'cash_60',amount:'20000'}]);
  const k1=k1CharitableNolInput(2026),crypto=cryptoCharitableNolInput(2026);
  input.scheduleK1=k1.scheduleK1;input.k1CharitableSources=k1.k1CharitableSources;input.cryptoIncome=crypto.cryptoIncome;
  input.deductionElection='itemized';
  const before=JSON.stringify(input),r=calculate(input,context('0','0','0','120000','0'));
  expect(calculateK1CharitableReturnSources(input)?.statements[0].basis.charitableSources?.basisSuspended.toFixed()).toBe('20000');
  expect([r.currentNoncash,r.priorDeduction,r.totalDeduction,r.floorDisallowed].map(x=>x.toFixed())).toEqual(['29500','20000','49500','500']);
  expect(balances(r.carryforwards)).toEqual([[2026,'capital_gain_30','noncash','90500']]);
  expect(balances(r.nonitemizedCarryforwards)).toEqual([[2026,'capital_gain_30','noncash','90500']]);
  const changed=structuredClone(input),statement=charitableStatement(changed);
  if(!statement.basis?.currentContributions?.[0] || !statement.receipts?.[0])throw Error('Missing actual synthetic source');
  changed.scheduleK1[0].charitableCapitalGain30='90000';
  statement.basis.currentContributions[0].contributionShare='90000';
  statement.basis.currentContributions[0].adjustedBasisShare='50000';
  statement.receipts[0].fairMarketValueShare='90000';
  const sameQualified=calculate(changed,context('0','0','0','120000','0'));
  expect(sameQualified.currentNoncash.eq(r.currentNoncash)).toBe(true);
  expect(sameQualified.carryforwards).toEqual(r.carryforwards);
  expect(sameQualified.sourceDigest).not.toBe(r.sourceDigest);
  expect(JSON.stringify(input)).toBe(before);
});
