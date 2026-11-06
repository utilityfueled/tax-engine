"use client";
/** Native originals only. Spec: spec/federal/guided-rrta-payroll.yaml. */
import {useState} from 'react';
import type {GuidedFlowState} from '@/lib/guided-interview-flow';
import {captureGuidedRRTAPayrollSources} from '@/lib/guided-interview-bridge';
import {emptyGuidedRRTA,emptyGuidedRRTARow,updateGuidedRRTA,type GuidedRRTADraft,type GuidedRRTARow} from '@/lib/guided-rrta-payroll-sources';
import {tipIncomeW2Options} from '@/lib/guided-tip-income-facts';
import {BooleanFact,TextFact} from './fact-fields';
import {CurrencyField} from './currency-field';
const checks=[['allRRTASourcesIncludedConfirmed','All railroad compensation sources are included'],['noEmployeeRepresentativeCompensationConfirmed','No employee representative compensation'],['noCorrectionsConfirmed','No payroll corrections or settlements requiring adjustments'],['noOtherRRTATaxAdjustmentsConfirmed','No other railroad tax adjustments'],['noSelfEmploymentIncomeConfirmed','No self-employment income']] as const;
export function RRTAPayrollSourceDetails({state,data,onChange}:{state:GuidedFlowState;data?:GuidedRRTADraft;onChange:(next:GuidedRRTADraft|undefined)=>void}){
 const[status,setStatus]=useState('');
 function set(patch:Partial<GuidedRRTADraft>){if(!data)return;onChange(updateGuidedRRTA(data,{...data,...patch}));setStatus('');}
 function capture(){try{const current={...state,sectionData:{...state.sectionData,'additional-deductions':{...state.sectionData['additional-deductions'],rrtaPayrollSources:data}}};onChange(captureGuidedRRTAPayrollSources(current));setStatus('Original payroll sources captured. Confirm after reviewing the last edit.');}catch(error){setStatus(error instanceof Error?error.message:'Reconcile actual RRTA original sources.');}}
 const w2s=tipIncomeW2Options(state.sectionData['income-w2']?.entries);
 return <section aria-label="Original railroad payroll sources"><h4>Original railroad payroll sources</h4><p>Use actual W-2 Box 14 and annual railroad payroll records. This source method supports one railroad employer per tip owner on an ordinary2025 single or joint return. Railroad-covered tips, employee representatives, corrections, excess Tier1 withholding and self-employment require another method. Enter checked zeros explicitly. A regular Tier1 tax payment is not Additional Medicare withholding.</p>
 {!data?<button type="button" onClick={()=>onChange(emptyGuidedRRTA())}>Add original railroad payroll sources</button>:<>
 <TextFact label="RRTA collection source tax year" value={data.sourceTaxYear} onChange={sourceTaxYear=>set({sourceTaxYear})}/><TextFact label="RRTA collection source reference" value={data.sourceReference} onChange={sourceReference=>set({sourceReference})}/>
 {checks.map(([field,label])=><BooleanFact key={field} label={label} value={data[field]} onChange={value=>set({[field]:value})}/>)}
 {data.sources.map((row,index)=>{const prefix=`Railroad original ${index+1}`,current=data;function rowSet(patch:Partial<GuidedRRTARow>){set({sources:current.sources.map((v,i)=>i===index?{...v,...patch,sourceFactsConfirmed:'sourceFactsConfirmed' in patch?(patch.sourceFactsConfirmed??null):null}:v)});}
 return <fieldset key={index}><legend>{prefix}</legend>
 <label className="guided-field"><span className="guided-field-label">{prefix}: Actual owner</span><select className="guided-input" value={row.owner} onChange={event=>rowSet({owner:event.target.value as GuidedRRTARow['owner']})}><option value="">Unknown</option><option value="primary">You</option><option value="spouse">Spouse on joint return</option></select></label>
 <label className="guided-field"><span className="guided-field-label">{prefix}: Actual W-2 source</span><select className="guided-input" value={row.w2SourceId} onChange={event=>rowSet({w2SourceId:event.target.value})}><option value="">Unknown</option>{row.w2SourceId&&!w2s.some(w=>w.sourceId===row.w2SourceId)&&<option value={row.w2SourceId}>Saved source needs reconciliation</option>}{w2s.filter(w=>w.accountHolder===row.owner).map(w=><option key={w.sourceId} value={w.sourceId}>{w.employerName} — {w.sourceId}</option>)}</select></label>
 {([['sourceId','Source label'],['sourceTaxYear','Source tax year'],['sourceReference','Original reference']] as const).map(([field,label])=><TextFact key={field} label={`${prefix}: ${label}`} value={row[field]} onChange={value=>rowSet({[field]:value})}/>)}
 {([['tier1SocialSecurityCompensation','Actual Tier1 Social Security compensation'],['tier1MedicareCompensation','Actual Tier1 Medicare compensation'],['additionalMedicareTaxWithheld','Actual Additional Medicare tax withheld']] as const).map(([field,label])=><CurrencyField key={field} label={`${prefix}: ${label}`} value={row[field]} onChange={value=>rowSet({[field]:value})}/>)}
 {([['ordinaryBox1EqualsMedicareCompensationConfirmed','Actual Box 1 equals railroad Medicare compensation'],['nonRRTAPayrollBoxesKnownZeroConfirmed','Ordinary FICA boxes 3 4 5 6 7 and8 are checked zero'],['noRailroadTipsConfirmed','No railroad-covered tips'],['sourceFactsConfirmed','Original row checked after the last edit']] as const).map(([field,label])=><BooleanFact key={field} label={`${prefix}: ${label}`} value={row[field]} onChange={value=>rowSet({[field]:value})}/>)}
 <button type="button" onClick={()=>set({sources:data.sources.filter((_,i)=>i!==index)})}>Remove {prefix}</button></fieldset>;})}
 <button type="button" disabled={data.sources.length>=2} onClick={()=>set({sources:[...data.sources,emptyGuidedRRTARow()]})}>Add actual railroad original</button>
 <button type="button" onClick={capture}>Capture reviewed original railroad payroll sources</button>
 <BooleanFact label="RRTA originals confirmed after capture and the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>set({sourceFactsConfirmed})}/>
 <button type="button" onClick={()=>{onChange(undefined);setStatus('');}}>Remove railroad source method</button>
 </>}{status&&<p role="status">{status}</p>}</section>;
}
