"use client";

import { RetroShell } from '@/components/retro-shell';
import { copyRoyaltyOriginal, invalidateRoyaltySources, royaltyExpenseFacts, royaltyExcludedAmounts, royaltyPropertyFacts,
  type RoyaltyIncomeData, type RoyaltyMiscData, type RoyaltyPropertyData } from '@/lib/guided-royalty-sources';
import { recoveryMiscAmounts } from '@/lib/guided-mortgage-recoveries';
import { guidedSourceValuesChanged } from '@/lib/guided-source-confirmation';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';
import { PARoyaltySourceDetails } from './pa-royalty-source-details';

function Choice({label,value,onChange,options}:{label:string;value?:string;onChange:(value:string)=>void;options:readonly(readonly[string,string])[]}) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value??''} onChange={event=>onChange(event.target.value)}><option value="">Not answered</option>{options.map(([key,title],index)=><option key={`${key}-${index}`} value={key}>{title}</option>)}</select></label>;
}
const owners=[['primary','Primary taxpayer'],['spouse','Spouse on a joint return']] as const;

export function SectionRoyaltyIncome({data,taxYear,stateCode,onDataChange}:{data?:RoyaltyIncomeData;taxYear?:number|null;stateCode?:string|null;onDataChange:(data:RoyaltyIncomeData|undefined)=>void}) {
  const update=(next:RoyaltyIncomeData)=>onDataChange(guidedSourceValuesChanged(data,next)?invalidateRoyaltySources(next):next);
  const rootPatch=(patch:Partial<RoyaltyIncomeData>)=>update({...data,...patch});
  const statementPatch=(index:number,patch:Partial<RoyaltyMiscData>)=>rootPatch({statements:data?.statements?.map((row,i)=>i===index?{...row,...patch}:row)});
  const propertyPatch=(index:number,patch:Partial<RoyaltyPropertyData>)=>rootPatch({properties:data?.properties?.map((row,i)=>i===index?{...row,...patch}:row)});
  return <RetroShell title="Royalty Income" eyebrow="INCOME // SCHEDULE E">
    <p className="guided-hint">Enter the original royalty statements, property classification and actual cash-paid expense records. Blank amounts are unknown. Enter 0 only when the records establish zero. These records stay in this local workspace.</p>
    {stateCode === "PA" && <p role="status" className="guided-hint">Complete the Pennsylvania classification and expense records below each property to calculate its state royalty income.</p>}
    {!data?<button type="button" className="utility-button" onClick={()=>onDataChange({})}>Add royalty source records</button>:<div className="panel-stack">
      <div className="guided-form-grid">
        <TextFact label="Royalty packet source year" value={data.sourceTaxYear??''} onChange={sourceTaxYear=>rootPatch({sourceTaxYear})}/>
        <TextFact label="Royalty packet source reference" value={data.sourceReference??''} onChange={sourceReference=>rootPatch({sourceReference})}/>
      </div>
      <BooleanFact label="Does this packet include every direct royalty statement and property?" value={data.allDirectRoyaltySourcesIncluded} onChange={allDirectRoyaltySourcesIncluded=>rootPatch({allDirectRoyaltySourcesIncluded})}/>
      {(data.statements??[]).map((statement,index)=>{
        const prefix=`Royalty statement ${index+1}`;return <details className="guided-expand" key={index} open>
          <summary className="guided-expand-trigger">{prefix}</summary><div className="guided-expand-body panel-stack">
            <div className="guided-form-grid">{([['sourceId','source ID'],['sourceTaxYear','source year'],['payer','payer name'],['payerTin','payer TIN'],['accountReference','original account reference']] as const).map(([key,label])=><TextFact key={key} label={`${prefix} ${label}`} value={statement[key]??''} onChange={value=>statementPatch(index,{[key]:value})}/>)}
              <Choice label={`${prefix} original form revision`} value={statement.sourceFormRevision} options={[['2025-04','April 2025'],['2026-12','December 2026']]} onChange={value=>statementPatch(index,{sourceFormRevision:value as RoyaltyMiscData['sourceFormRevision']})}/>
              <Choice label={`${prefix} original owner`} value={statement.accountHolder} options={owners} onChange={value=>statementPatch(index,{accountHolder:value as RoyaltyMiscData['accountHolder']})}/>
              {Object.entries(recoveryMiscAmounts).map(([key,label])=><CurrencyField key={key} label={`${prefix} ${label}`} value={statement[key as keyof typeof recoveryMiscAmounts]??''} onChange={value=>statementPatch(index,{[key]:value})}/>)}
              <Choice label={`${prefix} state reporting`} value={statement.stateTaxReporting} options={[['none','No state reporting'],['single','One state'],['multiple','Multiple states requiring allocation']]} onChange={value=>statementPatch(index,{stateTaxReporting:value as RoyaltyMiscData['stateTaxReporting']})}/>
              <TextFact label={`${prefix} original state code`} value={statement.state??''} onChange={state=>statementPatch(index,{state})}/>
              <TextFact label={`${prefix} original payer state ID`} value={statement.payerStateId??''} onChange={payerStateId=>statementPatch(index,{payerStateId})}/>
            </div>
            <BooleanFact label={`${prefix} direct sales checkbox`} value={statement.directSales} onChange={directSales=>statementPatch(index,{directSales})}/>
            <BooleanFact label={`${prefix} FATCA checkbox`} value={statement.fatcaFilingRequirement} onChange={fatcaFilingRequirement=>statementPatch(index,{fatcaFilingRequirement})}/>
            {(taxYear===2026||statement.cashTips!==undefined||statement.qualifiedOvertimeCompensation!==undefined||statement.tippedOccupationCodePresent!==undefined)&&<div className="guided-form-grid">
              <CurrencyField label={`${prefix} original cash tips`} value={statement.cashTips??''} onChange={cashTips=>statementPatch(index,{cashTips})}/>
              <CurrencyField label={`${prefix} original overtime compensation`} value={statement.qualifiedOvertimeCompensation??''} onChange={qualifiedOvertimeCompensation=>statementPatch(index,{qualifiedOvertimeCompensation})}/>
              <BooleanFact label={`${prefix} tipped occupation code present`} value={statement.tippedOccupationCodePresent} onChange={tippedOccupationCodePresent=>statementPatch(index,{tippedOccupationCodePresent})}/>
            </div>}
            <BooleanFact label={`${prefix} has only royalty income and related withholding`} value={statement.royaltyOnlyIncomeConfirmed} onChange={royaltyOnlyIncomeConfirmed=>statementPatch(index,{royaltyOnlyIncomeConfirmed})}/>
            <BooleanFact label={`${prefix} checked after the last edit`} value={statement.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>statementPatch(index,{sourceFactsConfirmed})}/>
            <button type="button" className="utility-button utility-button-small" onClick={()=>rootPatch({statements:data.statements?.filter((_,i)=>i!==index)})}>Remove royalty statement {index+1}</button>
          </div>
        </details>;
      })}
      <button type="button" className="utility-button" onClick={()=>rootPatch({statements:[...data.statements??[],{}]})}>Add original royalty statement</button>
      {(data.properties??[]).map((property,index)=>{
        const prefix=`Property ${index+1}`;
        return <details className="guided-expand" key={index} open><summary className="guided-expand-trigger">{prefix}</summary><div className="guided-expand-body panel-stack">
          <div className="guided-form-grid">
            <TextFact label={`${prefix} actual identifier`} value={property.propertyId??''} onChange={propertyId=>propertyPatch(index,{propertyId})}/>
            <TextFact label={`${prefix} original property reference`} value={property.propertyReference??''} onChange={propertyReference=>propertyPatch(index,{propertyReference})}/>
            <Choice label={`${prefix} actual owner`} value={property.accountHolder} options={owners} onChange={value=>propertyPatch(index,{accountHolder:value as RoyaltyPropertyData['accountHolder']})}/>
            <Choice label={`${prefix} actual classification`} value={property.propertyType} options={[['copyright','Copyright'],['patent','Patent'],['nil-rights','Name, image or likeness rights'],['nonoperating-mineral','Nonoperating mineral rights']]} onChange={value=>propertyPatch(index,{propertyType:value as RoyaltyPropertyData['propertyType']})}/>
          </div>
          {Object.entries(royaltyPropertyFacts).map(([key,label])=><BooleanFact key={key} label={`${prefix} ${label}`} value={property[key as keyof typeof royaltyPropertyFacts]} onChange={value=>propertyPatch(index,{[key]:value})}/>)}
          <p className="guided-hint">Business and working interests, dispositions, foreign or community-property allocations, property losses, and interest, depreciation, depletion or prior unallowed expenses require separate source methods. Keep those actual answers here; this route will identify the missing method.</p>
          <div className="guided-form-grid">{Object.entries(royaltyExcludedAmounts).map(([key,label])=><CurrencyField key={key} label={`${prefix} ${label}`} value={property[key as keyof typeof royaltyExcludedAmounts]??''} onChange={value=>propertyPatch(index,{[key]:value})}/>)}</div>
          {(property.incomeSources??[]).map((link,linkIndex)=>{
            const label=`${prefix} income link ${linkIndex+1}`;
            const patch=(values:Partial<typeof link>)=>propertyPatch(index,{incomeSources:property.incomeSources?.map((row,i)=>i===linkIndex?{...row,...values}:row)});
            return <fieldset className="guided-form-grid" key={linkIndex}><legend>{label}</legend>
              <Choice label={`${label} original statement`} value={link.sourceId} options={(data.statements??[]).map((row,i)=>[row.sourceId??'',row.sourceId||`Statement ${i+1}: enter its actual source ID first`])} onChange={sourceId=>patch({sourceId})}/>
              <CurrencyField label={`${label} actual gross allocation`} value={link.allocatedGross??''} onChange={allocatedGross=>patch({allocatedGross})}/>
              <button type="button" className="utility-button utility-button-small" onClick={()=>{const original=data.statements?.find(row=>row.sourceId===link.sourceId);if(original)patch({original:copyRoyaltyOriginal(original)});}}>Copy property {index+1} income link {linkIndex+1} original</button>
              <p className="guided-hint">{link.original?`Copied original: ${link.original.payer||'unknown payer'}, ${link.original.accountHolder||'unknown owner'}, year ${link.original.taxYear||'unknown'}, Box 2 ${link.original.royalties||'unknown'}.`:'Original not copied. Copy after checking the statement; enter the actual allocation separately.'}</p>
              <button type="button" className="utility-button utility-button-small" onClick={()=>propertyPatch(index,{incomeSources:property.incomeSources?.filter((_,i)=>i!==linkIndex)})}>Remove property {index+1} income link {linkIndex+1}</button>
            </fieldset>;
          })}
          <button type="button" className="utility-button" onClick={()=>propertyPatch(index,{incomeSources:[...property.incomeSources??[],{}]})}>Add property {index+1} original income link</button>
          <p className="guided-hint">{property.expenses===undefined?'Expense ledger not yet supplied.':property.expenses.length===0?'Actual expense ledger recorded as empty.':`${property.expenses.length} expense records entered.`}</p>
          {(property.expenses??[]).map((expense,expenseIndex)=>{
            const label=`${prefix} expense ${expenseIndex+1}`;const patch=(values:Partial<typeof expense>)=>propertyPatch(index,{expenses:property.expenses?.map((row,i)=>i===expenseIndex?{...row,...values}:row)});
            return <fieldset className="panel-stack" key={expenseIndex}><legend>{label}</legend><div className="guided-form-grid">
              <TextFact label={`${label} original source ID`} value={expense.sourceId??''} onChange={sourceId=>patch({sourceId})}/>
              <TextFact label={`${label} original source reference`} value={expense.sourceReference??''} onChange={sourceReference=>patch({sourceReference})}/>
              <TextFact label={`${label} actual paid date`} type="date" value={expense.paidDate??''} onChange={paidDate=>patch({paidDate})}/>
              <CurrencyField label={`${label} actual amount paid`} value={expense.amountPaid??''} onChange={amountPaid=>patch({amountPaid})}/>
              <Choice label={`${label} actual category`} value={expense.category} options={[['commissions','Commissions'],['insurance','Insurance'],['legal-professional','Legal and professional'],['management-fees','Management fees'],['property-production-taxes','Property or production taxes']]} onChange={value=>patch({category:value as typeof expense.category})}/>
            </div>{Object.entries(royaltyExpenseFacts).map(([key,title])=><BooleanFact key={key} label={`${label} ${title}`} value={expense[key as keyof typeof royaltyExpenseFacts]} onChange={value=>patch({[key]:value})}/>)}
            <button type="button" className="utility-button utility-button-small" onClick={()=>propertyPatch(index,{expenses:property.expenses?.filter((_,i)=>i!==expenseIndex)})}>Remove property {index+1} expense {expenseIndex+1}</button></fieldset>;
          })}
          <div className="guided-form-grid">
            <button type="button" className="utility-button" onClick={()=>propertyPatch(index,{expenses:[...property.expenses??[],{}]})}>Add property {index+1} expense</button>
            <button type="button" className="utility-button" disabled={!!property.expenses?.length} onClick={()=>propertyPatch(index,{expenses:[]})}>Record no property {index+1} expenses</button>
            <button type="button" className="utility-button utility-button-small" disabled={!!property.expenses?.length} onClick={()=>propertyPatch(index,{expenses:undefined})}>Mark property {index+1} expense ledger unknown</button>
          </div>
          {(stateCode === 'PA' || property.paTreatment) && <PARoyaltySourceDetails property={property} index={index}
            sourceTaxYear={data.sourceTaxYear} onChange={paTreatment=>propertyPatch(index,{paTreatment})}/>}
          <button type="button" className="utility-button utility-button-small" onClick={()=>rootPatch({properties:data.properties?.filter((_,i)=>i!==index)})}>Remove royalty property {index+1}</button>
        </div></details>;
      })}
      <button type="button" className="utility-button" onClick={()=>rootPatch({properties:[...data.properties??[],{}]})}>Add royalty property</button>
      <BooleanFact label="Royalty packet checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>rootPatch({sourceFactsConfirmed})}/>
      <button type="button" className="utility-button utility-button-small" onClick={()=>onDataChange(undefined)}>Remove royalty source records</button>
    </div>}
  </RetroShell>;
}
