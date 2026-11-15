// @vitest-environment jsdom
// Spec: spec/federal/guided-eic-unassessed-petition.yaml.
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {SectionPersonalInfo} from '@/components/guided-interview/section-personal-info';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
import {guidedEicPetitionState,historyVisibleEntries,petitionVisibleEntries,historyConfirmationEntries} from '../../fixtures/guided-eic-unassessed-petition';
function required<T>(value:T|null|undefined):T{if(value==null)throw Error('Missing explicit original');return value;}
it('collects visible originals without defaults and revokes confirmation after edits',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const element=document.createElement('div');document.body.appendChild(element);const root=createRoot(element);
 let latest=guidedEicPetitionState();delete required(latest.sectionData['personal-info']).eicDisallowanceHistory;
 function Harness(){const[state,setState]=useState(latest);return <SectionPersonalInfo data={state.sectionData['personal-info']} filingStatus="single" onDataChange={data=>{latest=updateSectionData(state,'personal-info',data);setState(latest);}}/>;}
 function field(label:string){return required([...element.querySelectorAll('label')].find(node=>node.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select'));}
 async function change(label:string,value:string){const input=field(label);await act(async()=>{Object.getOwnPropertyDescriptor(input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')?.set?.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
 async function click(label:string){const button=required([...element.querySelectorAll('button')].find(node=>node.textContent===label));await act(async()=>button.click());}
 const proof=()=>required(latest.sectionData['personal-info']?.eicDisallowanceHistory?.filers?.[0]?.denials?.[0]?.unassessedTaxCourtPetition);
 try{
  await act(async()=>root.render(<Harness/>));await click('Add EIC denial and allowance history');await click('Copy actual filer identities');await click('Primary filer: record no later IRS allowances');await click('Primary filer: add an actual EIC denial');
  await click('Primary filer denial 1: add original unassessed Tax Court petition');expect(proof().assessmentDate).toBeUndefined();expect(field('Primary filer denial 1 petition: original petitioner owner').value).toBe('');
  for(const[label,value]of historyVisibleEntries)await change(label,value);
  for(const[label,value]of petitionVisibleEntries)await change(`Primary filer denial 1 petition: ${label}`,value);
  for(const[label,value]of historyConfirmationEntries)await change(label,value);
  expect(latest.sectionData['personal-info']?.eicDisallowanceHistory?.filers?.[0]?.allHistoryIncluded).toBe(true);
  const input=required(buildTaxInputFromGuidedData(latest));expect(calculateFederalTax(TaxYearInputSchema.parse(input)).allLines.find(line=>line.form==='1040'&&line.line==='27a')?.value.toFixed()).toBe('649');
  expect(proof().sourceFactsConfirmed).toBe(true);expect(proof().assessmentDate).toBeNull();expect(element.textContent).toContain('Pending appeal alone is insufficient');
  await change('Primary filer denial 1 petition: assessment original status','');expect(proof().assessmentDate).toBeUndefined();expect(proof().sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(latest)).toBeNull();
  await change('Primary filer denial 1 petition: assessment original status','date');expect(proof().assessmentDate).toBe('');await change('Primary filer denial 1 petition: assessment actual event date','2025-12-02');expect(proof().assessmentDate).toBe('2025-12-02');
  await change('Primary filer denial 1 petition: assessment original status','none');await change('Primary filer denial 1 petition: actual timely filing confirmed from originals','false');expect(proof().actualTimelyPetitionConfirmed).toBe(false);await change('Primary filer denial 1 petition: actual timely filing confirmed from originals','');expect(proof().actualTimelyPetitionConfirmed).toBeNull();
  await change('Primary filer denial 1 petition: actual timely filing confirmed from originals','true');for(const[label,value]of historyConfirmationEntries)await change(label,value);expect(buildTaxInputFromGuidedData(latest)).not.toBeNull();
  await change('Primary filer denial 1 petition: court docket source reference','Edited private docket');expect(proof().sourceFactsConfirmed).toBeNull();expect(latest.sectionData['personal-info']?.eicDisallowanceHistory?.sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(latest)).toBeNull();
  await click('Remove primary filer denial 1 petition petition originals');expect(latest.sectionData['personal-info']?.eicDisallowanceHistory?.filers?.[0]?.denials?.[0]?.appealPending).toBe(true);expect(buildTaxInputFromGuidedData(latest)).toBeNull();
 }finally{await act(async()=>root.unmount());element.remove();}
});
