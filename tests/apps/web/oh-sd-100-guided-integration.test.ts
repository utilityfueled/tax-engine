// @vitest-environment jsdom
/** Spec: state/oh-sd-100-guided.yaml. Existing APIs only: genuine behavior RED distinct from future modules. */
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {snapshotGuidedOhioOriginals} from '@/lib/guided-ohio-residency-facts';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {updateSectionData,validateSection,type StateReturnData} from '@/lib/guided-interview-flow';
import {SectionStateReturn} from '@/components/guided-interview/section-state-return';
import {mountGuidedPanel} from './guided-panel-dom';
import {guidedSchoolDistrictFixture,required,attachSchoolDraft,readSchoolDraft,rawOhioOriginals,enteredSchoolDraft} from '../../fixtures/guided-oh-school-district-complete';
it('SD native baseline fictional current originals reconcile before guide changes',()=>{
 for(const mode of ['withholding','estimates','election']as const){const f=guidedSchoolDistrictFixture(mode),before=structuredClone(f),fed=calculateFederalTax(f.canonical),oh=calculateOhioResidentReturn(buildOhioResidentReturnInput(f.canonical,fed)),sd=required(oh.sd100);
  expect(fed.totalWages.toString()).toBe('80000');expect(fed.agi.toString()).toBe('80000');
  expect(sd.line7_earnedIncomeTax.toString()).toBe('1000');expect(sd.line11_sdWithholding.toString()).toBe(mode==='estimates'?'600':'1100');expect(sd.line12_estimatedPayments.toString()).toBe(mode==='estimates'?'400':'0');expect(sd.line21_refund.toString()).toBe(mode==='estimates'?'0':mode==='election'?'75':'100');
  expect(oh.it1040.line14_ohioWithholding.toString()).toBe('3000');expect(f.original).not.toHaveProperty('ohioSchoolDistrict');expect(f).toEqual(before);
 }
});
async function mountExisting(){const f=guidedSchoolDistrictFixture(),initial=structuredClone(f.data);Reflect.deleteProperty(initial,'ohioSchoolDistrict');let latest=initial;
 function Harness(){const[data,set]=useState(initial);return React.createElement(SectionStateReturn,{stateCode:'OH',originalInput:f.original,taxYear:2025,filingStatus:'single',data,guidedPreview:null,onDataChange:(next:StateReturnData)=>{latest=next;set(next);}});}
 return{f,panel:await mountGuidedPanel(React.createElement(Harness)),data:()=>latest};
}
it('SD native existing section offers absent packet origination',async()=>{const h=await mountExisting();try{await h.panel.click('Add actual Ohio school district source facts');const d=readSchoolDraft(h.data());expect(d.sourceFactsConfirmed).not.toBe(true);expect(d.taxYear).toBe('');expect(d.payments.account.estimatedPaymentsCredited).toBe('');expect(d.payments.priorReturn.status).toBe('');}finally{await h.panel.dispose();}});
it.each(['All actual federal income and adjustment sources included','Actual sources contain no business income requiring Ohio apportionment'])('SD native fullresident actual district exposes required source question %s',async label=>{const h=await mountExisting();try{expect(h.panel.control(label)).toBeTruthy();}finally{await h.panel.dispose();}});
it('SD native normal bridge replays the actual third packet without preattachment',()=>{const f=guidedSchoolDistrictFixture(),before=structuredClone(f);const actual=buildGuidedStateOriginals(f.original,f.state);expect(actual.ohioSchoolDistrict).toEqual(f.facts);expect(actual.ohioResidency?.originalFederalSources).toEqual(f.original);expect(actual.ohioPayments?.originalFederalSources).toEqual(f.original);expect(f).toEqual(before);});
it('SD native navigation blocks missing actual district packet without losing federal',()=>{const f=guidedSchoolDistrictFixture();attachSchoolDraft(f.data,undefined);const raw=buildTaxInputFromGuidedData(f.state),before=structuredClone(f.state),v=validateSection(f.state,'state-return');expect(v.status).toBe('partial');expect(v.allowSkip).toBe(false);expect(Object.keys(v.fieldErrors??{}).join(' ')).toMatch(/school|district/i);expect(buildTaxInputFromGuidedData(f.state)).toEqual(raw);expect(f.state).toEqual(before);});
it('SD native raw snapshot excludes exactly three Ohio roots',()=>{const f=guidedSchoolDistrictFixture(),before=structuredClone(f.canonical);expect(snapshotGuidedOhioOriginals(f.canonical)).toEqual(rawOhioOriginals(f.canonical));expect(f.canonical).toEqual(before);});
const editKinds=['school record','school amount','residency record','IT payment record','owner','W2 employer']as const;
it.each(editKinds)('SD native flow invalidates district confirmation for actual edit %s',kind=>{const f=guidedSchoolDistrictFixture(),old=structuredClone(f.draft.originalFederalSources);let next;
 if(kind==='owner'){const p=required(f.state.sectionData['personal-info']);next=updateSectionData(f.state,'personal-info',{...p,lastName:'Changed actual owner'});}
 else if(kind==='W2 employer'){const w=required(f.state.sectionData['income-w2']);next=updateSectionData(f.state,'income-w2',{entries:w.entries.map(row=>({...row,employerName:'Changed actual employer'}))});}
 else{const data=structuredClone(f.data);if(kind==='school record')readSchoolDraft(data).sourceReference='Edited actual district reference';if(kind==='school amount')readSchoolDraft(data).payments.refundDisposition.outgoingCarryforward='25';if(kind==='residency record')required(data.ohioResidency).sourceReference='Edited actual Ohio domicile';if(kind==='IT payment record')required(data.ohioPayments).sourceReference='Edited actual IT account';next=updateSectionData(f.state,'state-return',data);}
 const changed=readSchoolDraft(required(next.sectionData['state-return']));expect(changed.sourceFactsConfirmed).not.toBe(true);expect(changed.originalFederalSources).toEqual(old);expect(f.draft.sourceFactsConfirmed).toBe(true);
});
it.each(['withholding','estimates','election']as const)('SD native preview retains separate district tax payment and refund %s',mode=>{const f=guidedSchoolDistrictFixture(mode),before=structuredClone(f.state),preview=required(computeGuidedPreview(f.state)),state=required(preview.state),district=Reflect.get(state,'schoolDistrict');expect(district).toMatchObject({districtCode:'0302',districtName:'Hillsdale LSD',taxYear:2025,taxType:'earned_income',earnedIncome:'80000',tax:'1000',withholding:mode==='estimates'?'600':'1100',estimatedPayments:mode==='estimates'?'400':'0',priorCredit:'0',totalPayments:mode==='estimates'?'1000':'1100',overpayment:mode==='estimates'?'0':'100',outgoingCarryforward:mode==='election'?'25':'0',refund:mode==='estimates'?'0':mode==='election'?'75':'100',amountOwed:'0'});expect(state.stateWithholding).toBe('3000');const publicText=JSON.stringify(district);for(const secret of [f.original.taxpayer.primary.ssn,f.original.taxpayer.address.street,f.facts.sourceReference,f.facts.payments.account.sourceReference])expect(publicText).not.toContain(secret);expect(f.state).toEqual(before);});
it('SD native missing district preview preserves federal without completed Ohio',()=>{const f=guidedSchoolDistrictFixture();attachSchoolDraft(f.data,undefined);const preview=required(computeGuidedPreview(f.state));expect(preview.totalIncome).toBe('80000');expect(preview.state).toBeNull();});
it('SD native no-op and confirmation-only transition retain confirmed records',()=>{const f=guidedSchoolDistrictFixture(),same=updateSectionData(f.state,'state-return',structuredClone(f.data));expect(readSchoolDraft(required(same.sectionData['state-return'])).sourceFactsConfirmed).toBe(true);const unconfirmed=structuredClone(f.state),data=required(unconfirmed.sectionData['state-return']);readSchoolDraft(data).sourceFactsConfirmed=null;const next=updateSectionData(unconfirmed,'state-return',structuredClone(f.data));expect(readSchoolDraft(required(next.sectionData['state-return'])).sourceFactsConfirmed).toBe(true);});
it('SD native JSON saved source replay never refreshes retained originals',()=>{const f=guidedSchoolDistrictFixture(),saved=JSON.parse(JSON.stringify(f.state)),before=structuredClone(saved);expect(buildGuidedStateOriginals(f.original,saved).ohioSchoolDistrict).toEqual(f.facts);expect(saved).toEqual(before);});

// Separately authored fictional filed original and current credited-account proof.
// These records are not inferred from withholding, calculated tax, or an empty account.
it('SD native public cash estimates exclude separately shown actual prior credit',()=>{
 const f=guidedSchoolDistrictFixture(),facts=structuredClone(f.facts);
 facts.payments.priorReturn={status:'filed_return',sourceReference:'FICTIONAL separately entered2024SD100 original',taxYear:2024,returnType:'sd100',districtCode:'0302',accountName:'Avery School',accountSsn:'900-70-0302',filingStatus:'single',periodStart:'2024-01-01',periodEnd:'2024-12-31',returnKind:'original',filedDate:'2025-04-15',filingExtension:{kind:'none'},line8:'0',line19:'100',electedCreditCarryforward:'100'};
 facts.payments.priorCreditCarryforward={status:'actual_credit',sourceReference:'FICTIONAL actual credited prior election100',accountHolder:'primary',accountSsn:'900-70-0302',electedAmount:'100',availableForThisReturn:'100',appliedToThisReturnConfirmed:true};
 facts.payments.account.priorCreditApplied='100';facts.payments.account.estimatedPaymentsCredited='0';
 const draft=enteredSchoolDraft(facts);draft.sourceFactsConfirmed=true;draft.originalFederalSources=structuredClone(f.original);attachSchoolDraft(f.data,draft);
 const before=structuredClone(f.state),current=buildGuidedStateOriginals(f.original,f.state),actual=calculateOhioResidentReturn(buildOhioResidentReturnInput(current,calculateFederalTax(f.original))),sd=required(actual.sd100);
 expect(sd.line12_estimatedPayments.toString()).toBe('100');expect(sd.line13_totalPayments.toString()).toBe('1200');expect(sd.line21_refund.toString()).toBe('200');
 const state=required(required(computeGuidedPreview(f.state)).state);expect(state.schoolDistrict).toMatchObject({estimatedPayments:'0',priorCredit:'100',withholding:'1100',totalPayments:'1200',refund:'200'});expect(state.stateWithholding).toBe('3000');expect(f.state).toEqual(before);
});
