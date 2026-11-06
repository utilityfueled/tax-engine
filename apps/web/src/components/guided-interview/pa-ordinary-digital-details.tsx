"use client";
import {useState} from 'react';
import type {TaxYearInput} from '@/models/inputs';
import type {PAResidencySources} from '@/models/pa-residency';
import type {PAOrdinaryDigitalSources} from '@/models/pa-ordinary-digital-sources';
import {startGuidedPAOrdinaryDigitalSources,updateGuidedPAOrdinaryDigitalSources,confirmGuidedPAOrdinaryDigitalSources} from '@/lib/guided-pa-ordinary-digital-sources';
import {TextFact,BooleanFact} from './fact-fields';
export function PAOrdinaryDigitalDetails({originalInput,residencySources,onChange}:{originalInput:TaxYearInput|null;residencySources:PAResidencySources;onChange:(data:PAResidencySources)=>void}){
 const [error,setError]=useState(''),d=residencySources.digitalSources;
 const save=(data:PAOrdinaryDigitalSources)=>{setError('');onChange({...residencySources,digitalSources:data,sourceFactsConfirmed:null});};
 const edit=(patch:Partial<PAOrdinaryDigitalSources>)=>{if(d)save(updateGuidedPAOrdinaryDigitalSources(d,patch));};
 return <section className="panel-stack" aria-label="Actual Pennsylvania digital capital records"><h3 className="guided-section-subheading">Actual Pennsylvania digital capital records</h3>
 <p className="guided-hint">Use the original digital statements and separately checked Pennsylvania basis records entered under investments. Check every statement and the actual withholding payments. This method currently covers one full-year resident owner and ordinary capital sales; other residency and adjustment methods need separate records.</p>
 {!d?<button type="button" onClick={()=>save(startGuidedPAOrdinaryDigitalSources(originalInput))}>Add actual PA digital capital sources</button>:<>
 <label className="guided-field"><span className="guided-field-label">PA digital source tax year</span><input className="guided-input" type="number" step="1" value={d.sourceTaxYear??''} onChange={e=>edit({sourceTaxYear:e.target.value===''?null:Number(e.target.value)})}/></label>
 <TextFact label="PA digital original source reference" value={d.sourceReference} onChange={sourceReference=>edit({sourceReference})}/>
 <BooleanFact label="PA digital records include every original digital statement" value={d.allOriginalDigitalStatementsIncludedConfirmed} onChange={allOriginalDigitalStatementsIncludedConfirmed=>edit({allOriginalDigitalStatementsIncludedConfirmed})}/>
 <BooleanFact label="PA digital records establish no other capital adjustments" value={d.noOtherCapitalAdjustmentsConfirmed} onChange={noOtherCapitalAdjustmentsConfirmed=>edit({noOtherCapitalAdjustmentsConfirmed})}/>
 {d.statements.map((row,i)=>{const patch=(v:Partial<typeof row>)=>edit({statements:d.statements.map((r,j)=>i===j?{...r,...v}:r)});return <fieldset key={i}><legend>PA digital original {i+1}</legend>
 <label className="guided-field"><span className="guided-field-label">PA digital {i+1} entered original statement</span><select className="guided-input" value={row.originalIndex??''} onChange={e=>patch({originalIndex:e.target.value===''?null:Number(e.target.value),sourceFactsConfirmed:null})}><option value="">Choose actual original</option>{(originalInput?.form1099DA??[]).map((f,index)=><option key={index} value={index}>Entered original {index+1}: {f.brokerName}</option>)}</select></label>
 <TextFact label={`PA digital ${i+1} actual source reference`} value={row.sourceReference} onChange={sourceReference=>patch({sourceReference,sourceFactsConfirmed:null})}/>
 <BooleanFact label={`PA digital ${i+1} original and basis records checked`} value={row.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>patch({sourceFactsConfirmed})}/>
 <BooleanFact label={`PA digital ${i+1} actual withholding was paid to Pennsylvania`} value={row.actualPaymentToPAConfirmed} onChange={actualPaymentToPAConfirmed=>patch({actualPaymentToPAConfirmed,sourceFactsConfirmed:null})}/>
 <BooleanFact label={`PA digital ${i+1} withholding was not refunded by the payer`} value={row.notRefundedByPayerConfirmed} onChange={notRefundedByPayerConfirmed=>patch({notRefundedByPayerConfirmed,sourceFactsConfirmed:null})}/>
 <button type="button" onClick={()=>edit({statements:d.statements.filter((_,j)=>j!==i)})}>Remove PA digital original {i+1}</button></fieldset>;})}
 <button type="button" onClick={()=>edit({statements:[...d.statements,{originalIndex:null,sourceReference:'',sourceFactsConfirmed:null,actualPaymentToPAConfirmed:null,notRefundedByPayerConfirmed:null}]})}>Add actual PA digital original</button>
 <button type="button" onClick={()=>{try{if(!originalInput||residencySources.residency.status==='')throw new Error('Current original statements and actual residency records are required.');save(confirmGuidedPAOrdinaryDigitalSources(originalInput,d,residencySources.residency.status));}catch(e){setError(e instanceof Error?e.message:'Reconcile actual digital source records.');}}}>Confirm actual PA digital sources after the last edit</button>
 <p className="guided-hint">{d.sourceFactsConfirmed===true?'Original digital records retained. Confirm the containing PA residency and return records next.':'Reconcile and confirm current original digital records after every edit.'}</p>
 <button type="button" onClick={()=>onChange({...residencySources,digitalSources:undefined,sourceFactsConfirmed:null})}>Remove PA digital capital sources</button>
 </>}{error&&<p role="alert">{error}</p>}</section>;
}
