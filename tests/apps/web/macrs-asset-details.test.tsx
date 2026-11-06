// @vitest-environment jsdom
// spec/federal/macrs-native-first-year-ordinary.yaml#native-route
import React,{useState} from 'react';
import {act} from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {BusinessSourceDetails} from '@/components/guided-interview/business-source-details';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {macrsRow,macrsDraft,macrsFixture} from '../../fixtures/macrs-native-first-year';
import {macrsCollectionQuestions,macrsRowQuestions} from '@/lib/guided-macrs-assets';
import {mountGuidedPanel} from './guided-panel-dom';
afterEach(()=>vi.unstubAllGlobals());
it('real native entry captures originals explicitly and both confirmations can remain current',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);let current=macrsFixture().state,writes=0;
 delete current.sectionData['income-self-employment']!.businessFacts!.macrsAssets;
 delete current.sectionData['income-self-employment']!.businessFacts!.depreciationMethod;
 function Harness(){const[state,set]=useState(current);return <BusinessSourceDetails data={state.sectionData['income-self-employment']!.businessFacts} onChange={businessFacts=>{writes++;current=updateSectionData(state,'income-self-employment',{...state.sectionData['income-self-employment']!,businessFacts});set(current);}}/>;}
 const p=await mountGuidedPanel(<Harness/>);
 try{
 await p.click('Use actual first-year asset records');await p.click('Add actual ordinary asset');
 const draft=()=>current.sectionData['income-self-employment']!.businessFacts!.macrsAssets!;
 expect(draft().rows).toEqual([{}]);expect(draft().sourceTaxYear).toBeUndefined();expect(draft().rows![0].originalAsset).toBeUndefined();
 expect(buildTaxInputFromGuidedData(current)).toBeNull();
 const r=macrsRow(),d=macrsDraft();
 await p.change('Actual asset source tax year',d.sourceTaxYear!);await p.change('Complete asset inventory source reference',d.sourceReference!);
 for(const [key,label] of Object.entries(macrsCollectionQuestions))await p.change(label,String(d[key as keyof typeof d]));
 const fields={assetReference:'original reference',description:'description',placedInServiceDate:'full placed-in-service date',recoveryPeriod:'actual recovery class',method:'actual depreciation method',grossCostBasis:'actual gross basis',section179BusinessDeduction:'actual business section179 deduction',bonusBusinessDeduction:'actual business bonus deduction',businessUsePercentage:'actual business use percentage',grossBasisSourceReference:'gross basis original',businessUseSourceReference:'business use original',section179SourceReference:'zero179 completed worksheet',bonusSourceReference:'zero-bonus completed worksheet',bonusZeroTreatment:'actual zero-bonus treatment',bonusTreatmentSourceReference:'zero-bonus treatment original'};
 for(const [key,label]of Object.entries(fields))await p.change('Asset 1 '+label,String(r[key as keyof typeof r]));
 for(const [key,label]of Object.entries(macrsRowQuestions))await p.change('Asset 1: '+label,String(r[key as keyof typeof r]));
 await p.click('Confirm original asset 1 after the last edit');expect(draft().rows![0].sourceFactsConfirmed).toBe(true);
 await p.click('Confirm complete asset inventory after the last edit');expect(draft().sourceFactsConfirmed).toBe(true);
 await p.change('Have you reconciled every actual source, owner, year and eligibility fact in this Schedule C packet?','true');
 await p.change('Have you checked every expense amount, business use and deduction qualification against the records?','true');
 expect(draft().sourceFactsConfirmed).toBe(true);expect(current.sectionData['income-self-employment']!.businessFacts!.scheduleCSourceFacts!.sourceFactsConfirmed).toBe(true);
 expect(buildTaxInputFromGuidedData(current)?.form4562?.assets?.[0].costBasis).toBe('10000');
 const before=writes,field=p.control('Asset 1 actual gross basis');await act(async()=>{field.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));field.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});
 expect(writes).toBe(before);expect(draft().sourceFactsConfirmed).toBe(true);
 await p.change('Asset 1 actual gross basis','10000.00');expect(draft().rows![0].sourceFactsConfirmed).toBeNull();expect(draft().sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(current)).toBeNull();
 for(const raw of ['1,0','$','']){await p.change('Asset 1 actual gross basis',raw);await act(async()=>{field.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});expect(draft().rows![0].grossCostBasis).toBe(raw);expect(buildTaxInputFromGuidedData(current)).toBeNull();}
 }finally{await p.dispose();}
});

it('retains malformed saved inventory without crashing or silently replacing it',async()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const {facts}=macrsFixture();const changes=vi.fn();Object.assign(facts.macrsAssets!,{rows:'unsupported-raw-original'});const before=JSON.stringify(facts);const p=await mountGuidedPanel(<BusinessSourceDetails data={facts} onChange={changes}/>);try{expect(p.container.querySelector('[role="alert"]')?.textContent).toContain('original facts are retained');expect(changes).not.toHaveBeenCalled();expect(JSON.stringify(facts)).toBe(before);}finally{await p.dispose();}});
