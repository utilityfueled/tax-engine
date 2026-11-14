// @vitest-environment jsdom
// Spec: spec/federal/guided-cod-principal-residence.yaml actual-panel-confirmation.
import React,{useState} from 'react';
import { expect,it } from 'vitest';
import { SectionAdjustments } from '@/components/guided-interview/section-adjustments';
import { updateSectionData,type GuidedFlowState } from '@/lib/guided-interview-flow';
import { invalidateGuidedCodPrincipalResidence } from '@/lib/guided-cod-principal-residence';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { guidedPrincipalResidenceState } from '../../fixtures/guided-cod-principal-residence';
import { mountGuidedPanel } from './guided-panel-dom';

it('retains actual panel reviews until an original fact changes',async()=>{
  let latest:GuidedFlowState=guidedPrincipalResidenceState();
  const actual=latest.sectionData.adjustments?.codPrincipalResidenceSources;if(!actual||!latest.sectionData.adjustments)throw Error('Missing actual originals');
  latest.sectionData.adjustments.codPrincipalResidenceSources=invalidateGuidedCodPrincipalResidence(actual);
  function Harness(){const [state,setState]=useState(latest);return <SectionAdjustments taxYear={2025} hasSelfEmployment={false} hasStudentLoans={false} hasHsa={false} data={state.sectionData.adjustments} onDataChange={data=>{
    latest=updateSectionData(state,'adjustments',data);setState(latest);
  }}/>;}
  const panel=await mountGuidedPanel(<Harness/>);
  try{
    for(const label of ['Mortgage statement checked after the last edit','Original acquisition loan checked after the last edit',
      'Cancellation reason checked after the last edit','Residence basis history checked after the last edit','Residence cancellation packet checked after the last edit']){
      await panel.change(label,'true');expect(panel.control(label).value,label).toBe('true');
    }
    expect(buildTaxInputFromGuidedData(latest)).not.toBeNull();
    await panel.change('Mortgage Box2 canceled amount','100001');
    expect(panel.control('Mortgage statement checked after the last edit').value).toBe('');
    expect(panel.control('Residence cancellation packet checked after the last edit').value).toBe('');
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
  }finally{await panel.dispose();}
});
