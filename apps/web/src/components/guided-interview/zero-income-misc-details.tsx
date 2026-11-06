'use client';
import {useState} from 'react';
import {supportedStates} from '@/lib/guided-interview-flow';
import {confirmZeroIncomeMiscSource,emptyZeroIncomeMiscSource,updateZeroIncomeMiscSource,zeroIncomeMiscAmounts,zeroIncomeMiscFacts,zeroIncomeMiscReceiptText,zeroIncomeMiscText,type ZeroIncomeMiscSourceDraft} from '@/lib/guided-zero-income-misc-sources';
import {BooleanFact,TextFact} from './fact-fields';
import {CurrencyField} from './currency-field';

function SelectFact({label,value,choices,onChange}:{label:string;value:string;choices:ReadonlyArray<readonly[string,string]>;onChange:(v:string)=>void}){
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event=>onChange(event.target.value)}><option value="">Confirm from actual original</option>{choices.map(([key,name])=><option value={key} key={key}>{name}</option>)}</select></label>;
}
function PrivateSsn({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" type="password" autoComplete="off" spellCheck={false} value={value} onChange={event=>onChange(event.target.value)}/></label>;
}
/** Capture actual source originals privately; no taxpayer identity or source year is copied in. */
export function ZeroIncomeMiscDetails({data,taxYear,filingStatus,onChange}:{data?:ZeroIncomeMiscSourceDraft[];taxYear?:number|null;filingStatus?:string|null;onChange:(rows:ZeroIncomeMiscSourceDraft[])=>void}){
  const [message,setMessage]=useState('');const rows=data??[];
  function update(index:number,patch:Partial<ZeroIncomeMiscSourceDraft>){setMessage('');onChange(rows.map((row,i)=>i===index?updateZeroIncomeMiscSource(row,patch):row));}
  function confirm(index:number){
    const row=rows[index];if(!row)return;
    try{const confirmed=confirmZeroIncomeMiscSource(row,taxYear,filingStatus);onChange(rows.map((value,i)=>i===index?confirmed:value));setMessage('Original source confirmed. State eligibility requires its separate actual source records.');}
    catch{setMessage('Complete every actual original and matching remittance fact before confirming. Other income, corrected forms or multiple state rows need their separate source method.');}
  }
  return <section className="guided-card" aria-label="Actual zero-income MISC originals">
    <h3 className="guided-card-title">Actual zero-income 1099-MISC originals</h3>
    <p>Use this for a current 2025 original with no income and actual state withholding. Enter each original box, including known zero, and the payer’s matching remittance record. Other income and corrected originals require their own income source method.</p>
    <p>Enter the recipient facts shown on the original. They must match the selected taxpayer when the source is used. These private fields do not create a state tax credit or confirm a state return.</p>
    {rows.map((row,index)=>{
      const label=(name:string)=>`MISC ${index+1} ${name}`;
      return <div className="guided-card" key={index}>
        <h4>Original {index+1}</h4>
        <div className="guided-form-grid">
          {Object.entries(zeroIncomeMiscText).map(([key,name])=><TextFact key={key} label={label(name)} value={row[key as keyof typeof zeroIncomeMiscText]} onChange={value=>update(index,{[key]:value})}/>)}
          <PrivateSsn label={label('recipient SSN')} value={row.recipientSsn} onChange={recipientSsn=>update(index,{recipientSsn})}/>
          <SelectFact label={label('original owner')} value={row.accountHolder} choices={filingStatus==='mfj'?[['primary','Primary taxpayer'],['spouse','Spouse']]:[['primary','Primary taxpayer']]} onChange={value=>update(index,{accountHolder:value as ZeroIncomeMiscSourceDraft['accountHolder']})}/>
          <SelectFact label={label('original form revision')} value={row.sourceFormRevision} choices={[['2025-04','April2025 original']]} onChange={sourceFormRevision=>update(index,{sourceFormRevision})}/>
          {Object.entries(zeroIncomeMiscAmounts).map(([key,name])=><CurrencyField key={key} label={label(name)} value={row[key as keyof typeof zeroIncomeMiscAmounts]} onChange={value=>update(index,{[key]:value})}/>)}
          <SelectFact label={label('original state reporting')} value={row.stateTaxReporting} choices={[['none','Original has no state rows'],['single','One actual original state row'],['multiple','Multiple actual original state rows']]} onChange={value=>update(index,{stateTaxReporting:value as ZeroIncomeMiscSourceDraft['stateTaxReporting']})}/>
          <SelectFact label={label('Box 17 state')} value={row.state} choices={supportedStates.map(state=>[state.code,state.name] as const)} onChange={state=>update(index,{state})}/>
          {Object.entries(zeroIncomeMiscFacts).map(([key,name])=><BooleanFact key={key} label={label(name)} value={row[key as keyof typeof zeroIncomeMiscFacts]} onChange={value=>update(index,{[key]:value})}/>)}
        </div>
        <h4>Actual payer remittance record</h4>
        <p>This record must identify the same original recipient, payer, account, year and state, and show the exact amount actually remitted. A generic payment total does not establish these facts.</p>
        <div className="guided-form-grid">
          {Object.entries(zeroIncomeMiscReceiptText).map(([key,name])=>key==='recipientSsn'?<PrivateSsn key={key} label={label(name)} value={row.remittance.recipientSsn} onChange={recipientSsn=>update(index,{remittance:{...row.remittance,recipientSsn}})}/>:key==='amountPaid'?<CurrencyField key={key} label={label(name)} value={row.remittance.amountPaid} onChange={amountPaid=>update(index,{remittance:{...row.remittance,amountPaid}})}/>:<TextFact key={key} label={label(name)} type={key==='paidDate'||key==='sourceAsOfDate'?'date':'text'} value={row.remittance[key as keyof typeof zeroIncomeMiscReceiptText]} onChange={value=>update(index,{remittance:{...row.remittance,[key]:value}})}/>)}
          <BooleanFact label={label('Actual state withholding was remitted')} value={row.remittance.actuallyRemittedConfirmed} onChange={actuallyRemittedConfirmed=>update(index,{remittance:{...row.remittance,actuallyRemittedConfirmed}})}/>
          <BooleanFact label={label('Payer has not refunded this withholding')} value={row.remittance.notRefundedByPayerConfirmed} onChange={notRefundedByPayerConfirmed=>update(index,{remittance:{...row.remittance,notRefundedByPayerConfirmed}})}/>
        </div>
        <button type="button" onClick={()=>confirm(index)}>Confirm actual zero-income MISC original {index+1}</button>
        <p>{row.sourceFactsConfirmed===true?'Original privately retained after explicit confirmation.':'Original source needs explicit confirmation.'}</p>
        <button type="button" onClick={()=>{setMessage('');onChange(rows.filter((_,i)=>i!==index));}}>Remove zero-income MISC original {index+1}</button>
      </div>;
    })}
    <button type="button" onClick={()=>{setMessage('');onChange([...rows,emptyZeroIncomeMiscSource()]);}}>Add actual zero-income MISC original</button>
    {message&&<p role="status">{message}</p>}
  </section>;
}
