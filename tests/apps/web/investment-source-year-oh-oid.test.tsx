// @vitest-environment jsdom
/** Spec: state/guided-investment-source-year-oh-oid.yaml. Native source-year edits, no defaults. */
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {InterestSourceDetails,DividendSourceDetails} from '@/components/guided-interview/investment-source-details';
import {SectionInvestmentIncome} from '@/components/guided-interview/section-investment-income';
import {investmentFactErrors} from '@/lib/guided-investment-facts';
import {mountGuidedPanel} from './guided-panel-dom';
import {actualInvestmentYearData} from '../../fixtures/investment-source-year-oh-oid';
it('actual INT and DIV year controls remain blank until entered',async()=>{
 const data=actualInvestmentYearData(undefined);let actual=data;
 function Harness(){const[current,set]=useState(data);return <><InterestSourceDetails data={current.interestEntries[0]} onChange={(key,value)=>{actual={...current,interestEntries:current.interestEntries.map(row=>({...row,[key]:value}))};set(actual);}}/><DividendSourceDetails data={current.dividendEntries[0]} onChange={(key,value)=>{actual={...current,dividendEntries:current.dividendEntries.map(row=>({...row,[key]:value}))};set(actual);}}/></>;}
 const dom=await mountGuidedPanel(<Harness/>);try{
  await dom.expand('Remaining actual 1099-INT boxes');await dom.expand('Remaining actual 1099-DIV boxes');
  expect(dom.control('Actual 1099-INT calendar year').value).toBe('');expect(dom.control('Actual 1099-DIV calendar year').value).toBe('');
  await dom.change('Actual 1099-INT calendar year','2025');expect(Reflect.get(actual.interestEntries[0],'sourceTaxYear')).toBe('2025');expect(Reflect.get(actual.dividendEntries[0],'sourceTaxYear')).toBeUndefined();
  await dom.change('Actual 1099-DIV calendar year','2024');expect(investmentFactErrors(actual,'single',2025)).toHaveProperty('dividend-0-year');
  await dom.change('Actual 1099-DIV calendar year','2025');expect(investmentFactErrors(actual,'single',2025)).not.toHaveProperty('dividend-0-year');
  await dom.change('Actual 1099-INT calendar year','');expect(investmentFactErrors(actual,'single',2025)).toHaveProperty('interest-0-year');
 }finally{await dom.dispose();}
});

it('actual investment year edits invalidate retained bond confirmation in the real section',async()=>{
 const data=actualInvestmentYearData('2025');const row=data.interestEntries[0];Object.assign(row,{taxExemptInterest:'500',privateActivityBondInterest:'125',pabSourceTaxYear:'2025',pabSourceId:'Synthetic actual bond preference original',pabRecipientAmountsConfirmed:'true',pabOtherwiseAllowableDeduction:'0',pabDeductionAllowanceAndNoDuplicationConfirmed:'true'});let latest=data;
 function Harness(){const[current,set]=useState(data);return <SectionInvestmentIncome {...current} onInterestEntriesChange={interestEntries=>{latest={...current,interestEntries};set(latest);}} onDividendEntriesChange={dividendEntries=>{latest={...current,dividendEntries};set(latest);}} onBrokerageEntriesChange={brokerageEntries=>{latest={...current,brokerageEntries};set(latest);}}/>;}
 const dom=await mountGuidedPanel(<Harness/>);try{
  await dom.expand('Remaining actual 1099-INT boxes');await dom.change('Actual 1099-INT calendar year','2026');
  const changed=latest.interestEntries[0];expect(Reflect.get(changed,'sourceTaxYear')).toBe('2026');expect(changed.pabRecipientAmountsConfirmed).toBe('');expect(changed.pabDeductionAllowanceAndNoDuplicationConfirmed).toBe('');expect(changed.taxExemptInterest).toBe('500');expect(changed.privateActivityBondInterest).toBe('125');expect(investmentFactErrors(latest,'single',2025)).toHaveProperty('interest-0-year');
 }finally{await dom.dispose();}
});
