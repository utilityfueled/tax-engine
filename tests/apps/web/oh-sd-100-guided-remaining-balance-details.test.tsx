// @vitest-environment jsdom
/** Spec: state/oh-sd-100-guided-remaining-balance.yaml. New payment proof is typed visibly. */
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {OhioSchoolDistrictDetails} from '@/components/guided-interview/ohio-school-district-details';
import type {OhioSchoolDistrictDraft} from '@/lib/guided-ohio-school-district-facts';
import {mountGuidedPanel} from './guided-panel-dom';
import {guidedSchoolBalanceFixture,balanceVisibleFields} from '../../fixtures/guided-oh-sd-100-remaining-balance';
import {required,sdConfirmLabel} from '../../fixtures/guided-oh-school-district-complete';
it('visibly enters current-original receipt confirms and invalidates after edits',async()=>{
 const f=guidedSchoolBalanceFixture('unpaid');let latest=f.draft;
 function Harness(){const[data,set]=useState<OhioSchoolDistrictDraft>(f.draft);return <OhioSchoolDistrictDetails originalInput={f.original} ohioResidency={f.data.ohioResidency} ohioPayments={f.data.ohioPayments} data={data} taxYear={2025} onChange={next=>{latest=required(next);set(latest);}}/>;}
 const panel=await mountGuidedPanel(<Harness/>);
 try{for(const[label,value]of balanceVisibleFields)await panel.change(label,value);await panel.change('School balance original tax year','');await panel.click(sdConfirmLabel);expect(latest.sourceFactsConfirmed).not.toBe(true);await panel.change('School balance original tax year','2025');await panel.click(sdConfirmLabel);expect(latest.sourceFactsConfirmed).toBe(true);await panel.change('School balance original confirmation number','EDITED-PRIVATE-RECEIPT');expect(latest.sourceFactsConfirmed).toBeNull();await panel.change('School remaining tax payment status','unpaid');await panel.click(sdConfirmLabel);expect(latest.sourceFactsConfirmed).not.toBe(true);expect(panel.container.textContent).toContain('remain saved');}finally{await panel.dispose();}
});
