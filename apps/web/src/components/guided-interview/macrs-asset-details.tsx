'use client';
import {useState} from 'react';
import {CurrencyField,isValidCurrencyValue,parseCurrencyInput} from './currency-field';
import {TextFact,BooleanFact} from './fact-fields';
import type {BusinessSourceData} from '@/lib/guided-business-facts';
import {confirmGuidedMacrsAsset,confirmGuidedMacrsCollection,macrsCollectionQuestions,macrsRowQuestions,type GuidedMacrsAssetsDraft,type GuidedMacrsAssetRow} from '@/lib/guided-macrs-assets';

/** Every original is captured by an explicit action, never by render or migration. */
export function MacrsAssetDetails({facts,onChange}:{facts:BusinessSourceData;onChange:(draft:GuidedMacrsAssetsDraft)=>void}){
 const d=facts.macrsAssets??{};const[error,setError]=useState('');
 if(typeof d!=='object'||Array.isArray(d)||(d.rows!==undefined&&(!Array.isArray(d.rows)||d.rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))))return <fieldset className="guided-fieldset"><legend>Actual first-year ordinary asset records</legend><p role="alert">The saved asset collection has an unsupported structure. Its original facts are retained; review the actual records before using this method.</p></fieldset>;
 function patch(next:Partial<GuidedMacrsAssetsDraft>){setError('');onChange({...d,...next,sourceFactsConfirmed:null});}
 function rowPatch(i:number,next:Partial<GuidedMacrsAssetRow>){const old=d.rows?.[i];if(!old||Object.entries(next).every(([k,v])=>Object.is(old[k as keyof GuidedMacrsAssetRow],v)))return;patch({rows:d.rows?.map((r,n)=>n===i?{...r,...next,sourceFactsConfirmed:null}:r)});}
 const text=(label:string,value:string|undefined,change:(v:string)=>void)=><TextFact label={label} value={value??''} onChange={change}/>;
 const select=(label:string,value:string|undefined,options:readonly(readonly[string,string])[],change:(v:string)=>void)=><label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value??''} onChange={e=>change(e.target.value)}><option value="">Confirm from actual records</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
 return <fieldset className="guided-fieldset"><legend>Actual first-year ordinary asset records</legend>
  <p className="guided-hint">This method supports one cash Schedule C activity, current-year ordinary nonlisted property, and documented zero section179 and bonus. Keep the complete inventory and completed classification/election worksheets. Blank answers remain unknown. Other activities, listed property, positive elections and later-year assets require their separate source method.</p>
  {text('Actual asset source tax year',d.sourceTaxYear,sourceTaxYear=>{if(sourceTaxYear!==d.sourceTaxYear)patch({sourceTaxYear});})}
  {text('Complete asset inventory source reference',d.sourceReference,sourceReference=>{if(sourceReference!==d.sourceReference)patch({sourceReference});})}
  {(Object.keys(macrsCollectionQuestions) as Array<keyof typeof macrsCollectionQuestions>).map(k=><BooleanFact key={k} label={macrsCollectionQuestions[k]} value={d[k]} onChange={value=>{if(value!==d[k])patch({[k]:value});}}/>)}
  {(d.rows??[]).map((r,i)=><fieldset className="guided-fieldset" key={i}><legend>Original asset {i+1}</legend>
   {text(`Asset ${i+1} original reference`,r.assetReference,assetReference=>rowPatch(i,{assetReference}))}
   {text(`Asset ${i+1} description`,r.description,description=>rowPatch(i,{description}))}
   {text(`Asset ${i+1} full placed-in-service date`,r.placedInServiceDate,placedInServiceDate=>rowPatch(i,{placedInServiceDate}))}
   {select(`Asset ${i+1} actual recovery class`,r.recoveryPeriod,[['3','3 years'],['5','5 years'],['7','7 years'],['10','10 years']],recoveryPeriod=>rowPatch(i,{recoveryPeriod}))}
   {select(`Asset ${i+1} actual depreciation method`,r.method,[['200DB','GDS200% declining balance']],method=>rowPatch(i,{method}))}
   {(['grossCostBasis','section179BusinessDeduction','bonusBusinessDeduction'] as const).map(k=><CurrencyField key={k} label={`Asset ${i+1} ${k==='grossCostBasis'?'actual gross basis':k==='section179BusinessDeduction'?'actual business section179 deduction':'actual business bonus deduction'}`} value={r[k]??''} onChange={raw=>rowPatch(i,{[k]:isValidCurrencyValue(raw)?parseCurrencyInput(raw):raw})}/>)}
   {text(`Asset ${i+1} actual business use percentage`,r.businessUsePercentage,businessUsePercentage=>rowPatch(i,{businessUsePercentage}))}
   {(['grossBasisSourceReference','businessUseSourceReference','section179SourceReference','bonusSourceReference'] as const).map(k=><TextFact key={k} label={`Asset ${i+1} ${k==='grossBasisSourceReference'?'gross basis original':k==='businessUseSourceReference'?'business use original':k==='section179SourceReference'?'zero179 completed worksheet':'zero-bonus completed worksheet'}`} value={r[k]??''} onChange={value=>rowPatch(i,{[k]:value})}/>)}
   {select(`Asset ${i+1} actual zero-bonus treatment`,r.bonusZeroTreatment,[['not_eligible','Completed worksheet establishes no eligibility'],['elected_out','Actual completed election-out record']],bonusZeroTreatment=>rowPatch(i,{bonusZeroTreatment:bonusZeroTreatment as GuidedMacrsAssetRow['bonusZeroTreatment']}))}
   {text(`Asset ${i+1} zero-bonus treatment original`,r.bonusTreatmentSourceReference,bonusTreatmentSourceReference=>rowPatch(i,{bonusTreatmentSourceReference}))}
   {(Object.keys(macrsRowQuestions) as Array<keyof typeof macrsRowQuestions>).map(k=><BooleanFact key={k} label={`Asset ${i+1}: ${macrsRowQuestions[k]}`} value={r[k]} onChange={value=>rowPatch(i,{[k]:value})}/>)}
   <button type="button" onClick={()=>{try{const original=confirmGuidedMacrsAsset(r,d);patch({rows:d.rows?.map((row,n)=>n===i?original:row)});}catch{setError('Complete the actual asset facts and supporting worksheet records before confirming.');}}}>Confirm original asset {i+1} after the last edit</button>
   <p className="guided-hint">{r.sourceFactsConfirmed===true?'Original asset snapshot confirmed.':'Original asset still needs confirmation.'}</p>
   <button type="button" onClick={()=>patch({rows:d.rows?.filter((_,n)=>n!==i)})}>Remove original asset {i+1}</button>
  </fieldset>)}
  <button type="button" onClick={()=>patch({rows:[...(d.rows??[]),{}]})}>Add actual ordinary asset</button>
  <button type="button" onClick={()=>{try{const confirmed=confirmGuidedMacrsCollection(d,facts);setError('');onChange(confirmed);}catch{setError('Complete all actual asset originals, current business identity, inventory and separate zero deduction records before confirming.');}}}>Confirm complete asset inventory after the last edit</button>
  <p role="status">{d.sourceFactsConfirmed===true?'Actual asset inventory confirmed; current return validation still applies.':'Actual asset inventory needs source review.'}</p>
  {error?<p role="alert">{error}</p>:null}
  <p className="guided-hint">The convention is calculated from the complete admitted inventory. This collector does not establish eligibility, make elections, qualify official forms or enable filing.</p>
 </fieldset>;
}
