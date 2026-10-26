// Spec: spec/federal/nonitemized-charitable-categories.yaml.
import { expect, it } from 'vitest';
import { calculateNonitemizedCharitableCategories } from '@/engine/forms/nonitemized-charitable-categories.js';
import { d, sum } from '@/utils/decimal.js';
import { ScheduleK1Schema } from '@/models/inputs.js';
import { attachCategoryHistory, nonitemizedCategoryFixture as fixture, nonitemizedCategoryContext as context } from '../../fixtures/nonitemized-charitable-categories.js';
import { currentCryptoFixture, currentCryptoContext } from '../../fixtures/current-charitable-crypto.js';
const calculate = calculateNonitemizedCharitableCategories;
const balances = (r: ReturnType<typeof calculate>) => r.carryforwards.map(row => [row.taxYear,row.category,row.medium,row.amount.toFixed()]);
it('conserves all five actual categories across current and prior sources', () => {
  const input=fixture(),before=JSON.stringify(input),r=calculate(input,context());
  expect(r.method).toBe('2026_nonitemized_ordinary_categories');
  expect(r.currentWithinPercentageLimit).toEqual({ cash_60:d('10000'),noncash_50:d('5000'),other_30:d('10000'),capital_gain_30:d('10000'),capital_gain_20:d('0') });
  expect(r.priorTreatedAsPaid.toFixed()).toBe('15000');
  expect(r.priorDeduction.toFixed()).toBe('0'); expect(r.totalDeduction.toFixed()).toBe('0');
  expect(balances(r)).toEqual([[2022,'capital_gain_20','noncash','8000'],[2023,'capital_gain_30','noncash','10000'],[2025,'other_30','cash','10000'],[2026,'capital_gain_30','noncash','10000'],[2026,'capital_gain_20','noncash','15000']]);
  const second=fixture('0','0','5000','10000','5000',[
    {taxYear:2025,category:'cash_60',amount:'10000'}, {taxYear:2025,category:'noncash_50',amount:'5000'},
    {taxYear:2025,category:'capital_gain_30',amount:'10000'}, {taxYear:2025,category:'other_30',amount:'10000'},
    {taxYear:2025,category:'capital_gain_20',amount:'10000'},
  ]);
  const next=calculate(second,context('0','0','5000','10000','5000'));
  expect(next.priorTreatedAsPaid.toFixed()).toBe('40000');
  expect(balances(next)).toEqual([[2025,'capital_gain_20','noncash','5000']]);
  for(const row of [...r.detail,...next.detail]) expect(row.amountAvailable.eq(row.treatedAsPaid.plus(row.amountRemaining).plus(row.amountExpired))).toBe(true);
  expect(JSON.stringify(input)).toBe(before);
  const reversed={...input,donations:[...input.donations].reverse(),charitableCarryoverSources:{...input.charitableCarryoverSources,vintages:[...(input.charitableCarryoverSources?.vintages??[])].reverse()}};
  expect(calculate(reversed,context())).toEqual(r);
});
it('distinguishes actual current capital property from prior treated-paid reservations',()=>{
  for(const [g,c,bUse,cUse,bCarry] of [['0','40000','10000','30000','20000'],['10000','30000','20000','20000','10000']] as const){
    const input=fixture(g,'0','0',c,'0',[{taxYear:2025,category:'other_30',amount:'30000'}]);
    const r=calculate(input,context(g,'0','0',c,'0'));
    expect(r.priorTreatedAsPaid.toFixed()).toBe(bUse);expect(r.currentWithinPercentageLimit.capital_gain_30.toFixed()).toBe(cUse);
    expect(balances(r)).toEqual([[2025,'other_30','cash',bCarry],[2026,'capital_gain_30','noncash','10000']]);
  }
});
it('preserves exact FIFO balances and original expiration without floor carry',()=>{
  const input=fixture('4000.11','1000.01','0','0','0',[{taxYear:2025,category:'cash_60',amount:'2500.005'}]);
  const r=calculate(input,context('4000.11','1000.01','0','0','0','10000.49'));
  expect(r.priorTreatedAsPaid.toFixed()).toBe('2000.184');
  expect(balances(r)).toEqual([[2025,'cash_60','cash','499.821'],[2026,'noncash_50','noncash','1000.01']]);
  const old=fixture('5.7','0','0','0','0',[{taxYear:2025,category:'cash_60',amount:'0.2'}, {taxYear:2020,category:'cash_60',amount:'0.1'},{taxYear:2021,category:'cash_60',amount:'0.4'}]);
  const expiry=calculate(old,context('5.7','0','0','0','0','10'));
  expect(expiry.priorTreatedAsPaid.toFixed()).toBe('0.3');expect(expiry.expired.toFixed()).toBe('0.2');
  expect(balances(expiry)).toEqual([[2025,'cash_60','cash','0.2']]);
  for(const base of ['0','-1']) {
    const z=calculate(input,context('4000.11','1000.01','0','0','0',base));
    expect(z.priorTreatedAsPaid.toFixed()).toBe('0');expect(sum(...z.carryforwards.map(row=>row.amount)).toFixed()).toBe('7500.125');
  }
});
it('preserves actual media and rejects only unsupported partial attribution',()=>{
  const entries=[{taxYear:2025,category:'other_30' as const,amount:'100',medium:'cash' as const},{taxYear:2025,category:'other_30' as const,amount:'200',medium:'noncash' as const}];
  const full=calculate(fixture('0','0','0','0','0',entries),context('0','0','0','0','0'));
  expect(full.priorTreatedAsPaid.toFixed()).toBe('300');expect(full.carryforwards).toEqual([]);
  const zero=calculate(fixture('60000','0','0','0','0',entries),context('60000','0','0','0','0'));
  expect(zero.priorTreatedAsPaid.toFixed()).toBe('0');expect(zero.carryforwards.map(row=>row.amount.toFixed())).toEqual(['100','200']);
  expect(()=>calculate(fixture('0','0','0','0','0',entries),context('0','0','0','0','0','500'))).toThrow(/partial.*cash\/noncash|allocation method/i);
  const mixed=fixture('0','0','100','0','0',[]);mixed.donations.push({...mixed.donations[1],recipientCategory:'other-thirty-percent',amount:'200',costBasis:'200'});
  const ctx=context('0','0','100','0','0','500');ctx.current.noncashPrivate=d('200');
  expect(()=>calculate(mixed,ctx)).toThrow(/partial.*cash\/noncash|allocation method/i);
});
it('binds current sources and separate actual history before computing carry',()=>{
  const crypto=attachCategoryHistory(currentCryptoFixture(),[{taxYear:2025,category:'other_30',amount:'10000'}]);
  const r=calculate(crypto,currentCryptoContext());expect(r.currentReceiptAmounts.capitalGainPublic.toFixed()).toBe('20000');
  expect(r.priorTreatedAsPaid.toFixed()).toBe('10000');
  for(const mutate of [
    (i:ReturnType<typeof fixture>)=>{i.donations[1].costBasis=undefined;},
    (i:ReturnType<typeof fixture>)=>{i.donations[3].amount='19999.99';},
    (i:ReturnType<typeof fixture>)=>{i.donations[3].recipientCategory=undefined;},
    (i:ReturnType<typeof fixture>)=>{i.charitableCarryoverSources=undefined;},
    (i:ReturnType<typeof fixture>)=>{if(i.charitableCarryoverSources)i.charitableCarryoverSources.sourceFactsConfirmed=false;},
    (i:ReturnType<typeof fixture>)=>{if(i.charitableCarryoverSources)i.charitableCarryoverSources.primaryTaxpayerIdLast4='9999';},
    (i:ReturnType<typeof fixture>)=>{i.netOperatingLoss={};},
    (i:ReturnType<typeof fixture>)=>{i.deductionElection='automatic';},
    (i:ReturnType<typeof fixture>)=>{i.deductionElection='itemized';},
    (i:ReturnType<typeof fixture>)=>{i.taxpayer.taxYear=2025;},
  ]) {const i=fixture();mutate(i);expect(()=>calculate(i,context())).toThrow();}
  const unverified=structuredClone(crypto);if(!unverified.cryptoIncome?.donations[0])throw Error('Missing synthetic crypto');unverified.cryptoIncome.donations[0].sourceFactsConfirmed=false;
  expect(()=>calculate(unverified,currentCryptoContext())).toThrow(/verified|source|confirm/i);
  for(const field of ['charitableCash','charitableCapitalGain30','charitableCapitalGain20'] as const){
    const k1=fixture();k1.scheduleK1=[ScheduleK1Schema.parse({partnershipName:'Synthetic K1 source',partnershipEIN:'98-7654321',ordinaryIncome:'0',[field]:'1'})];
    // A caller cannot hide a known original K1 amount by omitting it from context.
    expect(()=>calculate(k1,context())).toThrow(/K.?1|pass.through|source method/i);
  }
  expect(()=>calculate(fixture(),{...context(),contributionBase:d('NaN')})).toThrow(/finite/i);
});
it('retains the exact amended-offset prior-capital boundary',()=>{
  for(const [currentC,priorC] of [['0','40000'],['10000','20000']] as const){
    const input=fixture('10000','0','30000',currentC,'0',[{taxYear:2025,category:'capital_gain_30',amount:priorC}]),before=JSON.stringify(input);
    expect(()=>calculate(input,context('10000','0','30000',currentC,'0'))).toThrow(/prior.*capital.*offset|offset.*prior.*capital/i);
    expect(JSON.stringify(input)).toBe(before);
  }
  const supported=calculate(fixture('10000','0','5000','0','0',[{taxYear:2025,category:'capital_gain_30',amount:'10000'}]),context('10000','0','5000','0','0'));
  expect(supported.priorTreatedAsPaid.toFixed()).toBe('10000');expect(supported.carryforwards).toEqual([]);
});

it('keeps actual current and prior capital gifts inside the shared other ceiling',()=>{
  const input=fixture('10000','0','20000','30000','10000',[{taxYear:2025,category:'capital_gain_20',amount:'5000'}]);
  const before=JSON.stringify(input),r=calculate(input,context('10000','0','20000','30000','10000'));
  expect(r.currentWithinPercentageLimit.capital_gain_20.toFixed()).toBe('0');
  expect(r.priorTreatedAsPaid.toFixed()).toBe('0');
  expect(balances(r)).toEqual([[2025,'capital_gain_20','noncash','5000'],[2026,'capital_gain_30','noncash','10000'],[2026,'capital_gain_20','noncash','10000']]);
  expect(JSON.stringify(input)).toBe(before);
  const priorOnly=calculate(fixture('10000','0','20000','30000','0',[{taxYear:2025,category:'capital_gain_20',amount:'10000'}]),context('10000','0','20000','30000','0'));
  expect(priorOnly.priorTreatedAsPaid.toFixed()).toBe('0');
  expect(priorOnly.detail[0].amountRemaining.toFixed()).toBe('10000');
  const cents=calculate(fixture('10000','0','19999.99','30000','0.005',[{taxYear:2025,category:'capital_gain_20',amount:'0.02'}]),context('10000','0','19999.99','30000','0.005'));
  expect(cents.currentWithinPercentageLimit.capital_gain_20.toFixed()).toBe('0.005');
  expect(cents.priorTreatedAsPaid.toFixed()).toBe('0.005');
  expect(cents.detail[0].amountRemaining.toFixed()).toBe('0.015');
  expect(cents.detail[0].amountAvailable.eq(cents.detail[0].treatedAsPaid.plus(cents.detail[0].amountRemaining))).toBe(true);
});
