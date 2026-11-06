"use client";
import { useState } from "react";
import type { GuidedFlowState, UnemploymentData } from "@/lib/guided-interview-flow";
import { captureGuidedRefundRecoverySources } from "@/lib/guided-interview-bridge";
import { guidedSourceValuesChanged } from "@/lib/guided-source-confirmation";
import { unemploymentEntries, withUnemploymentEntries } from "@/lib/guided-unemployment-facts";
import { refundHistoryAmounts, refundHistoryExclusions, updateGuidedRefundRecoveries, type GuidedRefundRecoveriesData, type GuidedRefundPaymentBasisData, type GuidedRefundYearData } from "@/lib/guided-tax-refund-recoveries";
import { BooleanFact, TextFact } from "./fact-fields";

export function TaxRefundRecoveryDetails({data,state,onChange}:{data:UnemploymentData;state?:GuidedFlowState;onChange:(next:UnemploymentData)=>void}) {
  const [error,setError]=useState("");
  const collection=data.refundRecoveries,entries=unemploymentEntries(data);
  const change=(patch:Partial<GuidedRefundRecoveriesData>)=>{
    const next=updateGuidedRefundRecoveries(collection??{},patch);
    if(JSON.stringify(collection)!==JSON.stringify(next))onChange({...data,refundRecoveries:next});
  };
  const basisChange=(index:number,patch:Partial<GuidedRefundPaymentBasisData>)=>{
    const entry=entries[index];if(!entry)return;
    const previous=entry.refundPaymentBasis,next={...previous,...patch};
    if(previous!==undefined&&!guidedSourceValuesChanged(previous,next)&&previous.sourceFactsConfirmed===next.sourceFactsConfirmed)return;
    const basis=guidedSourceValuesChanged(previous,next)?{...next,sourceFactsConfirmed:null}:next;
    onChange(withUnemploymentEntries(data,entries.map((item,i)=>i===index?{...item,refundPaymentBasis:basis,sourceFactsConfirmed:null}:item)));
  };
  const yearChange=(index:number,patch:Partial<GuidedRefundYearData>)=>{
    const years=collection?.years??[],previous=years[index];if(!previous)return;
    const next={...previous,...patch};
    if(!guidedSourceValuesChanged(previous,next)&&previous.sourceFactsConfirmed===next.sourceFactsConfirmed)return;
    change({years:years.map((year,i)=>i===index?(guidedSourceValuesChanged(previous,next)?{...next,sourceFactsConfirmed:null}:next):year)});
  };
  const capture=()=>{
    try{
      if(!state)throw new Error("Open this source in the guided household before capturing originals.");
      const current={...state,sectionData:{...state.sectionData,"income-unemployment":data}};
      change({...captureGuidedRefundRecoverySources(current),sourceFactsConfirmed:null});setError("");
    }catch(cause){setError(cause instanceof Error?cause.message:"Complete actual original sources before capture.");}
  };
  return <details className="guided-expand"><summary className="guided-expand-trigger">Refund payments made in different years</summary><div className="guided-expand-body">
    <p className="guided-hint">This source route accepts a 2025 single taxpayer under 65, actual 2024 ordinary return facts, and actual state estimated payments recorded in State Return. It does not infer any payment, ownership, negative answer or taxable amount. Use either this collection or the separate legacy worksheet.</p>
    {!collection?<button type="button" className="utility-button" onClick={()=>onChange({...data,refundRecoveries:{}})}>Add mixed-payment-year refund collection</button>:<>
      <TextFact label="Recovery collection receipt year" value={collection.sourceTaxYear??""} onChange={sourceTaxYear=>change({sourceTaxYear})}/>
      <TextFact label="Recovery collection original reference" value={collection.sourceReference??""} onChange={sourceReference=>change({sourceReference})}/>
      <BooleanFact label="All actual refund statements are included in this collection" value={collection.allRefundSourcesIncludedConfirmed} onChange={allRefundSourcesIncludedConfirmed=>change({allRefundSourcesIncludedConfirmed})}/>
      {entries.map((entry,index)=>{const basis=entry.refundPaymentBasis;return <fieldset key={index}><legend>Statement {index+1} original payment basis</legend>{!basis?
        <button type="button" onClick={()=>basisChange(index,{})}>Add dated basis for statement {index+1}</button>:<>
        <TextFact label={`Statement ${index+1} payment ledger reference`} value={basis.sourceReference??""} onChange={sourceReference=>basisChange(index,{sourceReference})}/>
        <TextFact label={`Statement ${index+1} actual refund receipt date`} value={basis.receivedDate??""} onChange={receivedDate=>basisChange(index,{receivedDate})}/>
        <TextFact label={`Statement ${index+1} refunded state`} value={basis.state??""} onChange={state=>basisChange(index,{state})}/>
        <BooleanFact label={`Statement ${index+1} complete original payment inventory`} value={basis.allPaymentsForStateReturnIncludedConfirmed} onChange={allPaymentsForStateReturnIncludedConfirmed=>basisChange(index,{allPaymentsForStateReturnIncludedConfirmed})}/>
        {(basis.payments??[]).map((payment,i)=>{const update=(patch:Partial<typeof payment>)=>basisChange(index,{payments:basis.payments?.map((item,j)=>j===i?{...item,...patch}:item)});return <fieldset key={i}><legend>Statement {index+1} payment {i+1}</legend>
          <TextFact label={`Statement ${index+1} payment ${i+1} original reference`} value={payment.sourceReference??""} onChange={sourceReference=>update({sourceReference})}/>
          <TextFact label={`Statement ${index+1} payment ${i+1} date paid`} value={payment.datePaid??""} onChange={datePaid=>update({datePaid})}/>
          <TextFact label={`Statement ${index+1} payment ${i+1} actual amount`} value={payment.amount??""} onChange={amount=>update({amount})}/>
          <BooleanFact label={`Statement ${index+1} payment ${i+1} is a current-year state estimated payment`} value={payment.currentYearStatePaymentConfirmed} onChange={currentYearStatePaymentConfirmed=>update({currentYearStatePaymentConfirmed})}/>
          <button type="button" onClick={()=>basisChange(index,{payments:basis.payments?.filter((_,j)=>j!==i)})}>Remove statement {index+1} payment {i+1}</button>
        </fieldset>;})}
        <button type="button" onClick={()=>basisChange(index,{payments:[...(basis.payments??[]),{}]})}>Add payment to statement {index+1}</button>
        <BooleanFact label={`Statement ${index+1} payment basis checked after the last edit`} value={basis.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>basisChange(index,{sourceFactsConfirmed})}/>
      </>}</fieldset>;})}
      {(collection.years??[]).map((year,index)=><fieldset key={index}><legend>Historical return {index+1}</legend>
        <TextFact label="Actual historical deduction year" value={year.priorTaxYear??""} onChange={priorTaxYear=>yearChange(index,{priorTaxYear})}/>
        <TextFact label="Historical return original reference" value={year.sourceReference??""} onChange={sourceReference=>yearChange(index,{sourceReference})}/>
        <label className="guided-field"><span>Historical return filing status</span><select value={year.priorYearFilingStatus??""} onChange={event=>yearChange(index,{priorYearFilingStatus:event.target.value==="single"?"single":undefined})}><option value="">Choose from original return</option><option value="single">Single</option></select></label>
        <TextFact label="Historical primary taxpayer SSN" value={year.priorYearPrimarySsn??""} onChange={priorYearPrimarySsn=>yearChange(index,{priorYearPrimarySsn})}/>
        <BooleanFact label="Historical return itemized deductions" value={year.priorYearItemized} onChange={value=>yearChange(index,{priorYearItemized:value??undefined})}/>
        <label className="guided-field"><span>Historical state tax election</span><select value={year.priorYearStateLocalTaxElection??""} onChange={event=>yearChange(index,{priorYearStateLocalTaxElection:event.target.value==="income"?"income":event.target.value==="sales"?"sales":undefined})}><option value="">Choose from actual Schedule A</option><option value="income">Income tax</option><option value="sales">Sales tax</option></select></label>
        {refundHistoryAmounts.map(([key,label])=><TextFact key={key} label={label} value={year[key]??""} onChange={value=>yearChange(index,{[key]:value})}/>)}
        {refundHistoryExclusions.map(([key,label])=><BooleanFact key={key} label={label} value={year[key]} onChange={value=>yearChange(index,{[key]:value??undefined})}/>)}
        <BooleanFact label="Historical return facts checked after the last edit" value={year.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>yearChange(index,{sourceFactsConfirmed})}/>
        <button type="button" onClick={()=>change({years:collection.years?.filter((_,i)=>i!==index)})}>Remove historical return {index+1}</button>
      </fieldset>)}
      <button type="button" onClick={()=>change({years:[...(collection.years??[]),{}]})}>Add historical return</button>
      <button type="button" onClick={capture}>Capture current refund payment-year originals</button>
      <p>{collection.originalSources?"Original household, statements and current payment records captured. Capture again explicitly after source edits.":"No original source snapshot has been captured."}</p>
      {error&&<p role="alert">{error}</p>}
      <BooleanFact label="Refund payment-year collection checked after the last edit" value={collection.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>change({sourceFactsConfirmed})}/>
      <button type="button" onClick={()=>onChange({...data,refundRecoveries:undefined})}>Remove mixed-payment-year collection</button>
    </>}
  </div></details>;
}
