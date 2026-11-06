// Spec: charitable-determined-nol.yaml. Draft constants only in this test; gates unchanged.
import {expect,it,vi} from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{
  const original=await importOriginal<typeof import('@/models/constants.js')>();
  const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import {calculateFederalTax} from '@/engine/federal';
import {charitableNolOriginsInput} from '../fixtures/charitable-nol-origins';
import {prepareCharitableReview,charitableReviewOriginalSourceInput} from '@/pdf/charitable-review-context';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {d} from '@/utils/decimal';
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

// The prior proposed2026/70000-deduction oracle is retained FAILED in V1/V2.
// IRC172(a)(2)(A) deducts the full pre2018 carry; modified absorption is separate.
it('exhausts all2025 current excess at the actual full pre2018 deduction endpoint',()=>{
  const input=charitableNolOriginsInput({year:2025});
  input.donations[0].amount='20000';input.donations[0].costBasis='20000';
  input.donations[1].amount='10000';input.donations[1].costBasis='5000';
  const loss=input.netOperatingLoss?.vintages?.[0];if(!loss)throw new Error('Missing fictional filed loss');
  Object.assign(loss,{sourceId:'synthetic-original2017',lossTaxYear:2017,carrybackTreatment:'waived',
    carrybackSourceReference:'Synthetic original2017 timely filed carryback waiver',
    history:Array.from({length:7},(_,i)=>({taxYear:2018+i,nolUsed:'0',attributeReduction:'0',sourceReference:`Synthetic complete filed no-use year${2018+i}`}))});
  const before=structuredClone(input),result=calculateFederalTax(input);
  expect([result.nolDeduction,result.agi,result.scheduleA?.charitableTotal,result.netOperatingLoss?.absorbed,
    result.carryforwards.nolCarryforward,result.carryforwards.charitableContributions,result.carryforwards.amtCharitableContributions]
    .map(value=>value?.toFixed())).toEqual(['100000','0','0','70000','30000','0','30000']);
  const determined=result.netOperatingLoss?.determinedCharitableCarryover;
  expect(determined?.rows.map(row=>[row.category,row.amount.toFixed(),row.normalUse.toFixed(),row.tentativeExcess.toFixed(),row.reduction.toFixed(),row.carryforward.toFixed()]))
    .toEqual([['noncash_50','20000','0','20000','20000','0'],['capital_gain_30','10000','0','10000','10000','0']]);
  const comparison=result.netOperatingLoss?.charitableCounterfactual;
  expect([comparison?.income.charitableDeduction,comparison?.calculation.deduction,comparison?.calculation.absorbed,comparison?.calculation.carryforward]
    .map(value=>value?.toFixed())).toEqual(['0','100000','100000','0']);
  expect(result.carryforwards.charitableContributionsByYear).toEqual([]);
  expect(input).toEqual(before);
});

it('retains2026 partial attribution when the amended floor prevents complete exhaustion',()=>{
  const input=charitableNolOriginsInput({year:2026});
  input.donations[0].amount='20000';input.donations[0].costBasis='20000';
  input.donations[1].amount='10500';input.donations[1].costBasis='5000';
  const loss=input.netOperatingLoss?.vintages?.[0];if(!loss)throw new Error('Missing fictional filed loss');
  Object.assign(loss,{sourceId:'synthetic-original2017',lossTaxYear:2017,carrybackTreatment:'waived',
    carrybackSourceReference:'Synthetic original2017 timely filed carryback waiver',
    history:Array.from({length:8},(_,i)=>({taxYear:2018+i,nolUsed:'0',attributeReduction:'0',sourceReference:`Synthetic complete filed no-use year${2018+i}`}))});
  // Full deduction100000 gives AGI0/normaluse0/excess30500, not AGI30000.
  // Modified charity30500-floor500=30000; absorption70000/carry30000.
  // Comparisoncarry0 gives benefit30000<30500: still no partial attribution.
  const before=structuredClone(input);
  expect(()=>calculateFederalTax(input)).toThrow(/Positive charitable NOL benefit across multiple original excess sources requires its separate attribution method/);
  expect(input).toEqual(before);
});

it('binds exhausted source and result in the original charitable review context',()=>{
  const input=charitableNolOriginsInput({year:2025});
  input.donations[0].amount='20000';input.donations[0].costBasis='20000';
  input.donations[1].amount='10000';input.donations[1].costBasis='5000';
  const loss=input.netOperatingLoss?.vintages?.[0];if(!loss)throw new Error('Missing fictional filed loss');
  Object.assign(loss,{sourceId:'synthetic-original2017',lossTaxYear:2017,carrybackTreatment:'waived',
    carrybackSourceReference:'Synthetic original2017 timely filed carryback waiver',
    history:Array.from({length:7},(_,i)=>({taxYear:2018+i,nolUsed:'0',attributeReduction:'0',sourceReference:`Synthetic complete filed no-use year${2018+i}`}))});
  const before=structuredClone(input),result=calculateFederalTax(input),token=prepareCharitableReview(input);
  expect(result.netOperatingLoss?.determinedCharitableCarryover?.method).toBe('fully_exhausted_direct_current_excess');
  expect([result.agi,result.scheduleA?.charitableTotal,result.carryforwards.charitableContributions].map(value=>value?.toFixed()))
    .toEqual(['0','0','0']);
  expect(charitableReviewOriginalSourceInput(input,result,token)).toEqual(input);
  expect(charitableReviewOriginalSourceInput(redactReviewIdentifiers(input),result,token)).toEqual(input);
  const changed=structuredClone(input);changed.donations[0].organization='Changed equal-money original recipient';
  expect(()=>charitableReviewOriginalSourceInput(changed,result,token)).toThrow(/source|original|stale/i);
  const stale={...result,agi:result.agi.plus(1)};
  expect(()=>charitableReviewOriginalSourceInput(input,stale,token)).toThrow(/calculation|reconcile/i);
  const row=result.netOperatingLoss?.determinedCharitableCarryover?.rows[0];if(!row)throw new Error('Missing complete original row');
  row.reduction=d('0');
  expect(()=>charitableReviewOriginalSourceInput(input,result,token)).toThrow(/calculation|reconcile/i);
  expect(input).toEqual(before);
});
