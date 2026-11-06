// @vitest-environment jsdom
// Spec: spec/state/guided-pa-royalty-sources.yaml.
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {SectionRoyaltyIncome} from '@/components/guided-interview/section-royalty-income';
import type {RoyaltyIncomeData} from '@/lib/guided-royalty-sources';
import {actualGuidedRoyaltySources} from '../../fixtures/guided-royalty-sources';
import {mountGuidedPanel} from './guided-panel-dom';
it('collects PA property classification without inventing receipt answers',async()=>{
 let latest:RoyaltyIncomeData|undefined=actualGuidedRoyaltySources();
 function Harness(){const[data,setData]=useState(latest);return <SectionRoyaltyIncome stateCode="PA" taxYear={2025} data={data} onDataChange={next=>{latest=next;setData(next);}}/>;}
 const panel=await mountGuidedPanel(<Harness/>);
 try{
  await panel.click('Add property 1 PA classification');
  expect(latest?.properties?.[0].paTreatment?.ownerFullYearPAResident).toBeUndefined();
  expect(latest?.properties?.[0].paTreatment?.expenses).toBeUndefined();
  await panel.click('Copy property 1 PA originals');
  expect(latest?.properties?.[0].paTreatment).toMatchObject({sourceTaxYear:'2025',accountHolder:'primary',propertyType:'copyright'});
  expect(latest?.properties?.[0].paTreatment?.expenses?.[0]).toMatchObject({sourceId:'receipt-legal',paidDate:'2025-02-15',amountPaid:'49.25'});
  expect(latest?.properties?.[0].paTreatment?.expenses?.[0].surfaceRights).toBeUndefined();
  await panel.change('Property 1 PA classification source reference','Private actual PA classification');
  await panel.change('Property 1 PA Was this owner a full-year Pennsylvania resident?','true');
  await panel.change('Property 1 PA actual income class','royalties-copyrights-patents');
  await panel.change('Property 1 PA expense 1 Is this a net income tax?','false');
  await panel.change('Property 1 PA expense 1 Does this expense relate to surface rights?','false');
  await panel.change('Property 1 PA expense 1 Does this expense relate to the actual royalty rights?','true');
  await panel.change('Property 1 PA classification checked after the last edit','true');
  expect(latest?.properties?.[0].paTreatment?.sourceFactsConfirmed).toBe(true);
  await panel.change('Property 1 expense 1 actual amount paid','49.26');
  expect(latest?.properties?.[0].paTreatment?.sourceFactsConfirmed).toBeNull();
  expect(latest?.properties?.[0].paTreatment?.expenses?.[0].amountPaid).toBe('49.25');
  await panel.click('Copy property 1 PA originals');
  expect(latest?.properties?.[0].paTreatment?.expenses?.[0].amountPaid).toBe('49.26');
  expect(latest?.properties?.[0].paTreatment?.expenses?.[0].netIncomeTax).toBe(false);
  await panel.change('Property 1 PA Was this owner a full-year Pennsylvania resident?','');
  expect(latest?.properties?.[0].paTreatment?.ownerFullYearPAResident).toBeNull();
  await panel.click('Mark property 1 PA receipt ledger unknown');expect(latest?.properties?.[0].paTreatment?.expenses).toBeUndefined();
  await panel.click('Remove property 1 PA classification');expect(latest?.properties?.[0].paTreatment).toBeUndefined();
 }finally{await panel.dispose();}
});
