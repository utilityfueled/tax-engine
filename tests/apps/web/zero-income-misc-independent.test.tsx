// @vitest-environment jsdom
// Spec: spec/state/zero-income-misc-independent.yaml
import React,{useState} from 'react';
import {it,expect} from 'vitest';
import {SectionStateReturn} from '@/components/guided-interview/section-state-return';
import type {StateReturnData} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {TaxYearInputSchema} from '@/models/inputs';
import {fictionalMiscFlow,miscRows} from '../../fixtures/guided-zero-income-misc';
import {mountGuidedPanel} from './guided-panel-dom';
async function panel(prefilled=false){
 const f=fictionalMiscFlow(prefilled?undefined:[]);let latest=f;
 function Harness(){const[data,setData]=useState(f.sectionData['state-return']);return <SectionStateReturn stateCode="PA" taxYear={2025} filingStatus="single" data={data} guidedPreview={null} originalInput={null} onDataChange={(next:StateReturnData)=>{latest={...f,sectionData:{...f.sectionData,'state-return':next}};setData(next);}}/>;}
 const dom=await mountGuidedPanel(<Harness/>);return{dom,flow:()=>latest,rows:()=>miscRows(latest)};
}
it('blank native row only confirms after every separately entered original and remittance fact',async()=>{
 const p=await panel();try{
  await p.dom.click('Add actual zero-income MISC original');expect(p.rows()[0].sourceTaxYear).toBe('');expect(p.rows()[0].recipientSsn).toBe('');
  const values:Record<string,string>={
   'original identifier':'Independent native original','original account reference':'Independent private account','original tax year':'2025','payer name':'Independent actual payer','payer TIN':'98-7654321','recipient first name including middle initial':'Jordan','recipient last name':'Example','Box 17 payer state identifier':'Actual independent state ID','recipient SSN':'111-22-3333','original owner':'primary','original form revision':'2025-04','original state reporting':'single','Box 17 state':'PA',
   'Box 1 rents':'0','Box 2 royalties':'0','Box 3 other income':'0','Box 4 federal withholding':'0','Box 5 fishing boat proceeds':'0','Box 6 medical payments':'0','Box 8 substitute payments':'0','Box 9 crop insurance':'0','Box 10 attorney proceeds':'0','Box 11 fish purchased for resale':'0','Box 12 section 409A deferrals':'0','Box 15 nonqualified deferred compensation':'0','Box 16 state withholding':'0.20','Box 18 state income':'0',
   'Box 7 direct sales apply':'false','FATCA filing requirement applies':'false','No legacy or newer-revision compensation amounts apply':'true','This is the actual current original':'true','Corrected original':'false','Void original':'false','Every original box has been checked, including actual zero or blank boxes':'true',
   'actual remittance record reference':'Actual independent bank statement','actual remittance confirmation':'Actual independent receipt','actual remittance tax year':'2025','actual remittance state':'PA','actual remittance payer TIN':'98-7654321','actual remittance account reference':'Independent private account','actual remittance recipient SSN':'111-22-3333','actual remittance paid date':'2026-01-15','actual remittance record asof date':'2026-03-01','actual remittance amount':'0.20','Actual state withholding was remitted':'true',
  };
  for(const [label,value]of Object.entries(values))await p.dom.change(`MISC 1 ${label}`,value);
  await p.dom.click('Confirm actual zero-income MISC original 1');expect(p.rows()[0].sourceFactsConfirmed).toBeNull();expect(p.rows()[0].remittance.notRefundedByPayerConfirmed).toBeNull();
  await p.dom.change('MISC 1 Payer has not refunded this withholding','true');await p.dom.click('Confirm actual zero-income MISC original 1');expect(p.rows()[0].sourceFactsConfirmed).toBe(true);
  const out=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(p.flow()));expect(out.form1099Misc).toHaveLength(1);expect(out.form1099Misc[0].stateWithheld).toBe('0.20');expect(out.paResidencySources).toBeUndefined();expect(out.paOrdinaryReturnFacts).toBeUndefined();expect(out.paOrdinaryReturnCompletionSources).toBeUndefined();
 }finally{await p.dom.dispose();}
});
it('native remittance edit clears confirmation and keeps exact previous private original',async()=>{
 const p=await panel(true);try{
  const saved=structuredClone(p.rows()[0].confirmedOriginal);await p.dom.change('MISC 1 actual remittance amount','0.21');expect(p.rows()[0].sourceFactsConfirmed).toBeNull();expect(p.rows()[0].confirmedOriginal).toEqual(saved);expect(buildTaxInputFromGuidedData(p.flow())).toBeNull();
  await p.dom.click('Confirm actual zero-income MISC original 1');expect(p.rows()[0].sourceFactsConfirmed).toBeNull();expect(p.rows()[0].confirmedOriginal).toEqual(saved);
  await p.dom.change('MISC 1 actual remittance amount','0.20');await p.dom.click('Confirm actual zero-income MISC original 1');expect(p.rows()[0].sourceFactsConfirmed).toBe(true);expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(p.flow())).form1099Misc[0].stateWithheld).toBe('0.20');
 }finally{await p.dom.dispose();}
});
it('native private recipient inputs are masked and original values stay out of rendered prose',async()=>{
 const p=await panel(true);try{
  expect(p.dom.control('MISC 1 recipient SSN').type).toBe('password');expect(p.dom.control('MISC 1 actual remittance recipient SSN').type).toBe('password');
  expect(p.dom.container.textContent).not.toContain('111-22-3333');expect(p.dom.container.textContent).not.toContain('Fictional private source account A');expect(p.dom.container.querySelector('textarea')).toBeNull();
  await p.dom.click('Remove zero-income MISC original 1');expect(p.rows()).toEqual([]);expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(p.flow())).form1099Misc).toEqual([]);
 }finally{await p.dom.dispose();}
});
