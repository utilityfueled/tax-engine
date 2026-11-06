// @vitest-environment jsdom
// Spec: spec/state/pa-ordinary-native-currency.yaml.
import React,{act,useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {PAOrdinaryReturnDetails} from '@/components/guided-interview/pa-ordinary-return-details';
import {confirmGuidedPAOrdinaryReturnFacts,buildGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {PAOrdinaryReturnFactsSchema,type PAOrdinaryReturnFacts} from '@/models/pa-ordinary-return-facts';
import {nativeMIRoyaltyFixture} from '../../fixtures/guided-pa-royalty-native';
import {mountGuidedPanel} from './guided-panel-dom';
const confirm='Confirm all actual PA return sources after the last edit';
afterEach(()=>vi.unstubAllGlobals());
async function mount(initial:PAOrdinaryReturnFacts){
 const {input}=nativeMIRoyaltyFixture(true);let latest=initial,writes=0;
 function Harness(){const[d,set]=useState(initial);return <PAOrdinaryReturnDetails originalInput={input} data={d} onChange={next=>{if(!next)throw Error('Expected retained draft');latest=next;writes++;set(next);}}/>;}
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const panel=await mountGuidedPanel(<Harness/>);
 return {panel,input,draft:()=>latest,writes:()=>writes};
}
async function enterAndBlur(h:Awaited<ReturnType<typeof mount>>,label:string,value:string){
 const field=h.panel.control(label);await act(async()=>field.dispatchEvent(new FocusEvent('focusin',{bubbles:true})));
 await h.panel.change(label,value);await act(async()=>field.dispatchEvent(new FocusEvent('focusout',{bubbles:true})));
}
it('native blurred6475 confirms actual ordinary sources without weakening canonical money',async()=>{
 const f=nativeMIRoyaltyFixture(true),before=structuredClone(f.facts),initial=structuredClone(f.facts);
 initial.timing.remainingTaxPayment.amountAppliedToTax='6474';
 const h=await mount(confirmGuidedPAOrdinaryReturnFacts(f.input,initial));
 try{
  await enterAndBlur(h,'Actual or expected amount applied to tax','6475');
  expect(h.draft().sourceFactsConfirmed).toBeNull();
  await h.panel.click(confirm);
  expect(h.panel.container.querySelector('[role="status"]')?.textContent).toBe('Actual originals confirmed after the last edit.');
  expect(h.draft().sourceFactsConfirmed).toBe(true);
  expect(h.draft().timing.remainingTaxPayment.amountAppliedToTax).toBe('6475');
  expect(calculatePAOrdinaryReturnFacts(h.input,h.draft()).timing.remainingTaxPayment.amountAppliedToTax).toBe('6475');
  const invalid=structuredClone(h.draft());invalid.timing.remainingTaxPayment.amountAppliedToTax='6,475';
  expect(()=>calculatePAOrdinaryReturnFacts(h.input,invalid)).toThrow(/nonnegative amount/);
  expect(f.facts).toEqual(before);
 }finally{await h.panel.dispose();}
});
// Deliberately synthetic callback-only draft: no claim that these simultaneous
// prior/claiming-household records qualify. They exercise every CurrencyField.
function allFields(){
 const d=PAOrdinaryReturnFactsSchema.parse(nativeMIRoyaltyFixture(true).facts),t=d.owner.originalTaxpayer;
 if(!t)throw Error('Actual fixture owner required');
 const identity={accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn};
 const receipt={...identity,taxYear:2025,returnType:'pa40' as const,kind:'estimated' as const,date:'2025-04-15',amount:'0',confirmationNumber:'Fictional receipt'};
 d.payments.rows=[{sourceReference:'Fictional payment',intendedInstallment:1,original:receipt}];
 const sp={sourceReference:'Fictional completed SP',factsConfirmed:true,original:{...identity,taxYear:2024,filingCategory:'unmarried' as const,dependents:0,paTaxableIncome:'0',nontaxableIncome:'0',taxLiability:'0',residentCredit:'0',reportedForgivenessPercentage:'0',reportedCredit:'0',allWorldwideSourcesCompleteConfirmed:true,claimedDependentSsns:[]}};
 d.filing.claimingHouseholdSP=structuredClone(sp);
 d.payments.priorReturn={status:'return',sourceReference:'Fictional prior',original:{...identity,taxYear:2024,returnType:'pa40',residency:'resident',filingStatus:'S',filedOn:'2025-03-01',taxableIncome:'0',taxForgivenessCredit:'0'},completedSP:structuredClone(sp)};
 d.payments.priorCredit={status:'available',sourceReference:'Fictional carry',priorOriginalElection:{...identity,taxYear:2024,creditElected:'0'},currentOriginalAccount:{...identity,taxYear:2025,availableCredit:'0',noOffsetsReversalsOrRefundsConfirmed:true}};
 d.timing.remainingTaxPayment.original={...receipt,kind:'balance'};
 d.sp.categories['5']={status:'entries',sourceReference:'Fictional gifts',entries:[{sourceReference:'Fictional gift',date:'2025-12-25',amount:'0',notElsewhereConfirmed:true}]};
 d.useTax={status:'itemized',sourceReference:'Fictional purchase',purchases:[{sourceReference:'Fictional purchase',date:'2025-01-01',kind:'goods',taxableAmount:'0',allowableTaxPaid:'0',original:{date:'2025-01-01',amount:'0',taxPaid:'0',receiptNumber:'PRIVATE, literal receipt'}}]};
 d.disposition.donations=[{code:'A',amount:'0'}];return d;
}
type Seam=[string,(d:PAOrdinaryReturnFacts)=>string|undefined];
const seams:Seam[]=[
 ['Payment 1 original amount',d=>d.payments.rows[0].original.amount],
 ['Prior PA40 original taxable income',d=>d.payments.priorReturn.original?.taxableIncome],
 ['Prior PA40 original tax forgiveness credit',d=>d.payments.priorReturn.original?.taxForgivenessCredit],
 ['Prior original elected credit',d=>d.payments.priorCredit.priorOriginalElection?.creditElected],
 ['Current original available credit',d=>d.payments.priorCredit.currentOriginalAccount?.availableCredit],
 ['Actual or expected amount applied to tax',d=>d.timing.remainingTaxPayment.amountAppliedToTax],
 ['Remaining tax payment original amount',d=>d.timing.remainingTaxPayment.original?.amount],
 ['SP 5 entry 1 actual amount',d=>d.sp.categories['5'].entries[0].amount],
 ['Purchase 1 actual taxable amount',d=>d.useTax.purchases?.[0].taxableAmount],
 ['Purchase 1 actual allowable tax paid',d=>d.useTax.purchases?.[0].allowableTaxPaid],
 ['Purchase 1 original receipt amount',d=>d.useTax.purchases?.[0].original.amount],
 ['Purchase 1 original receipt tax paid',d=>d.useTax.purchases?.[0].original.taxPaid],
 ['Actual requested refund',d=>d.disposition.refundRequested],
 ['Actual requested next-year credit',d=>d.disposition.nextYearCreditRequested],
 ['Donation 1 actual whole-dollar amount',d=>d.disposition.donations[0].amount],
];
for(const [prefix,get]of [['Claiming household completed SP',(d:PAOrdinaryReturnFacts)=>d.filing.claimingHouseholdSP],['Prior completed SP',(d:PAOrdinaryReturnFacts)=>d.payments.priorReturn.completedSP]]as const){
 for(const[key,label]of [['paTaxableIncome','PA taxable income'],['nontaxableIncome','nontaxable eligibility income'],['taxLiability','PA tax liability'],['residentCredit','resident credit'],['reportedCredit','reported tax forgiveness credit']]as const)seams.push([prefix+' original '+label,d=>get(d)?.original[key]]);
}
it.each(seams)('ordinary native monetary callback normalizes only currency decoration %s',async(label,read)=>{
 const original=allFields(),before=structuredClone(original),h=await mount(original);
 try{
  await enterAndBlur(h,label,'1234.50');expect(read(h.draft())).toBe('1234.50');
  expect(h.draft().sourceFactsConfirmed).toBeNull();expect(h.draft().originalFederalSources).toEqual(before.originalFederalSources);
  expect(original).toEqual(before);expect(h.draft().useTax.purchases?.[0].original.receiptNumber).toBe('PRIVATE, literal receipt');
 }finally{await h.panel.dispose();}
});
it('native currency retains unknown zero and invalid facts without editing references',async()=>{
 const h=await mount(nativeMIRoyaltyFixture(true).facts);
 try{
  await enterAndBlur(h,'Actual or expected amount applied to tax','');expect(h.draft().timing.remainingTaxPayment.amountAppliedToTax).toBe('');
  await h.panel.click(confirm);expect(h.draft().sourceFactsConfirmed).toBeNull();
  await enterAndBlur(h,'Actual or expected amount applied to tax','0');expect(h.draft().timing.remainingTaxPayment.amountAppliedToTax).toBe('0');
  await enterAndBlur(h,'Actual or expected amount applied to tax','not-an-amount');expect(h.draft().timing.remainingTaxPayment.amountAppliedToTax).toBe('not-an-amount');
  await h.panel.click(confirm);expect(h.draft().sourceFactsConfirmed).toBeNull();
  await h.panel.change('Remaining-tax payment original source reference','Private, exact original reference');
  expect(h.draft().timing.remainingTaxPayment.sourceReference).toBe('Private, exact original reference');
 }finally{await h.panel.dispose();}
});

const actualAmount='Actual or expected amount applied to tax';
async function mountConfirmedCurrency(){
 const f=nativeMIRoyaltyFixture(true),confirmed=confirmGuidedPAOrdinaryReturnFacts(f.input,f.facts);
 const packet=buildGuidedPAOrdinaryReturnFacts(f.input,confirmed),h=await mount(confirmed);
 return {h,confirmed,packet};
}
async function blurActualAmount(h:Awaited<ReturnType<typeof mount>>){
 const field=h.panel.control(actualAmount);
 await act(async()=>field.dispatchEvent(new FocusEvent('focusin',{bubbles:true})));
 await act(async()=>field.dispatchEvent(new FocusEvent('focusout',{bubbles:true})));
}
it('ordinary currency unchanged blur preserves confirmed actual sources',async()=>{
 const {h,confirmed,packet}=await mountConfirmedCurrency(),before=structuredClone(confirmed);
 try{
  await blurActualAmount(h);expect(h.writes()).toBe(0);expect(h.draft()).toBe(confirmed);
  expect(h.draft()).toEqual(before);expect(h.draft().sourceFactsConfirmed).toBe(true);
  expect(buildGuidedPAOrdinaryReturnFacts(h.input,h.draft())).toEqual(packet);
 }finally{await h.panel.dispose();}
});
it.each([['real primitive change','6476'],['equal cash different exact lexeme','6475.00']])('ordinary currency still revokes actual source change %s',async(_kind,value)=>{
 const {h,confirmed}=await mountConfirmedCurrency(),before=structuredClone(confirmed);
 try{
  await enterAndBlur(h,actualAmount,value);expect(h.writes()).toBe(1);
  expect(h.draft().timing.remainingTaxPayment.amountAppliedToTax).toBe(value);expect(h.draft().sourceFactsConfirmed).toBeNull();
  expect(h.draft().originalFederalSources).toEqual(before.originalFederalSources);
  expect(()=>buildGuidedPAOrdinaryReturnFacts(h.input,h.draft())).toThrow(/confirm complete actual sources/);
  expect(confirmed).toEqual(before);
 }finally{await h.panel.dispose();}
});
it.each(['1,0','1,,0','12,34','$1,0','$',',','$,','not-an-amount'])('ordinary currency preserves malformed actual amount %s',async raw=>{
 const {h,confirmed}=await mountConfirmedCurrency(),before=structuredClone(confirmed);
 try{
  await enterAndBlur(h,actualAmount,raw);
  expect(h.draft().timing.remainingTaxPayment.amountAppliedToTax).toBe(raw);expect(h.panel.control(actualAmount).getAttribute('aria-invalid')).toBe('true');
  expect(h.draft().sourceFactsConfirmed).toBeNull();await h.panel.click(confirm);expect(h.draft().sourceFactsConfirmed).toBeNull();
  expect(h.draft().originalFederalSources).toEqual(before.originalFederalSources);
  await enterAndBlur(h,actualAmount,'');expect(h.draft().timing.remainingTaxPayment.amountAppliedToTax).toBe('');
  await h.panel.click(confirm);expect(h.draft().sourceFactsConfirmed).toBeNull();expect(confirmed).toEqual(before);
 }finally{await h.panel.dispose();}
});
it('ordinary currency source provenance edit still revokes confirmation',async()=>{
 const {h,confirmed}=await mountConfirmedCurrency(),before=structuredClone(confirmed);
 try{
  await h.panel.change('PA return original source reference','Different actual source provenance');expect(h.writes()).toBe(1);
  expect(h.draft().sourceReference).toBe('Different actual source provenance');expect(h.draft().timing.remainingTaxPayment).toEqual(before.timing.remainingTaxPayment);
  expect(h.draft().sourceFactsConfirmed).toBeNull();expect(h.draft().originalFederalSources).toEqual(before.originalFederalSources);
  expect(()=>buildGuidedPAOrdinaryReturnFacts(h.input,h.draft())).toThrow(/confirm complete actual sources/);
 }finally{await h.panel.dispose();}
});
it.each([[' $1,234.50 ','1234.50'],['1,234.50','1234.50'],['',''],['   ',''],['0','0']])('ordinary currency retains intended decoration and unknown semantics %s',async(raw,expected)=>{
 const {h,confirmed}=await mountConfirmedCurrency(),before=structuredClone(confirmed);
 try{
  await enterAndBlur(h,actualAmount,raw);expect(h.writes()).toBe(1);
  expect(h.draft().timing.remainingTaxPayment.amountAppliedToTax).toBe(expected);expect(h.draft().sourceFactsConfirmed).toBeNull();
  expect(h.draft().originalFederalSources).toEqual(before.originalFederalSources);
  if(expected===''){await h.panel.click(confirm);expect(h.draft().sourceFactsConfirmed).toBeNull();}
  expect(confirmed).toEqual(before);
 }finally{await h.panel.dispose();}
});
