'use client';
import {useState} from 'react';
import type {BusinessSourceData} from '@/lib/guided-business-facts';
import {confirmGuidedGoodwill,goodwillCollectionQuestions,goodwillRowQuestions,type GuidedGoodwillDraft,type GuidedGoodwillRow} from '@/lib/guided-goodwill-amortization';
import {BooleanFact,TextFact} from './fact-fields';
import {CurrencyField} from './currency-field';

/** Original fields stay blank until explicitly supplied; capture never runs during render. */
export function GoodwillAmortizationDetails({facts,onChange}:{facts:BusinessSourceData;onChange:(draft:GuidedGoodwillDraft)=>void}){
 const d=facts.goodwillAmortization??{};const[error,setError]=useState('');
 if(!d||typeof d!=='object'||Array.isArray(d)||(d.rows!==undefined&&(!Array.isArray(d.rows)||d.rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))))return <p role="alert">Saved goodwill originals have an unsupported structure. Keep the records for source review.</p>;
 function patch(next:Partial<GuidedGoodwillDraft>){setError('');onChange({...d,...next,sourceFactsConfirmed:null});}
 function rowPatch(i:number,next:Partial<GuidedGoodwillRow>){patch({rows:d.rows?.map((r,n)=>n===i?{...r,...next}:r)});}
 return <fieldset className="guided-fieldset"><legend>Actual acquired-goodwill originals</legend>
  <p className="guided-hint">Use actual 2025 cash-purchase goodwill for this one business and owner. Supply the complete purchase allocation, basis and dates. This collector does not determine eligibility or allocate a purchase price. Other assets, prior years, related parties, foreign use, leases, dispositions and expense reclassification require a separate source method. Keep known unsupported facts saved for review. Blank is unknown; zero needs actual records. PA requires its own independent basis method.</p>
  <TextFact label="Goodwill original tax year" value={d.sourceTaxYear??''} onChange={sourceTaxYear=>patch({sourceTaxYear})}/>
  <TextFact label="Complete goodwill inventory reference" value={d.sourceReference??''} onChange={sourceReference=>patch({sourceReference})}/>
  <CurrencyField label="Goodwill ledger remaining nonamortization other expenses" value={d.remainingOtherExpenses??''} onChange={remainingOtherExpenses=>patch({remainingOtherExpenses})}/>
  <TextFact label="Goodwill remaining expense ledger reference" value={d.remainingOtherExpenseSourceReference??''} onChange={remainingOtherExpenseSourceReference=>patch({remainingOtherExpenseSourceReference})}/>
  {(Object.keys(goodwillCollectionQuestions) as Array<keyof typeof goodwillCollectionQuestions>).map(k=><BooleanFact key={k} label={goodwillCollectionQuestions[k]} value={d[k]} onChange={v=>patch({[k]:v})}/>)}
  {(d.rows??[]).map((r,i)=><fieldset className="guided-fieldset" key={i}><legend>Goodwill original {i+1}</legend>
   <TextFact label={`Goodwill ${i+1} original reference`} value={r.sourceReference??''} onChange={sourceReference=>rowPatch(i,{sourceReference})}/>
   <TextFact label={`Goodwill ${i+1} actual description`} value={r.description??''} onChange={description=>rowPatch(i,{description})}/>
   <CurrencyField label={`Goodwill ${i+1} acquired basis`} value={r.basis??''} onChange={basis=>rowPatch(i,{basis})}/>
   <TextFact label={`Goodwill ${i+1} acquisition date`} type="date" value={r.acquisitionDate??''} onChange={acquisitionDate=>rowPatch(i,{acquisitionDate})}/>
   <TextFact label={`Goodwill ${i+1} business-start date`} type="date" value={r.businessStartDate??''} onChange={businessStartDate=>rowPatch(i,{businessStartDate})}/>
   <TextFact label={`Goodwill ${i+1} original amortization start month (YYYY-MM)`} value={r.startMonth??''} onChange={startMonth=>rowPatch(i,{startMonth})}/>
   {(Object.keys(goodwillRowQuestions) as Array<keyof typeof goodwillRowQuestions>).map(k=><BooleanFact key={k} label={goodwillRowQuestions[k]} value={r[k]} onChange={v=>rowPatch(i,{[k]:v})}/>)}
   <button type="button" onClick={()=>patch({rows:d.rows?.filter((_,n)=>n!==i)})}>Remove goodwill original {i+1}</button>
  </fieldset>)}
  <button type="button" onClick={()=>patch({rows:[...(d.rows??[]),{}]})}>Add goodwill original</button>
  <button type="button" onClick={()=>{try{const captured=confirmGuidedGoodwill(d,facts);setError('');onChange(captured);}catch(e){setError(e instanceof Error?e.message:'Check actual goodwill originals.');}}}>Confirm complete goodwill originals</button>
  <p role="status">{d.sourceFactsConfirmed===true?'Goodwill originals captured; reconcile all current business facts before calculation.':'Goodwill originals need confirmation.'}</p>
  {error?<p role="alert">{error}</p>:null}
  <p className="guided-hint">The canonical engine computes amortization from admitted originals. This does not qualify a form for filing or enable a 2026 return.</p>
 </fieldset>;
}
