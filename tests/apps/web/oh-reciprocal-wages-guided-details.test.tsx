// @vitest-environment jsdom
/** Spec: state/oh-reciprocal-wages-guided.yaml. Actual blank-to-confirm entry, not stored JSON injection. */
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {OhioReciprocalWagesDetails} from '@/components/guided-interview/ohio-reciprocal-wages-details';
import {buildGuidedOhioReciprocalWages,type OhioReciprocalWagesDraft} from '@/lib/guided-oh-reciprocal-wages';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/index';
import {mountGuidedPanel} from './guided-panel-dom';
import {guidedReciprocalWageFixture,reciprocalRequired as required,reciprocalNativeFields,reciprocalPayrollNativeFields,reciprocalConfirmLabel} from '../../fixtures/guided-oh-reciprocal-wages-complete';
async function mount(initial:OhioReciprocalWagesDraft|undefined,f=guidedReciprocalWageFixture()){
 let latest=initial;
 function Harness(){const[data,set]=useState(initial);return <OhioReciprocalWagesDetails originalInput={f.original} ohioResidency={f.residency} ohioPayments={f.payments} data={data} taxYear={2025} onChange={next=>{latest=next;set(next);}}/>;}
 return{f,panel:await mountGuidedPanel(<Harness/>),draft:()=>required(latest)};
}
it('collects actual reciprocal originals from blank controls before confirmation',async()=>{
 const h=await mount(undefined);try{
  await h.panel.click('Add actual Pennsylvania employee reciprocity sources');
  expect(h.draft().sourceTaxYear).toBeNull();expect(h.draft().accountHolder).toBe('');expect(h.draft().w2Index).toBeNull();expect(h.draft().originalW2).toBeUndefined();expect(h.draft().sourceFactsConfirmed).toBeNull();expect(h.draft().payrollRows).toEqual([]);
  await h.panel.change('Ohio reciprocal selected W2 original','0');await h.panel.change('Ohio reciprocal current W2 originals checked','true');
  await h.panel.click('Copy explicitly checked current W2 original');
  expect(h.draft().originalW2).toEqual(required(h.f.original.w2s[0]));expect(h.draft().originalTaxpayer).toEqual({firstName:'',lastName:'',ssn:''});expect(h.draft().sourceFactsConfirmed).toBeNull();
  for(const[label,value]of reciprocalNativeFields(h.f))await h.panel.change(label,value);
  for(let i=0;i<h.f.draft.payrollRows.length;i++){await h.panel.click('Add actual reciprocal payroll original');for(const[label,value]of reciprocalPayrollNativeFields(h.f,i))await h.panel.change(label,value);}
  await h.panel.click(reciprocalConfirmLabel);expect(h.draft().sourceFactsConfirmed).toBe(true);
  const packet=buildGuidedOhioReciprocalWages(h.f.original,h.draft(),h.f.residency,h.f.payments);expect(packet.reciprocalWageSources).toEqual(h.f.source);
  const result=calculateOhioResidentReturnFromFederal({taxInput:{...h.f.original,ohioResidency:packet,ohioPayments:h.f.canonical.ohioPayments},federalResult:calculateFederalTax(h.f.original)});expect(result.it1040.line26_refund.toString()).toBe('2001');expect(result.it1040.line3_ohioAgi.toString()).toBe('0');expect(result.nonresidentCreditResult?.line20.toString()).toBe('0');expect(h.panel.container.querySelector('textarea')).toBeNull();
 }finally{await h.panel.dispose();}
});
it('preserves actual zero and revoked unknown sources across restored native controls',async()=>{
 const f=guidedReciprocalWageFixture('60000.25','0'),draft=structuredClone(f.draft);draft.sourceFactsConfirmed=null;draft.serviceOriginal.totalCompensation='';const saved=JSON.parse(JSON.stringify(draft)),h=await mount(saved,f);try{
  expect(h.draft().payrollRows).toHaveLength(12);expect(required(h.draft().payrollRows[0]).ohioWithheld).toBe('0.00');expect(h.draft().serviceOriginal.totalCompensation).toBe('');expect(h.draft().sourceFactsConfirmed).toBeNull();await h.panel.click(reciprocalConfirmLabel);expect(h.draft().sourceFactsConfirmed).not.toBe(true);expect(h.draft()).toEqual(saved);expect(h.panel.control('Reciprocal payroll 1 actual Ohio withheld').value).toBe('0.00');expect(h.panel.control('Reciprocal services actual total compensation').value).toBe('');
 }finally{await h.panel.dispose();}
});
it.each([['Ohio reciprocal source reference','Actual changed source reference'],['Ohio reciprocal original SSN','900-70-0999'],['Reciprocal domicile original ID','Actual changed domicile original'],['Reciprocal employer actual corporate employee classification reviewed','false'],['Reciprocal services actual total compensation',''],['Reciprocal payroll 1 actual paid date','2025-02-01'],['All actual reciprocal income originals included','']]as const)('revokes reciprocal native confirmation and retains original commitments after %s',async(label,value)=>{
 const f=guidedReciprocalWageFixture(),before=structuredClone(f.draft),h=await mount(f.draft,f);try{await h.panel.change(label,value);expect(h.draft().sourceFactsConfirmed).not.toBe(true);expect(h.draft().originalW2).toEqual(before.originalW2);expect(h.draft().originalFederalSources).toEqual(before.originalFederalSources);expect(h.draft().originalResidencySources).toEqual(before.originalResidencySources);expect(h.draft().originalPaymentSources).toEqual(before.originalPaymentSources);expect(f.draft).toEqual(before);}finally{await h.panel.dispose();}
});
it('does not confirm without the actual current original input context',async()=>{
 const f=guidedReciprocalWageFixture(),panel=await mountGuidedPanel(<OhioReciprocalWagesDetails originalInput={null} ohioResidency={f.residency} ohioPayments={f.payments} data={f.draft} taxYear={2025} onChange={()=>{throw Error('No source changes without actual current original context');}}/>);try{const buttons=[...panel.container.querySelectorAll('button')].filter(button=>button.textContent===reciprocalConfirmLabel);expect(buttons).toHaveLength(1);expect(required(buttons[0]).disabled).toBe(true);expect(panel.container.textContent).not.toContain('Actual reciprocal wage sources explicitly confirmed.');}finally{await panel.dispose();}
});
