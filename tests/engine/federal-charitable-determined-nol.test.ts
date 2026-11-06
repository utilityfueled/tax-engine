// Spec: spec/federal/charitable-determined-nol.yaml.
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {Form1099DivSchema} from '@/models/inputs';
import {charitableNolOriginsInput} from '../fixtures/charitable-nol-origins';
import {cryptoCharitableNolInput,k1CharitableNolInput} from '../fixtures/charitable-original-source-nol';
it('replays a unique current charitable origin through the actual canonical return',()=>{
  const input=charitableNolOriginsInput(),before=structuredClone(input),result=calculateFederalTax(input);
  expect([result.nolDeduction.toFixed(),result.agi.toFixed(),result.scheduleA?.charitableTotal.toFixed()]).toEqual(['48000','52000','25600']);
  expect(result.carryforwards.charitableContributionsByYear.map(row=>[row.taxYear,row.category,row.medium,row.amount.toFixed()])).toEqual([[2025,'capital_gain_30','noncash','32880']]);
  expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe('44400');
  expect(result.form6251?.amti.toFixed()).toBe('74400');
  expect(input).toEqual(before);
});
it('keeps independent prior AMT use and actual regular QBI during mixed-source replay',()=>{
  const input=charitableNolOriginsInput({prior:true,alternative:'5000'});
  input.w2s[0].wages='50000';input.form1099Div=[Form1099DivSchema.parse({payer:'Synthetic REIT',ordinaryDividends:'50000',section199ADividends:'50000'})];
  const result=calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe('52000');
  expect(result.allLines.find(row=>row.form==='1040' && row.line==='13')?.value.toFixed()).toBe('5280');
  expect(result.form6251?.lines.find(row=>row.line==='3')?.value.toFixed()).toBe('10600');
  expect(result.form6251?.amti.toFixed()).toBe('79720');
  expect(result.carryforwards.charitableContributionsByYear.map(row=>[row.taxYear,row.amount.toFixed()])).toEqual([[2024,'32880']]);
  expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe('0');
});
it('retains multiple original charity excesses when the actual old NOL expires',()=>{
  const input=charitableNolOriginsInput();
  input.donations[0]={organization:'Synthetic public cash',type:'cash',amount:'80000',dateOfDonation:'2025-05-01',qualifiedOrganization:true,isPrivateFoundation:false};
  const source=input.netOperatingLoss?.vintages?.[0];if(!source)throw new Error('Missing fictional loss');
  Object.assign(source,{lossTaxYear:2005,carrybackTreatment:'waived',carrybackSourceReference:'Synthetic filed original waiver'});
  const result=calculateFederalTax(input);
  expect([result.nolDeduction.toFixed(),result.agi.toFixed(),result.netOperatingLoss?.absorbed.toFixed(),result.netOperatingLoss?.expired.toFixed(),result.carryforwards.nolCarryforward.toFixed()])
    .toEqual(['100000','0','40000','60000','0']);
  expect(result.carryforwards.charitableContributionsByYear.map(row=>[row.category,row.amount.toFixed()])).toEqual([['cash_60','80000'],['capital_gain_30','60000']]);
});

it('replays positive alternative carry with an actual capital-loss modification',()=>{
  const input=charitableNolOriginsInput(),facts=input.netOperatingLoss,source=facts?.vintages?.[0];
  if(!facts?.alternativeTax || !source || !input.priorYear)throw new Error('Missing fictional independent original loss');
  facts.alternativeTax.vintages=[{...source,sourceId:'Synthetic independent alternative2021',section1411OriginalLoss:undefined}];
  facts.vintages=[];input.priorYear.shortTermCapitalLoss='-3000';
  const before=structuredClone(input),result=calculateFederalTax(input),alternative=result.netOperatingLoss?.alternativeTax;
  expect([result.nolDeduction,result.agi,result.scheduleA?.charitableTotal,result.carryforwards.charitableContributions,result.carryforwards.amtCharitableContributions].map(row=>row?.toFixed()))
    .toEqual(['0','97000','39100','30900','30090']);
  expect([alternative?.amtiBeforeAtnol,alternative?.modifiedAmtiBeforeAtnol,alternative?.deduction,alternative?.absorbed,alternative?.carryforward].map(row=>row?.toFixed()))
    .toEqual(['57900','60000','52110','54000','46000']);
  const comparison=result.netOperatingLoss?.alternativeCharitableCounterfactual;
  expect([comparison?.income.amti,comparison?.calculation.deduction,comparison?.calculation.absorbed,comparison?.calculation.carryforward].map(row=>row?.toFixed()))
    .toEqual(['60900','52110','54810','45190']);
  expect(result.netOperatingLoss?.determinedAlternativeCharitableCarryover?.reduction.toFixed()).toBe('810');
  expect(input).toEqual(before);
});
it('retains current regular QBI while independently absorbing a positive ATNOL',()=>{
  const input=charitableNolOriginsInput({prior:true,alternative:'5000'}),facts=input.netOperatingLoss,source=facts?.vintages?.[0];
  if(!facts?.alternativeTax || !source)throw new Error('Missing fictional independent original loss');
  facts.alternativeTax.vintages=[{...source,sourceId:'Synthetic independent alternative2021',section1411OriginalLoss:undefined}];
  input.w2s[0].wages='50000';input.form1099Div=[Form1099DivSchema.parse({payer:'Synthetic REIT',ordinaryDividends:'50000',section199ADividends:'50000'})];
  const result=calculateFederalTax(input),alternative=result.netOperatingLoss?.alternativeTax;
  expect([alternative?.amtiBeforeAtnol,alternative?.modifiedAmtiBeforeAtnol,alternative?.deduction,alternative?.absorbed,alternative?.carryforward].map(row=>row?.toFixed()))
    .toEqual(['79720','85000','71748','76500','23500']);
  expect(result.form6251?.amti.toFixed()).toBe('7972');
  expect([result.carryforwards.charitableContributions,result.carryforwards.amtCharitableContributions].map(row=>row?.toFixed())).toEqual(['32880','0']);
});
it('rejects a positive canonical benefit across multiple original excesses',()=>{
  const input=charitableNolOriginsInput();input.donations[0].amount='80000';input.donations[0].costBasis='80000';
  expect(()=>calculateFederalTax(input)).toThrow(/multiple.*original|multiple.*excess/i);
  input.donations.reverse();expect(()=>calculateFederalTax(input)).toThrow(/multiple.*original|multiple.*excess/i);
});
it('retains original entity basis and crypto value in one current excess category',()=>{
  for(const sCorp of [false,true]) {
    const input=charitableNolOriginsInput(),entity=k1CharitableNolInput(2025,false,sCorp);
    input.donations=input.donations.slice(0,1);
    input.scheduleK1=entity.scheduleK1;input.k1CharitableSources=entity.k1CharitableSources;
    input.cryptoIncome=cryptoCharitableNolInput().cryptoIncome;
    const before=structuredClone(input),result=calculateFederalTax(input);
    expect([result.nolDeduction,result.agi,result.scheduleA?.charitableTotal,result.carryforwards.charitableContributions,result.carryforwards.amtCharitableContributions].map(row=>row?.toFixed()))
      .toEqual(['48000','52000','25600','92880','104400']);
    expect(result.netOperatingLoss?.determinedCharitableCarryover?.rows.map(row=>[row.category,row.amount.toFixed(),row.reduction.toFixed()]))
      .toEqual([['noncash_50','10000','0'],['capital_gain_30','120000','11520']]);
    expect(result.scheduleE?.partnerships[0].basisResult?.suspendedLossCarryforward.charitable.toFixed()).toBe('20000');
    expect(input).toEqual(before);
  }
});
