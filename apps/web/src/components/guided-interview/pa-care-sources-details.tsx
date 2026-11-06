"use client";
import {useState,type ComponentProps} from 'react';
import type {TaxYearInput} from '@/models/inputs';
import type {PAOrdinaryCareSources, PACarePaperIdentitySources} from '@/models/pa-care-sources';
import {emptyGuidedPACareSources,emptyGuidedPACarePayment,captureGuidedPACareOriginals,confirmGuidedPACareSources,emptyGuidedPACarePaperIdentitySources,emptyGuidedPACareProviderIdentity,emptyGuidedPACarePersonIdentity,captureGuidedPACarePaperIdentityOriginals,confirmGuidedPACarePaperIdentitySources} from '@/lib/guided-pa-care-sources';
import {BooleanFact,TextFact} from './fact-fields';
import {CurrencyField,parseCurrencyInput,isValidCurrencyValue} from './currency-field';
type Sources=PAOrdinaryCareSources;
/** Actual source strings are changed only by a different admitted primitive. */
function ActualCareCurrency({value,onChange,...props}:ComponentProps<typeof CurrencyField>){return <CurrencyField {...props} value={value} onChange={raw=>{const parsed=parseCurrencyInput(raw);const next=raw.trim()===''||(parsed!==''&&isValidCurrencyValue(raw,props.allowNegative))?parsed:raw;if(next!==value)onChange(next);}}/>;}

function IntegerFact({label,value,onChange}:{label:string;value:number|null;onChange:(v:number|null)=>void}){return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" type="number" step="1" value={value??''} onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))}/></label>;}
export function PACareSourcesDetails({originalInput,data,onChange}:{originalInput:TaxYearInput|null;data?:Sources;onChange:(data:Sources|undefined)=>void}){
 const[reviewed,setReviewed]=useState<boolean|null>(null),[message,setMessage]=useState('');
 if(!data)return <button type="button" onClick={()=>onChange(emptyGuidedPACareSources())}>Add actual PA current care source records</button>;
 const update=(patch:Partial<Sources>)=>{setMessage('');onChange({...data,...patch,sourceFactsConfirmed:null,...(data.paperIdentitySources?{paperIdentitySources:{...data.paperIdentitySources,sourceFactsConfirmed:null}}:{})});};
 const action=(work:(input:TaxYearInput)=>Sources)=>{try{if(!originalInput)throw Error('Complete actual current federal care originals first');onChange(work(originalInput));setMessage('Actual source action saved. Credit qualification requires complete current return sources.');}catch(e){setMessage(e instanceof Error?e.message:'Complete actual source records');}};
 return <fieldset className="guided-card"><legend>Actual current care payment originals</legend><p className="guided-hint">Retain actual receipts and their provider and qualifying-person links. Unknown values remain blank. Source confirmation does not establish an eligible credit or filing readiness.</p>
 <IntegerFact label="PA care source tax year" value={data.sourceTaxYear} onChange={sourceTaxYear=>update({sourceTaxYear})}/><TextFact label="PA care collection original source reference" value={data.sourceReference} onChange={sourceReference=>update({sourceReference})}/>
 <BooleanFact label="Actual federal care originals reviewed for this source collection" value={reviewed} onChange={setReviewed}/><button type="button" onClick={()=>action(input=>captureGuidedPACareOriginals(input,data,reviewed))}>Capture reviewed current federal care originals</button>
 {data.payments.map((row,index)=>{const pre=`Care receipt ${index+1} `;const edit=(patch:Partial<typeof row>)=>update({payments:data.payments.map((r,i)=>i===index?{...r,...patch}:r)});const receipt=(patch:Partial<typeof row.originalReceipt>)=>edit({originalReceipt:{...row.originalReceipt,...patch}});return <fieldset className="guided-card" key={index}><legend>Care receipt {index+1}</legend>
 <TextFact label={pre+'actual source reference'} value={row.sourceReference} onChange={sourceReference=>edit({sourceReference})}/>
 <label className="guided-field"><span className="guided-field-label">{pre+'actual provider'}</span><select className="guided-input" value={row.providerIndex??''} onChange={e=>edit({providerIndex:e.target.value===''?null:Number(e.target.value)})}><option value="">Unknown / select actual provider</option>{originalInput?.dependentCare?.providers?.map((provider,i)=><option key={i} value={i}>{provider.name}</option>)}</select></label>
 <label className="guided-field"><span className="guided-field-label">{pre+'actual qualifying person'}</span><select className="guided-input" value={row.qualifyingPersonIndex??''} onChange={e=>edit({qualifyingPersonIndex:e.target.value===''?null:Number(e.target.value)})}><option value="">Unknown / select actual qualifying person</option>{originalInput?.dependentCare?.qualifyingPersons?.map((person,i)=><option key={i} value={i}>{person.firstName+' '+person.lastName}</option>)}</select></label>
 {(['paidOn','serviceFrom','serviceThrough'] as const).map((key,i)=><TextFact key={key} label={pre+(['actual paid date','actual service from','actual service through'][i]??'actual date')} type="date" value={row[key]} onChange={value=>edit({[key]:value})}/>)}
 <ActualCareCurrency label={pre+'actual amount'} value={row.amount} onChange={amount=>edit({amount})}/>
 <TextFact label={pre+'original receipt number'} value={row.originalReceipt.receiptNumber} onChange={receiptNumber=>receipt({receiptNumber})}/><TextFact label={pre+'original receipt date'} type="date" value={row.originalReceipt.date} onChange={date=>receipt({date})}/><ActualCareCurrency label={pre+'original receipt amount'} value={row.originalReceipt.amount} onChange={amount=>receipt({amount})}/>
 {(['providerName','providerTin','qualifyingPersonName','qualifyingPersonTin'] as const).map((key,i)=><TextFact key={key} label={pre+(['original provider name','original provider TIN','original qualifying person name','original qualifying person TIN'][i]??'original identity')} value={row.originalReceipt[key]} onChange={value=>receipt({[key]:value})}/>)}
 <BooleanFact label={pre+'actual original available and checked'} value={row.originalAvailableConfirmed} onChange={originalAvailableConfirmed=>edit({originalAvailableConfirmed})}/><BooleanFact label={pre+'actual employment-related expense checked'} value={row.employmentRelatedConfirmed} onChange={employmentRelatedConfirmed=>edit({employmentRelatedConfirmed})}/><BooleanFact label={pre+'actual expense not claimed on another return checked'} value={row.notClaimedOnAnotherReturnConfirmed} onChange={notClaimedOnAnotherReturnConfirmed=>edit({notClaimedOnAnotherReturnConfirmed})}/><button type="button" onClick={()=>update({payments:data.payments.filter((_,i)=>i!==index)})}>Remove care receipt {index+1}</button></fieldset>;})}
 <PACarePaperIdentityDetails originalInput={originalInput} data={data} onChange={onChange}/>
 <button type="button" onClick={()=>update({payments:[...data.payments,emptyGuidedPACarePayment()]})}>Add actual current care payment</button><button type="button" onClick={()=>action(input=>confirmGuidedPACareSources(input,data))}>Confirm actual PA care payment records after the last edit</button><p role="status">{message|| (data.sourceFactsConfirmed===true?'Actual care sources confirmed; edits require another review.':'Actual care source confirmation required.')}</p><button type="button" onClick={()=>onChange(undefined)}>Remove actual PA care source records</button></fieldset>;
}


/** Native documentary facts remain separate from care eligibility and paper readiness. */
function PACarePaperIdentityDetails({originalInput,data,onChange}:{originalInput:TaxYearInput|null;data:Sources;onChange:(data:Sources|undefined)=>void}){
 const [reviewed,setReviewed]=useState<boolean|null>(null),[message,setMessage]=useState('');
 const identity=data.paperIdentitySources;
 if(!identity)return <button type="button" onClick={()=>onChange({...data,sourceFactsConfirmed:null,paperIdentitySources:emptyGuidedPACarePaperIdentitySources()})}>Add actual PA care documentary identity records</button>;
 const update=(patch:Partial<PACarePaperIdentitySources>)=>{
  setMessage('');
  onChange({...data,sourceFactsConfirmed:null,paperIdentitySources:{...identity,...patch,sourceFactsConfirmed:null}});
 };
 const action=(work:(input:TaxYearInput)=>Sources)=>{
  try{
   if(!originalInput)throw Error('Complete actual current federal care originals first');
   onChange(work(originalInput));setMessage('Documentary action saved. Confirm care records and the household separately; official care paper remains unqualified.');
  }catch(error){setMessage(error instanceof Error?error.message:'Complete actual documentary identities');}
 };
 return <fieldset className="guided-card"><legend>Actual PA care documentary identities</legend>
  <p className="guided-hint">Read the actual identity documents. A generic federal TIN does not identify a Pennsylvania oval. Unknown remains unknown. A provider ITIN is retained distinctly and requires a reviewed Pennsylvania paper method.</p>
  <IntegerFact label="PA care identity source tax year" value={identity.sourceTaxYear} onChange={sourceTaxYear=>update({sourceTaxYear})}/>
  <TextFact label="PA care identity collection original source reference" value={identity.sourceReference} onChange={sourceReference=>update({sourceReference})}/>
  {identity.providers.map((row,index)=>{
   const prefix=`PA care provider identity ${index+1} `;
   const edit=(patch:Partial<typeof row>)=>update({providers:identity.providers.map((item,i)=>i===index?{...item,...patch}:item)});
   return <fieldset key={index} className="guided-card"><legend>Care provider identity {index+1}</legend>
    <label className="guided-field"><span className="guided-field-label">{prefix+'actual provider'}</span><select className="guided-input" value={row.providerIndex??''} onChange={e=>edit({providerIndex:e.target.value===''?null:Number(e.target.value)})}><option value="">Unknown / select actual provider</option>{originalInput?.dependentCare?.providers?.map((provider,i)=><option key={i} value={i}>{provider.name}</option>)}</select></label>
    <TextFact label={prefix+'original documentary source reference'} value={row.sourceReference} onChange={sourceReference=>edit({sourceReference})}/>
    <label className="guided-field"><span className="guided-field-label">{prefix+'documentary identifier kind'}</span><select className="guided-input" value={row.identifierKind} onChange={e=>edit({identifierKind:e.target.value as typeof row.identifierKind})}><option value="unknown">Unknown / not yet reviewed</option><option value="ssn">SSN — documentary source</option><option value="fein">FEIN — documentary source</option><option value="itin">ITIN — PA paper method unqualified</option></select></label>
    <BooleanFact label={prefix+'actual original available and checked'} value={row.originalAvailableConfirmed} onChange={originalAvailableConfirmed=>edit({originalAvailableConfirmed})}/>
    <p className="guided-hint">Retained provider original: {typeof row.originalProvider.name==='string'?row.originalProvider.name:'Not captured'}</p>
    <button type="button" onClick={()=>update({providers:identity.providers.filter((_,i)=>i!==index)})}>Remove care provider identity {index+1}</button>
   </fieldset>;
  })}
  <button type="button" onClick={()=>update({providers:[...identity.providers,emptyGuidedPACareProviderIdentity()]})}>Add actual care provider identity record</button>
  {identity.qualifyingPersons.map((row,index)=>{
   const prefix=`PA care person identity ${index+1} `;
   const edit=(patch:Partial<typeof row>)=>update({qualifyingPersons:identity.qualifyingPersons.map((item,i)=>i===index?{...item,...patch}:item)});
   return <fieldset key={index} className="guided-card"><legend>Care qualifying person identity {index+1}</legend>
    <label className="guided-field"><span className="guided-field-label">{prefix+'actual qualifying person'}</span><select className="guided-input" value={row.qualifyingPersonIndex??''} onChange={e=>edit({qualifyingPersonIndex:e.target.value===''?null:Number(e.target.value)})}><option value="">Unknown / select actual qualifying person</option>{originalInput?.dependentCare?.qualifyingPersons?.map((person,i)=><option key={i} value={i}>{person.firstName+' '+person.lastName}</option>)}</select></label>
    <label className="guided-field"><span className="guided-field-label">{prefix+'actual original dependent'}</span><select className="guided-input" value={row.originalDependentIndex??''} onChange={e=>edit({originalDependentIndex:e.target.value===''?null:Number(e.target.value)})}><option value="">Unknown / select actual dependent</option>{originalInput?.taxpayer.dependents.map((person,i)=><option key={i} value={i}>{person.firstName+' '+person.lastName}</option>)}</select></label>
    <TextFact label={prefix+'original documentary source reference'} value={row.sourceReference} onChange={sourceReference=>edit({sourceReference})}/>
    <label className="guided-field"><span className="guided-field-label">{prefix+'documentary identifier kind'}</span><select className="guided-input" value={row.identifierKind} onChange={e=>edit({identifierKind:e.target.value as typeof row.identifierKind})}><option value="unknown">Unknown / not yet reviewed</option><option value="ssn">SSN — documentary source</option><option value="itin">ITIN — documentary source</option><option value="atin">ATIN — SSN oval on PA instructions</option></select></label>
    <BooleanFact label={prefix+'actual original available and checked'} value={row.originalAvailableConfirmed} onChange={originalAvailableConfirmed=>edit({originalAvailableConfirmed})}/>
    <p className="guided-hint">Retained qualifying person original: {typeof row.originalQualifyingPerson.firstName==='string'?row.originalQualifyingPerson.firstName:'Not captured'} {typeof row.originalQualifyingPerson.lastName==='string'?row.originalQualifyingPerson.lastName:''}</p>
    <button type="button" onClick={()=>update({qualifyingPersons:identity.qualifyingPersons.filter((_,i)=>i!==index)})}>Remove care qualifying person identity {index+1}</button>
   </fieldset>;
  })}
  <button type="button" onClick={()=>update({qualifyingPersons:[...identity.qualifyingPersons,emptyGuidedPACarePersonIdentity()]})}>Add actual care qualifying person identity record</button>
  <BooleanFact label="Actual documentary identity originals reviewed for PA care" value={reviewed} onChange={setReviewed}/>
  <button type="button" onClick={()=>action(input=>captureGuidedPACarePaperIdentityOriginals(input,data,reviewed))}>Capture reviewed PA care identity originals</button>
  <button type="button" onClick={()=>action(input=>confirmGuidedPACarePaperIdentitySources(input,data))}>Confirm actual PA care identity records after the last edit</button>
  <p role="status">{message||(identity.sourceFactsConfirmed===true?'Documentary care identities confirmed; care and household confirmation remain separate.':'Documentary care identity confirmation required.')}</p>
  <button type="button" onClick={()=>{const {paperIdentitySources:_removed,...rest}=data;onChange({...rest,sourceFactsConfirmed:null});}}>Remove PA care documentary identity records</button>
 </fieldset>;
}
