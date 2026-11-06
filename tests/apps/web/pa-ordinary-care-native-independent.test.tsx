// @vitest-environment jsdom
// Spec: spec/state/pa-ordinary-care-native-independent.yaml.
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {PACareSourcesDetails} from '@/components/guided-interview/pa-care-sources-details';
import {PAOrdinaryReturnCompletionDetails} from '@/components/guided-interview/pa-ordinary-return-completion-details';
import {emptyGuidedPACareSources,emptyGuidedPACarePayment,buildGuidedPACareSources,confirmGuidedPACareSources} from '@/lib/guided-pa-care-sources';
import {confirmGuidedPAOrdinaryReturnCompletionSources,type GuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {paOrdinaryCareFixture} from '../../fixtures/pa-ordinary-care-sources';
import {mountGuidedPanel} from './guided-panel-dom';
function twoPersons(){
 const f=paOrdinaryCareFixture(),c=f.input.dependentCare;if(!c?.providers||!c.qualifyingPersons)throw Error('Actual provider/person originals required');
 const second={...f.input.taxpayer.dependents[0],firstName:'Another',ssn:'900-70-0313',dateOfBirth:'2018-03-04'};
 f.input.taxpayer.dependents.push(second);f.facts.filing.dependentChildren.push({...f.facts.filing.dependentChildren[0],sourceReference:'Independent actual second child original',originalIndex:1,originalFederalDependent:structuredClone(second)});
 c.expenses='6000';c.qualifyingIndividuals=2;c.providers[0].amountPaid='6000';c.qualifyingPersons.push({...c.qualifyingPersons[0],firstName:second.firstName,taxId:second.ssn});
 const packet=f.sources.care.careSources,receipt=structuredClone(packet.payments[0]);Object.assign(receipt,{sourceReference:'Independent second actual receipt',qualifyingPersonIndex:1});Object.assign(receipt.originalReceipt,{receiptNumber:'Independent second care3000',qualifyingPersonName:'Another Pennsylvania',qualifyingPersonTin:second.ssn});packet.payments.push(receipt);
 f.sources.care.originalCarePayments.push({...f.sources.care.originalCarePayments[0],sourceReference:receipt.sourceReference,documentName:'Independent second actual care receipt'});
 packet.originalDependentCare=structuredClone(c);f.facts.disposition.refundRequested='1200';f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);return f;
}
async function mountParent(initial=paOrdinaryCareFixture().sources,f=paOrdinaryCareFixture()){
 let latest:GuidedPAOrdinaryReturnCompletionSources=structuredClone(initial),calls=0;
 function Harness(){const[d,set]=useState(latest);return <PAOrdinaryReturnCompletionDetails originalInput={f.input} ordinaryFacts={f.facts} data={d} onChange={next=>{if(!next)throw Error('Retain original draft');latest=next;calls++;set(next);}}/>;}
 const panel=await mountGuidedPanel(<Harness/>);return{panel,draft:()=>latest,calls:()=>calls,f};
}
it('independent native care opens and reopens without changing actual originals',async()=>{
 const f=paOrdinaryCareFixture(),before=structuredClone(f),h=await mountParent(f.sources,f);
 try{expect(h.calls()).toBe(0);expect(h.draft()).toEqual(before.sources);expect(f).toEqual(before);const saved=JSON.parse(JSON.stringify(h.draft()));const reopened=await mountParent(saved,f);try{expect(reopened.calls()).toBe(0);expect(reopened.draft()).toEqual(saved);}finally{await reopened.panel.dispose();}}finally{await h.panel.dispose();}
 let calls=0;const panel=await mountGuidedPanel(<PACareSourcesDetails originalInput={null} onChange={()=>calls++}/>);try{expect(calls).toBe(0);expect(panel.container.querySelectorAll('input')).toHaveLength(0);}finally{await panel.dispose();}
 const empty=emptyGuidedPACareSources(),row=emptyGuidedPACarePayment();expect(empty).toEqual({sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,originalDependentCare:{},payments:[]});expect(row.providerIndex).toBeNull();expect(row.qualifyingPersonIndex).toBeNull();expect(row.amount).toBe('');expect(row.originalAvailableConfirmed).toBeNull();
});
it('independent native care requires an explicit reviewed capture and preserves stale originals',async()=>{
 const f=paOrdinaryCareFixture(),h=await mountParent(f.sources,f),old=structuredClone(f.sources.care.careSources.originalDependentCare);
 try{await h.panel.click('Capture reviewed current federal care originals');expect(h.calls()).toBe(0);expect(h.panel.container.textContent).toMatch(/review/i);
 const care=f.input.dependentCare;if(!care?.providers)throw Error('Actual provider original required');care.providers[0].name='Changed actual care center';await h.panel.render(<PACareSourcesDetails originalInput={f.input} data={h.draft().care.careSources} onChange={()=>{throw Error('Read must not callback');}}/>);expect(h.draft().care.careSources?.originalDependentCare).toEqual(old);expect(()=>buildGuidedPACareSources(f.input,h.draft().care.careSources)).toThrow(/original|changed|stale/i);
 }finally{await h.panel.dispose();}
});
it('independent native care money retains blank zero and exact cents',async()=>{
 const h=await mountParent();try{for(const [raw,expected]of [['',''],['0','0'],['3,000.25','3000.25'],['3000.00','3000.00']]){await h.panel.change('Care receipt 1 actual amount',raw);expect(h.draft().care.careSources?.payments[0].amount).toBe(expected);expect(h.draft().care.careSources?.sourceFactsConfirmed).toBeNull();expect(h.draft().sourceFactsConfirmed).toBeNull();}await h.panel.change('Care receipt 1 original receipt amount','3,000.25');expect(h.draft().care.careSources?.payments[0].originalReceipt.amount).toBe('3000.25');}finally{await h.panel.dispose();}
});
const edits=[['PA care source tax year','2024'],['PA care collection original source reference','New actual collection'],['Care receipt 1 actual source reference','New receipt reference'],['Care receipt 1 actual provider',''],['Care receipt 1 actual qualifying person',''],['Care receipt 1 actual paid date','2025-12-14'],['Care receipt 1 actual service from','2025-02-01'],['Care receipt 1 actual service through','2025-11-30'],['Care receipt 1 actual amount','2999.99'],['Care receipt 1 original receipt number','Another receipt'],['Care receipt 1 original receipt date','2025-12-14'],['Care receipt 1 original receipt amount','2999.99'],['Care receipt 1 original provider name','Other care'],['Care receipt 1 original provider TIN','11-1111111'],['Care receipt 1 original qualifying person name','Other child'],['Care receipt 1 original qualifying person TIN','900-70-0399'],['Care receipt 1 actual original available and checked','false'],['Care receipt 1 actual employment-related expense checked','false'],['Care receipt 1 actual expense not claimed on another return checked','false'],['Care original source reference','Updated source group'],['Care payment original 1 document name','Updated actual original document'],['Care payment original 1 actual issuer name','Changed actual issuer'],['All actual employer benefits included in source review','false']]as const;
it.each(edits)('independent native care edit revokes both confirmations %s',async(label,value)=>{
 const h=await mountParent(),old=structuredClone(h.draft().care.careSources?.originalDependentCare);try{await h.panel.change(label,value);expect(h.draft().sourceFactsConfirmed).toBeNull();expect(h.draft().care.careSources?.sourceFactsConfirmed).toBeNull();expect(h.draft().care.careSources?.originalDependentCare).toEqual(old);}finally{await h.panel.dispose();}
});
it.each(['provider','person','amount','date','duplicate']as const)('independent native care confirmed source cannot bypass actual receipt replay %s',kind=>{
 const f=paOrdinaryCareFixture(),p=f.sources.care.careSources.payments[0];if(kind==='provider')p.originalReceipt.providerTin='11-1111111';if(kind==='person')p.originalReceipt.qualifyingPersonTin='900-70-0399';if(kind==='amount')p.originalReceipt.amount='3000.01';if(kind==='date'){p.paidOn='2024-12-15';p.originalReceipt.date=p.paidOn;}if(kind==='duplicate')f.sources.care.careSources.payments.push(structuredClone(p));
 const packet=confirmGuidedPACareSources(f.input,f.sources.care.careSources);const draft={...f.sources,care:{...f.sources.care,careSources:packet}};const confirmed=confirmGuidedPAOrdinaryReturnCompletionSources(f.input,draft,f.facts);expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,confirmed)).toThrow(/care|receipt|source|date|duplicate/i);
});
it('independent native care carries original one and two person money once',async()=>{
 for(const[f,credit,paid]of [[paOrdinaryCareFixture(),'600','3674'],[twoPersons(),'1200','4274']]as const){const h=await mountParent(f.sources,f),before=structuredClone(f);try{await h.panel.change('Actual federal care originals reviewed for this source collection','true');await h.panel.click('Capture reviewed current federal care originals');await h.panel.click('Confirm actual PA care payment records after the last edit');await h.panel.click('Confirm actual PA completion sources after the last edit');const r=calculatePAOrdinaryReturn(f.input,f.facts,h.draft());expect(r.pa40.totalPATaxableIncome.toString()).toBe('100120');expect(r.pa40.taxLiability.toString()).toBe('3074');expect(r.pa40.otherCredits.toString()).toBe(credit);expect(r.pa40.lines.find(row=>row.line==='24')?.value.toString()).toBe(paid);expect(r.refundDisposition.refund.toString()).toBe(credit);expect(f).toEqual(before);}finally{await h.panel.dispose();}}
});

it('independent native care new record capture does not infer a year payment or owner fact',async()=>{
 const f=paOrdinaryCareFixture();let latest=emptyGuidedPACareSources(),calls=0;function Harness(){const[d,set]=useState(latest);return <PACareSourcesDetails originalInput={f.input} data={d} onChange={next=>{if(!next)throw Error('Retain pending original');latest=next;calls++;set(next);}}/>;}
 const panel=await mountGuidedPanel(<Harness/>);try{expect(calls).toBe(0);await panel.change('Actual federal care originals reviewed for this source collection','true');expect(calls).toBe(0);await panel.click('Capture reviewed current federal care originals');expect(latest.originalDependentCare).toEqual(f.input.dependentCare);expect(latest.sourceTaxYear).toBeNull();expect(latest.sourceReference).toBe('');expect(latest.payments).toEqual([]);expect(latest.sourceFactsConfirmed).toBeNull();await panel.click('Add actual current care payment');expect(latest.payments).toEqual([emptyGuidedPACarePayment()]);await panel.click('Confirm actual PA care payment records after the last edit');expect(latest.sourceFactsConfirmed).toBeNull();}finally{await panel.dispose();}
});
it.each(['Remove care receipt 1','Add actual current care payment','Remove actual PA care source records'] as const)('independent native care source collection action revokes enclosing confirmation %s',async action=>{const h=await mountParent();try{await h.panel.click(action);expect(h.draft().sourceFactsConfirmed).toBeNull();if(action==='Remove actual PA care source records')expect(h.draft().care.careSources).toBeUndefined();else expect(h.draft().care.careSources?.sourceFactsConfirmed).toBeNull();}finally{await h.panel.dispose();}});
