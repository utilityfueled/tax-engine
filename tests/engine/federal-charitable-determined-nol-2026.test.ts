// Spec: charitable-determined-nol.yaml. Draft constants only in this test; gates unchanged.
import {expect,it,vi} from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{
  const original=await importOriginal<typeof import('@/models/constants.js')>();
  const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import {calculateFederalTax} from '@/engine/federal';
import {charitableNolOriginsInput} from '../fixtures/charitable-nol-origins';
it('preserves determined current floor and the actual NOL claim',()=>{
  const input=charitableNolOriginsInput({year:2026}),result=calculateFederalTax(input);
  expect([result.nolDeduction,result.agi,result.scheduleA?.charitableTotal,result.carryforwards.charitableContributions,
    result.carryforwards.amtCharitableContributions,result.form6251?.amti].map(row=>row?.toFixed()))
    .toEqual(['48400','51600','25222','32956','44778','74778']);
  const comparison=result.netOperatingLoss?.charitableCounterfactual?.calculation;
  expect([comparison?.deduction,comparison?.absorbed,comparison?.carryforward].map(row=>row?.toFixed())).toEqual(['48400','60222','39778']);
  expect(result.carryforwards.charitableContributionsByYear.map(row=>[row.taxYear,row.category,row.amount.toFixed()])).toEqual([[2026,'capital_gain_30','32956']]);
});
it('keeps actual nonitemized choice and zero-benefit multiple origins distinct',()=>{
  for(const method of ['standard','nonitemized'] as const){
    const input=charitableNolOriginsInput({year:2026});input.deductionElection=method;
    input.taxpayer.filingStatus='married_filing_separately';
    if(!input.standardDeductionFacts)throw new Error('Missing fictional standard deduction facts');
    input.standardDeductionFacts.spouseItemizes=method==='nonitemized';
    input.donations[0]={organization:'Synthetic eligible public cash',type:'cash',amount:'80000',dateOfDonation:'2026-05-01',
      qualifiedOrganization:true,recipientCategory:'fifty-percent',supportingOrganization:false,donorAdvisedFund:false};
    const before=structuredClone(input),result=calculateFederalTax(input);
    expect(result.deductionUsed).toBe(method);expect(result.deductionAmount.toFixed()).toBe(method==='standard'?'16100':'0');
    expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe('1000');
    expect([result.nolDeduction,result.agi].map(row=>row.toFixed())).toEqual(method==='standard'?['66320','33680']:['79200','20800']);
    expect(result.carryforwards.charitableContributionsByYear.map(row=>[row.category,row.amount.toFixed()]))
      .toEqual([['cash_60',method==='standard'?'59960.4':'67624'],['capital_gain_30','60000']]);
    expect(result.netOperatingLoss?.determinedCharitableCarryover?.reduction.toFixed()).toBe('0');
    expect(input).toEqual(before);
  }
});
it('rejects an undetermined cash-recipient comparison and prior floor attribution',()=>{
  const input=charitableNolOriginsInput({year:2026});input.deductionElection='standard';
  input.donations=[{organization:'Synthetic eligible cash',type:'cash',amount:'10000',dateOfDonation:'2026-05-01',qualifiedOrganization:true,
    recipientCategory:'fifty-percent',supportingOrganization:false,donorAdvisedFund:false},
    {organization:'Synthetic actual DAF',type:'cash',amount:'70000',dateOfDonation:'2026-05-02',qualifiedOrganization:true,
      recipientCategory:'fifty-percent',supportingOrganization:false,donorAdvisedFund:true}];
  expect(()=>calculateFederalTax(input)).toThrow(/mixed170\(p\)|recipient.*attribution/i);
  const prior=charitableNolOriginsInput({year:2026,prior:true});
  expect(()=>calculateFederalTax(prior)).toThrow(/floor.*prior|prior.*floor/i);
});
it('preserves a determined cash cap without choosing eligible recipients',()=>{
  const input=charitableNolOriginsInput({year:2026});input.deductionElection='standard';
  input.donations=[{organization:'Synthetic eligible cash',type:'cash',amount:'70000',dateOfDonation:'2026-05-01',qualifiedOrganization:true,
    recipientCategory:'fifty-percent',supportingOrganization:false,donorAdvisedFund:false},
    {organization:'Synthetic actual DAF',type:'cash',amount:'10000',dateOfDonation:'2026-05-02',qualifiedOrganization:true,
      recipientCategory:'fifty-percent',supportingOrganization:false,donorAdvisedFund:true}];
  const before=structuredClone(input),result=calculateFederalTax(input);
  expect([result.nolDeduction,result.nonitemizerCharitableDeduction,result.carryforwards.charitableContributions].map(row=>row?.toFixed()))
    .toEqual(['66320','1000','59960.4']);
  expect(result.netOperatingLoss?.determinedCharitableCarryover?.reduction.toFixed()).toBe('0');
  expect(input).toEqual(before);
});
it('does not allocate unused nonitemizer eligibility under actual itemization',()=>{
  const input=charitableNolOriginsInput({year:2026});input.deductionElection='itemized';
  input.donations=[{organization:'Synthetic eligible cash',type:'cash',amount:'10000',dateOfDonation:'2026-05-01',qualifiedOrganization:true,
    recipientCategory:'fifty-percent',supportingOrganization:false,donorAdvisedFund:false},
    {organization:'Synthetic actual DAF',type:'cash',amount:'70000',dateOfDonation:'2026-05-02',qualifiedOrganization:true,
      recipientCategory:'fifty-percent',supportingOrganization:false,donorAdvisedFund:true}];
  const before=structuredClone(input),result=calculateFederalTax(input);
  expect(result.deductionUsed).toBe('itemized');
  expect([result.nolDeduction,result.agi,result.scheduleA?.charitableTotal,result.nonitemizerCharitableDeduction].map(row=>row?.toFixed()))
    .toEqual(['32400','67600','40222','0']);
  expect(result.netOperatingLoss?.determinedCharitableCarryover?.rows).toHaveLength(1);
  expect(input).toEqual(before);
});
