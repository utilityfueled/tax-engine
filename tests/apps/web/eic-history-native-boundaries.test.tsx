// @vitest-environment jsdom
// Spec: spec/federal/eic-history-native-boundaries.yaml. Explicit fictional 2025 sources.
import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, expect, it} from 'vitest';
import {SectionPersonalInfo} from '@/components/guided-interview/section-personal-info';
import {buildGuidedEicDisallowanceHistory} from '@/lib/guided-eic-disallowance-history';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {updateSectionData, type GuidedFlowState} from '@/lib/guided-interview-flow';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculateFederalTax} from '@/engine/federal';
import {completeW2Entry, startCompleteInterview} from '../../guided-interview/complete-facts';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
function actual<T>(value: T | undefined | null): T {
  if (value == null) throw Error('Explicit fictional native EIC source required');
  return value;
}
function flow(): GuidedFlowState {
  const state = startCompleteInterview({filingStatus:'mfj',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});
  const personal = actual(state.sectionData['personal-info']);
  personal.eicClaimantEligibility = {
    sourceTaxYear:'2025', sourceReference:'Fictional actual current claimant evidence',sourceFactsConfirmed:true,
    primaryNonresidentAlienDuringYear:false,spouseNonresidentAlienDuringYear:false,
    primaryQualifyingChildOfAnotherTaxpayer:false,spouseQualifyingChildOfAnotherTaxpayer:false,
    primaryChildless:{mainHomeInUnitedStatesMoreThanHalfYear:true,countedMilitaryDutyOutsideUnitedStates:false},
    spouseChildless:{mainHomeInUnitedStatesMoreThanHalfYear:true,countedMilitaryDutyOutsideUnitedStates:false},
  };
  state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'10000',socialSecurityWages:'10000',socialSecurityWithheld:'620',medicareWages:'10000',medicareWithheld:'145'}]};
  return state;
}
const cleanups = new Set<() => Promise<void>>();
afterEach(async () => {for (const cleanup of [...cleanups]) await cleanup();});
async function mount(initial: GuidedFlowState = flow()) {
  const element = document.createElement('div'); document.body.appendChild(element);
  const root = createRoot(element); let latest = initial, changes = 0;
  function Harness() {
    const [state,setState] = useState(initial);
    return <SectionPersonalInfo data={state.sectionData['personal-info']} filingStatus="mfj" onDataChange={next => {
      changes++; latest=updateSectionData(state,'personal-info',next); setState(latest);
    }} />;
  }
  const cleanup = async () => {await act(async () => root.unmount());element.remove();cleanups.delete(cleanup);};
  cleanups.add(cleanup); await act(async () => root.render(<Harness/>));
  function field(label:string) {
    return actual([...element.querySelectorAll('label')].find(node=>node.querySelector('.guided-field-label')?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>('input,select'));
  }
  async function change(label:string,value:string) {
    const node=field(label);
    await act(async () => {
      const prototype=node.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
      actual(Object.getOwnPropertyDescriptor(prototype,'value')?.set).call(node,value);
      node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));
    });
  }
  async function click(label:string) {
    const button=actual([...element.querySelectorAll('button')].find(node=>node.textContent===label));
    await act(async()=>button.click());
  }
  const personal=()=>actual(latest.sectionData['personal-info']);
  const history=()=>actual(personal().eicDisallowanceHistory);
  const result=()=>actual(buildGuidedEicDisallowanceHistory(personal(),'mfj',2025));
  async function confirm() {
    for(const who of ['Primary filer','Spouse']) await change(`${who}: all EIC history included`,'true');
    for(const who of ['Primary filer','Spouse']) await change(`${who}: history checked after the last edit`,'true');
    await change('EIC history checked after the last edit','true');
    await change('EIC claimant sources checked after the last edit','true');
  }
  async function start() {
    await click('Add EIC denial and allowance history');
    await change('EIC history source tax year','2025');await change('EIC history source reference','Fictional actual complete IRS records');
    await change('Current EIC claim status','preparing');await change('EIC history reviewed through','2026-03-01');await change('EIC preparation as of','2026-03-01');
    await click('Copy actual filer identities');
    for(const who of ['Primary filer','Spouse']) {
      await change(`${who}: history source reference`,`Fictional actual ${who} history`);
      await click(`${who}: record no prior EIC denials`);await click(`${who}: record no later IRS allowances`);
    }
  }
  function credit() {
    const input=actual(buildTaxInputFromGuidedData(latest));
    return actual(calculateFederalTax(TaxYearInputSchema.parse(input)).allLines.find(line=>line.form==='1040'&&line.line==='27a')).value.toFixed();
  }
  return {element,field,change,click,personal,history,result,confirm,start,credit,state:()=>latest,changes:()=>changes,dispose:cleanup};
}
type Mounted=Awaited<ReturnType<typeof mount>>;
async function denial(ui:Mounted,who='Primary filer',kind:'ordinary'|'reckless'='ordinary') {
  await ui.click(`${who}: add an actual EIC denial`);const prefix=`${who} denial 1`;
  for(const [name,value]of Object.entries({
    'original denial ID':who==='Spouse'?'spouse-denial':'primary-denial','source reference':`Fictional actual ${who} deficiency notice`,
    'denied return tax year':kind==='reckless'?'2024':'2023','original return filing date':kind==='reckless'?'2025-03-15':'2024-03-15',
    'IRS notice date':kind==='reckless'?'2025-09-01':'2024-09-01','actual denial reason':'income_only','actual IRS procedure':'deficiency',
    'final conduct determination':kind==='reckless'?'reckless':'none','pending appeal':'false',
  })) await ui.change(`${prefix}: ${name}`,value);
  for(const fact of ['assessment','final determination']) {
    await ui.change(`${prefix}: ${fact} status`,'occurred');
    await ui.change(`${prefix}: ${fact} date`,kind==='reckless'?'2025-12-01':'2024-12-01');
  }
  if(kind==='reckless') {
    await ui.click(`${prefix}: record no intervening original returns`);
    await ui.change(`${prefix}: complete intervening filing history recorded`,'true');
  }
  return prefix;
}
async function allowance(ui:Mounted,who='Primary filer') {
  await ui.click(`${who}: add an actual IRS allowance`);const prefix=`${who} allowance 1`;
  for(const [name,value]of Object.entries({
    'original allowance ID':'actual-allowance','source reference':'Fictional actual IRS later allowance',
    'allowed return tax year':'2024','actual return filing date':'2025-03-15','actual IRS allowance date':'2025-09-01','eligibility evidence actually supplied':'form8862',
  }))await ui.change(`${prefix}: ${name}`,value);
  return prefix;
}

it('starts unknown and requires actual empty histories before admitting the claim',async()=>{
  const ui=await mount();expect(ui.changes()).toBe(0);
  await ui.click('Add EIC denial and allowance history');
  expect(ui.history()).toEqual({});expect(ui.field('EIC history source tax year').value).toBe('');
  await ui.click('Copy actual filer identities');expect(ui.history().filers?.[0]?.denials).toBeUndefined();
  expect(ui.history().filers?.[1]?.laterAllowances).toBeUndefined();expect(buildTaxInputFromGuidedData(ui.state())).toBeNull();
  await ui.click('Remove EIC history records');await ui.start();await ui.confirm();
  expect(ui.result().result).toMatchObject({sourceFactsComplete:true,barred:false,form8862Required:false});expect(ui.credit()).toBe('649');
  await ui.click('Spouse: mark allowance history unknown');await ui.confirm();
  expect(ui.history().filers?.[1]?.laterAllowances).toBeUndefined();expect(buildTaxInputFromGuidedData(ui.state())).toBeNull();
});
it('preserves unknown known-not-occurred and actual assessment dates through native edits',async()=>{
  const ui=await mount();await ui.start();const prefix=await denial(ui);
  await ui.change(`${prefix}: actual denial reason`,'math_or_clerical');await ui.change(`${prefix}: actual IRS procedure`,'math_or_clerical');
  await ui.change(`${prefix}: assessment status`,'');await ui.change(`${prefix}: final determination status`,'not-occurred');await ui.confirm();
  expect(ui.history().filers?.[0]?.denials?.[0]?.assessmentDate).toBeUndefined();expect(()=>ui.result()).toThrow(/assessment.*unknown/i);
  await ui.change(`${prefix}: assessment status`,'not-occurred');await ui.confirm();
  expect(ui.result().source.filers?.[0]?.denials?.[0]?.assessmentDate).toBeNull();expect(ui.credit()).toBe('649');
  await ui.change(`${prefix}: assessment status`,'occurred');expect(ui.field(`${prefix}: assessment date`).value).toBe('');
  await ui.confirm();expect(()=>ui.result()).toThrow(/assessment.*calendar date/i);
  await ui.change(`${prefix}: assessment date`,'2024-12-01');await ui.confirm();
  expect(ui.result().source.filers?.[0]?.denials?.[0]?.assessmentDate).toBe('2024-12-01');expect(ui.credit()).toBe('649');
});
it('requires actual linked later IRS allowance before clearing a deficiency denial',async()=>{
  const ui=await mount();await ui.start();await denial(ui);await ui.confirm();
  expect(ui.result().result).toMatchObject({barred:false,form8862Required:true});expect(()=>ui.credit()).toThrow(/8862/i);
  const prefix=await allowance(ui);await ui.click(`${prefix}: link an actual earlier denial`);await ui.change(`${prefix}: resolved original denial ID 1`,'primary-denial');await ui.confirm();
  expect(ui.result().result).toMatchObject({barred:false,form8862Required:false});expect(ui.credit()).toBe('649');
  expect(ui.result().source.filers?.[0]?.laterAllowances?.[0]).toMatchObject({allowanceDate:'2025-09-01',returnFiledDate:'2025-03-15',resolvedDenialSourceIds:['primary-denial']});
  await ui.click('Remove primary filer allowance 1');await ui.confirm();
  expect(ui.history().filers?.[0]?.denials).toHaveLength(1);expect(ui.result().result.form8862Required).toBe(true);expect(()=>ui.credit()).toThrow(/8862/i);
});
it('rejects missing duplicate and unlinked native allowance links',async()=>{
  const ui=await mount();await ui.start();await denial(ui);const prefix=await allowance(ui);await ui.confirm();
  expect(()=>ui.result()).toThrow(/linked earlier denial/i);
  await ui.click(`${prefix}: link an actual earlier denial`);await ui.change(`${prefix}: resolved original denial ID 1`,'missing-denial');await ui.confirm();
  expect(()=>ui.result()).toThrow(/linked earlier deficiency denial/i);
  await ui.change(`${prefix}: resolved original denial ID 1`,'primary-denial');await ui.click(`${prefix}: link an actual earlier denial`);await ui.change(`${prefix}: resolved original denial ID 2`,'primary-denial');await ui.confirm();
  expect(()=>ui.result()).toThrow(/duplicate linked allowance denial/i);
  await ui.click('Remove primary filer allowance 1 denial link 2');expect(ui.history().sourceFactsConfirmed).toBeNull();await ui.confirm();expect(ui.credit()).toBe('649');
  await ui.click('Remove primary filer allowance 1 denial link 1');await ui.confirm();expect(()=>ui.result()).toThrow(/linked earlier denial/i);
});
it('keeps one filers allowance separate from the spouses unresolved history',async()=>{
  const ui=await mount();await ui.start();await denial(ui,'Spouse');const prefix=await allowance(ui);await ui.click(`${prefix}: link an actual earlier denial`);await ui.change(`${prefix}: resolved original denial ID 1`,'spouse-denial');await ui.confirm();
  expect(()=>ui.result()).toThrow(/linked earlier deficiency denial/i);expect(buildTaxInputFromGuidedData(ui.state())).toBeNull();
  await ui.click('Remove primary filer allowance 1');await ui.confirm();
  expect(ui.result().result.filers).toMatchObject([{owner:'primary',unresolvedDeficiencyCount:0},{owner:'spouse',unresolvedDeficiencyCount:1}]);expect(()=>ui.credit()).toThrow(/8862/i);
});
it('derives the ban from native intervening original-return chronology',async()=>{
  const ui=await mount();await ui.start();const prefix=await denial(ui,'Primary filer','reckless');
  for(const fact of ['assessment','final determination'])await ui.change(`${prefix}: ${fact} date`,'2026-02-15');
  await ui.click(`${prefix}: add an intervening original return`);
  await ui.change(`${prefix}, intervening return 1: tax year`,'2025');await ui.change(`${prefix}, intervening return 1: actual filing date`,'2026-02-01');await ui.change(`${prefix}, intervening return 1: source reference`,'Fictional actual filed 2025 original');await ui.change(`${prefix}: complete intervening filing history recorded`,'true');await ui.confirm();
  expect(ui.result().result).toMatchObject({barred:false,form8862Required:true});expect(()=>ui.credit()).toThrow(/8862/i);
  await ui.click(`${prefix}: mark intervening history unknown`);await ui.confirm();expect(()=>ui.result()).toThrow(/complete actual intervening original-return chronology/i);
  await ui.click(`${prefix}: record no intervening original returns`);await ui.change(`${prefix}: complete intervening filing history recorded`,'true');await ui.confirm();
  expect(ui.result().result.barred).toBe(true);expect(ui.credit()).toBe('0');
});
it('retains an actual zero credit while rejecting conflicting ban notice years',async()=>{
  const ui=await mount();await ui.start();const prefix=await denial(ui,'Primary filer','reckless');await ui.confirm();expect(ui.credit()).toBe('0');
  await ui.click(`${prefix}: add the actual ban notice`);await ui.change(`${prefix}: ban notice source reference`,'Fictional actual CP79A');await ui.change(`${prefix}: ban notice date`,'2026-01-15');await ui.change(`${prefix}: first eligible tax year stated in notice`,'2027');await ui.confirm();
  expect(ui.result().result.barred).toBe(true);expect(ui.credit()).toBe('0');
  await ui.change(`${prefix}: first eligible tax year stated in notice`,'2028');await ui.confirm();expect(()=>ui.result()).toThrow(/notice years conflict with supported original-return chronology/i);
  await ui.click('Remove primary filer denial 1 ban notice');await ui.confirm();expect(ui.credit()).toBe('0');expect(ui.history().filers?.[0]?.denials).toHaveLength(1);
});
it('clears incompatible claim dates only after an explicit native status change',async()=>{
  const ui=await mount();await ui.start();await ui.confirm();expect(ui.credit()).toBe('649');
  await ui.change('Current EIC claim status','filed');expect(ui.history().preparationAsOfDate).toBeUndefined();expect(ui.field('Actual current EIC claim filing date').value).toBe('');await ui.confirm();expect(()=>ui.result()).toThrow(/current claim filing.*calendar date/i);
  await ui.change('Actual current EIC claim filing date','2026-02-01');await ui.confirm();expect(ui.result().source.claimFilingDate).toBe('2026-02-01');expect(ui.credit()).toBe('649');
  await ui.change('Current EIC claim status','preparing');expect(ui.history().claimFilingDate).toBeUndefined();expect(ui.field('EIC preparation as of').value).toBe('');await ui.confirm();expect(()=>ui.result()).toThrow(/preparation-as-of.*calendar date/i);
  await ui.change('EIC preparation as of','2026-03-01');await ui.confirm();expect(ui.credit()).toBe('649');
});
it('reopens serialized native histories without changes and invalidates actual subsequent edits',async()=>{
  const ui=await mount();await ui.start();const prefix=await denial(ui,'Spouse','reckless');await ui.confirm();expect(ui.credit()).toBe('0');
  const saved=JSON.stringify(ui.state());await ui.dispose();const reopened=await mount(JSON.parse(saved) as GuidedFlowState);
  expect(reopened.changes()).toBe(0);expect(JSON.stringify(reopened.state())).toBe(saved);expect(reopened.field(`${prefix}: pending appeal`).value).toBe('false');expect(reopened.field(`${prefix}: final determination date`).value).toBe('2025-12-01');expect(reopened.field('EIC history checked after the last edit').value).toBe('true');expect(reopened.credit()).toBe('0');
  const original=structuredClone(reopened.history().filers?.[1]?.denials?.[0]);await reopened.change(`${prefix}: source reference`,'Fictional edited actual notice reference');
  expect(reopened.history().sourceFactsConfirmed).toBeNull();expect(reopened.history().filers?.every(filer=>filer.sourceFactsConfirmed===null)).toBe(true);expect(reopened.personal().eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(reopened.state())).toBeNull();
  expect(reopened.history().filers?.[1]?.denials?.[0]).toMatchObject({...original,sourceReference:'Fictional edited actual notice reference'});
  await reopened.confirm();expect(reopened.credit()).toBe('0');
});
