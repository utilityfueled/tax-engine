"use client";
import {useState,type ComponentProps} from 'react';
import type {TaxYearInput} from '@/models/inputs';
import type {PAOrdinaryCareSources, PACarePaperIdentitySources} from '@/models/pa-care-sources';
import {emptyGuidedPACareSources,emptyGuidedPACarePayment,captureGuidedPACareOriginals,confirmGuidedPACareSources,emptyGuidedPACarePaperIdentitySources,emptyGuidedPACareProviderIdentity,emptyGuidedPACarePersonIdentity,captureGuidedPACarePaperIdentityOriginals,confirmGuidedPACarePaperIdentitySources} from '@/lib/guided-pa-care-sources';
import {emptyGuidedPA2026CarePayerReview, emptyGuidedPA2026OrdinaryCareReview, requireGuidedPA2026CareHouseholdReview, requireGuidedPA2026CareReview} from '@/lib/guided-pa-care-sources';
import {readGuidedMedicalMileageHoh, type MedicalMileageHohDraft} from '@/lib/guided-medical-mileage-hoh';
import {BooleanFact,TextFact} from './fact-fields';
import {CurrencyField,parseCurrencyInput,isValidCurrencyValue} from './currency-field';
import {MedicalMileageHohDetails} from './medical-mileage-hoh-details';
type Sources=PAOrdinaryCareSources;
/** Actual source strings are changed only by a different admitted primitive. */
function ActualCareCurrency({value,onChange,...props}:ComponentProps<typeof CurrencyField>){return <CurrencyField {...props} value={value} onChange={raw=>{const parsed=parseCurrencyInput(raw);const next=raw.trim()===''||(parsed!==''&&isValidCurrencyValue(raw,props.allowNegative))?parsed:raw;if(next!==value)onChange(next);}}/>;}

function IntegerFact({label,value,onChange}:{label:string;value:number|null;onChange:(v:number|null)=>void}){return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" type="number" step="1" value={value??''} onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))}/></label>;}
export function PACareSourcesDetails({originalInput,data,onChange,collect2026DraftReview=false}:{originalInput:TaxYearInput|null;data?:Sources;onChange:(data:Sources|undefined)=>void;collect2026DraftReview?:boolean}){
 const[reviewed,setReviewed]=useState<boolean|null>(null),[message,setMessage]=useState('');
 if(!data)return <button type="button" onClick={()=>onChange(emptyGuidedPACareSources())}>Add actual PA current care source records</button>;
 const update=(patch:Partial<Sources>)=>{setMessage('');onChange({...data,...patch,sourceFactsConfirmed:null,...(data.paperIdentitySources?{paperIdentitySources:{...data.paperIdentitySources,sourceFactsConfirmed:null}}:{})});};
 const updateCollection=(patch:Partial<Sources>)=>update(requireGuidedPA2026CareReview({...data,...patch}));
 const headOfHousehold=originalInput?.taxpayer.filingStatus==='head_of_household';
 const supports2026DraftReview=collect2026DraftReview && originalInput?.taxpayer.taxYear===2026
  && (originalInput.taxpayer.filingStatus==='single'||headOfHousehold) && !originalInput.taxpayer.spouse;
 const annualReview=data.ordinaryDraft2026;
 const household=data.headOfHousehold2026;
 const householdDraft=readGuidedMedicalMileageHoh(household?.originalHousehold);
 const editHousehold=(originalHousehold:MedicalMileageHohDraft|undefined, originalsChanged:boolean)=>{
  const next=originalHousehold?{actualAllYearPAMainHomeConfirmed:household?.actualAllYearPAMainHomeConfirmed??null,originalHousehold}:undefined;
  update({headOfHousehold2026:next&&originalsChanged?requireGuidedPA2026CareHouseholdReview(next):next});
 };
 const action=(work:(input:TaxYearInput)=>Sources)=>{try{if(!originalInput)throw Error('Complete actual current federal care originals first');onChange(work(originalInput));setMessage('Actual source action saved. Credit qualification requires complete current return sources.');}catch(e){setMessage(e instanceof Error?e.message:'Complete actual source records');}};
 return <fieldset className="guided-card"><legend>Actual current care payment originals</legend><p className="guided-hint">Retain actual receipts and their provider and qualifying-person links. Unknown values remain blank. Source confirmation does not establish an eligible credit or filing readiness.</p>
 <IntegerFact label="PA care source tax year" value={data.sourceTaxYear} onChange={sourceTaxYear=>updateCollection({sourceTaxYear})}/><TextFact label="PA care collection original source reference" value={data.sourceReference} onChange={sourceReference=>updateCollection({sourceReference})}/>
 <BooleanFact label="Actual federal care originals reviewed for this source collection" value={reviewed} onChange={setReviewed}/><button type="button" onClick={()=>action(input=>captureGuidedPACareOriginals(input,data,reviewed))}>Capture reviewed current federal care originals</button>
 {supports2026DraftReview && (annualReview ? <fieldset className="guided-card">
  <legend>2026 federal review for the Pennsylvania care draft</legend>
  <p className="guided-hint">Complete the receipt below before confirming this review. The draft supports one child under 13, one eligible provider outside your household, and one payment receipt.</p>
  <TextFact label="Federal review original source reference" value={annualReview.sourceReference} onChange={sourceReference=>update({ordinaryDraft2026:emptyGuidedPA2026OrdinaryCareReview(sourceReference)})}/>
  {!headOfHousehold&&<BooleanFact label="I reviewed my filing status and do not qualify for Head of Household" value={annualReview.singleNotEligibleForHeadOfHouseholdConfirmed} onChange={singleNotEligibleForHeadOfHouseholdConfirmed=>update({ordinaryDraft2026:{...annualReview,singleNotEligibleForHeadOfHouseholdConfirmed}})}/>}
  {headOfHousehold&&annualReview.singleNotEligibleForHeadOfHouseholdConfirmed!==null&&<button type="button" onClick={()=>update({ordinaryDraft2026:{...annualReview,singleNotEligibleForHeadOfHouseholdConfirmed:null}})}>Clear retained Single filing-status review</button>}
  {headOfHousehold&&<>
   <MedicalMileageHohDetails data={householdDraft} onChange={next=>editHousehold(next,false)} onOriginalsChange={next=>editHousehold(next,true)} instructions="Use your original household worksheet for the same biological child under 13 on the care receipt. Confirm that you and your child shared this Pennsylvania main home for all of 2026. Use a neutral reference without private details."/>
   {householdDraft&&household&&<BooleanFact label="Household records confirm the same Pennsylvania main home for me and this child throughout 2026" value={household.actualAllYearPAMainHomeConfirmed} onChange={actualAllYearPAMainHomeConfirmed=>update({headOfHousehold2026:{...household,actualAllYearPAMainHomeConfirmed}})}/>}
  </>}
  <p className="guided-hint">Review all federal deductions and credits for this return. This draft supports the standard deduction, the care credit, and any child tax credit for the one eligible child.</p>
  <BooleanFact label="I reviewed all federal records and confirmed no other adjustments, deductions or credits" value={annualReview.standardDeductionOnlyAndNoOtherFederalTaxReductionsConfirmed} onChange={standardDeductionOnlyAndNoOtherFederalTaxReductionsConfirmed=>update({ordinaryDraft2026:{...annualReview,standardDeductionOnlyAndNoOtherFederalTaxReductionsConfirmed}})}/>
  <p className="guided-hint">Check your child’s relationship, age, residency and custody records. Review whether someone else can claim your child.</p>
  <BooleanFact label="I confirmed that I can claim my child as my federal dependent" value={annualReview.directFederalDependentEligibilityConfirmed} onChange={directFederalDependentEligibilityConfirmed=>update({ordinaryDraft2026:{...annualReview,directFederalDependentEligibilityConfirmed}})}/>
  <p className="guided-hint">This draft accepts an unrelated provider outside your household. Exclude your child’s other parent, anyone you could claim as a dependent, your own child under 19, and anyone who was your spouse during the year.</p>
  <BooleanFact label="I reviewed the provider’s relationship and confirmed the provider meets these rules" value={annualReview.unrelatedProviderEligibilityConfirmed} onChange={unrelatedProviderEligibilityConfirmed=>update({ordinaryDraft2026:{...annualReview,unrelatedProviderEligibilityConfirmed}})}/>
  <BooleanFact label="I will claim these same care expenses on my federal return" value={annualReview.sameExpensesWillBeClaimedOnFederalReturnConfirmed} onChange={sameExpensesWillBeClaimedOnFederalReturnConfirmed=>update({ordinaryDraft2026:{...annualReview,sameExpensesWillBeClaimedOnFederalReturnConfirmed}})}/>
 </fieldset> : <button type="button" onClick={()=>update({ordinaryDraft2026:emptyGuidedPA2026OrdinaryCareReview()})}>Add federal and payer review for the 2026 Pennsylvania care draft</button>)}
 {collect2026DraftReview && household && (!supports2026DraftReview || !headOfHousehold || !householdDraft) && <button type="button" onClick={()=>update({headOfHousehold2026:undefined})}>Remove retained head-of-household originals</button>}
 {collect2026DraftReview && annualReview && <button type="button" onClick={()=>update({ordinaryDraft2026:undefined,headOfHousehold2026:undefined,payments:data.payments.map(({payerReview2026:_payer,...payment})=>payment)})}>Remove 2026 federal and payer review records</button>}
 {data.payments.map((row,index)=>{
  const pre=`Care receipt ${index+1} `;
  const replace=(payment:typeof row)=>data.payments.map((r,i)=>i===index?payment:r);
  const edit=(patch:Partial<typeof row>)=>update({
   ...(annualReview && {ordinaryDraft2026:emptyGuidedPA2026OrdinaryCareReview(annualReview.sourceReference)}),
   payments:replace({...row,...patch,...(row.payerReview2026 && {payerReview2026:emptyGuidedPA2026CarePayerReview(row.payerReview2026.sourceReference)})}),
  });
  const receipt=(patch:Partial<typeof row.originalReceipt>)=>edit({originalReceipt:{...row.originalReceipt,...patch}});
  const payer=row.payerReview2026??emptyGuidedPA2026CarePayerReview();
  return <fieldset className="guided-card" key={index}><legend>Care receipt {index+1}</legend>
 <TextFact label={pre+'actual source reference'} value={row.sourceReference} onChange={sourceReference=>edit({sourceReference})}/>
 <label className="guided-field"><span className="guided-field-label">{pre+'actual provider'}</span><select className="guided-input" value={row.providerIndex??''} onChange={e=>edit({providerIndex:e.target.value===''?null:Number(e.target.value)})}><option value="">Unknown / select actual provider</option>{originalInput?.dependentCare?.providers?.map((provider,i)=><option key={i} value={i}>{provider.name}</option>)}</select></label>
 <label className="guided-field"><span className="guided-field-label">{pre+'actual qualifying person'}</span><select className="guided-input" value={row.qualifyingPersonIndex??''} onChange={e=>edit({qualifyingPersonIndex:e.target.value===''?null:Number(e.target.value)})}><option value="">Unknown / select actual qualifying person</option>{originalInput?.dependentCare?.qualifyingPersons?.map((person,i)=><option key={i} value={i}>{person.firstName+' '+person.lastName}</option>)}</select></label>
 {(['paidOn','serviceFrom','serviceThrough'] as const).map((key,i)=><TextFact key={key} label={pre+(['actual paid date','actual service from','actual service through'][i]??'actual date')} type="date" value={row[key]} onChange={value=>edit({[key]:value})}/>)}
 <ActualCareCurrency label={pre+'actual amount'} value={row.amount} onChange={amount=>edit({amount})}/>
 <TextFact label={pre+'original receipt number'} value={row.originalReceipt.receiptNumber} onChange={receiptNumber=>receipt({receiptNumber})}/><TextFact label={pre+'original receipt date'} type="date" value={row.originalReceipt.date} onChange={date=>receipt({date})}/><ActualCareCurrency label={pre+'original receipt amount'} value={row.originalReceipt.amount} onChange={amount=>receipt({amount})}/>
 {(['providerName','providerTin','qualifyingPersonName','qualifyingPersonTin'] as const).map((key,i)=><TextFact key={key} label={pre+(['original provider name','original provider TIN','original qualifying person name','original qualifying person TIN'][i]??'original identity')} value={row.originalReceipt[key]} onChange={value=>receipt({[key]:value})}/>)}
 <BooleanFact label={pre+'actual original available and checked'} value={row.originalAvailableConfirmed} onChange={originalAvailableConfirmed=>edit({originalAvailableConfirmed})}/><BooleanFact label={pre+'actual employment-related expense checked'} value={row.employmentRelatedConfirmed} onChange={employmentRelatedConfirmed=>edit({employmentRelatedConfirmed})}/><BooleanFact label={pre+'actual expense not claimed on another return checked'} value={row.notClaimedOnAnotherReturnConfirmed} onChange={notClaimedOnAnotherReturnConfirmed=>edit({notClaimedOnAnotherReturnConfirmed})}/>
 {supports2026DraftReview && annualReview && <fieldset>
  <legend>Payer records for care receipt {index+1}</legend>
  <TextFact label={pre+'payer and reimbursement source reference'} value={payer.sourceReference} onChange={sourceReference=>update({payments:replace({...row,payerReview2026:emptyGuidedPA2026CarePayerReview(sourceReference)})})}/>
  <BooleanFact label={pre+'records show I paid from my own funds'} value={payer.claimantPaidWithOwnFundsConfirmed} onChange={claimantPaidWithOwnFundsConfirmed=>update({payments:replace({...row,payerReview2026:{...payer,claimantPaidWithOwnFundsConfirmed}})})}/>
  <BooleanFact label={pre+'records show no third-party payment or reimbursement'} value={payer.noThirdPartyPaymentOrReimbursementConfirmed} onChange={noThirdPartyPaymentOrReimbursementConfirmed=>update({payments:replace({...row,payerReview2026:{...payer,noThirdPartyPaymentOrReimbursementConfirmed}})})}/>
 </fieldset>}
 <button type="button" onClick={()=>updateCollection({payments:data.payments.filter((_,i)=>i!==index)})}>Remove care receipt {index+1}</button></fieldset>;})}
 <PACarePaperIdentityDetails originalInput={originalInput} data={data} onChange={onChange}/>
 <button type="button" onClick={()=>updateCollection({payments:[...data.payments,emptyGuidedPACarePayment()]})}>Add actual current care payment</button><button type="button" onClick={()=>action(input=>confirmGuidedPACareSources(input,data))}>Confirm actual PA care payment records after the last edit</button><p role="status">{message|| (data.sourceFactsConfirmed===true?'Actual care sources confirmed; edits require another review.':'Actual care source confirmation required.')}</p><button type="button" onClick={()=>onChange(undefined)}>Remove actual PA care source records</button></fieldset>;
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
