"use client";
import {ForeignTaxCarryoverDetails} from "./foreign-tax-carryover-details";
import {snapshotForeignTaxSource,type ForeignTaxElectionData,type ForeignTaxSourceData} from '@/lib/guided-foreign-tax-election';
import {isStartedInvestment,type InvestmentData} from '@/lib/guided-investment-facts';
import {BooleanFact,TextFact} from './fact-fields';
import {CurrencyField} from './currency-field';

export function ForeignTaxElectionDetails({data,investment,onChange}:{data?:ForeignTaxElectionData;investment?:InvestmentData;onChange:(data:ForeignTaxElectionData|undefined)=>void}) {
  if(!data)return <div className="guided-w2-card" style={{padding:'12px'}}><h3 className="guided-w2-card-title">Annual foreign income-tax election</h3><p className="guided-hint">Record an actual credit or deduction choice and the paid foreign-tax sources when they apply.</p><button type="button" className="utility-button" onClick={()=>onChange({})}>Add annual foreign-tax election</button></div>;
  const statements=[...(investment?.interestEntries??[]).filter(isStartedInvestment).map((entry,index)=>({entry,id:`form1099Int:${index}`})),...(investment?.dividendEntries??[]).filter(isStartedInvestment).map((entry,index)=>({entry,id:`form1099Div:${index}`}))];
  const update=(changes:Partial<ForeignTaxElectionData>)=>onChange({...data,...changes,sourceFactsConfirmed:null});
  const updateSource=(index:number,changes:Partial<ForeignTaxSourceData>)=>update({sources:data.sources?.map((row,offset)=>offset===index?{...row,...changes}:row)});
  return <div className="guided-w2-card" style={{padding:'12px'}}>
    <h3 className="guided-w2-card-title">Annual foreign income-tax election</h3>
    <p className="guided-hint">The annual choice applies to all qualified foreign income taxes. A deduction and credit cannot be claimed for the same year&apos;s qualified taxes. Use actual source records; leave unknown answers blank. See <a href="https://www.irs.gov/publications/p514" target="_blank" rel="noreferrer">IRS Publication 514</a>.</p>
    <TextFact label="Foreign-tax election year" value={data.taxYear??''} onChange={taxYear=>update({taxYear})}/>
    <label className="guided-field"><span className="guided-field-label">Annual foreign-tax choice</span><select className="guided-input" value={data.election??''} onChange={event=>update({election:(event.target.value||undefined) as ForeignTaxElectionData['election']})}><option value="">Not answered</option><option value="credit">Claim a foreign-tax credit</option><option value="deduction">Deduct qualified foreign income taxes</option></select></label>
    <TextFact label="Annual election source reference" value={data.sourceReference??''} onChange={sourceReference=>update({sourceReference})}/>
    {data.election==='deduction'&&<>
      <p className="guided-hint">This worksheet supports current-year cash-paid taxes on actual interest and dividend statements. Unused credit balances use the carryover worksheet below. Accrued-tax history, pass-through taxes and redeterminations require separate methods. Foreign income taxes are outside the state and local tax cap, but a deduction helps only when it is allowed on the return.</p>
      <label className="guided-field"><span className="guided-field-label">Foreign-tax accounting method</span><select className="guided-input" value={data.accountingMethod??''} onChange={event=>update({accountingMethod:(event.target.value||undefined) as ForeignTaxElectionData['accountingMethod']})}><option value="">Not answered</option><option value="paid">Actual taxes paid</option><option value="accrued">Accrued taxes requiring another worksheet</option></select></label>
      <BooleanFact label="An accrued-credit election was made in an earlier year" value={data.priorAccruedCreditElection} onChange={value=>update({priorAccruedCreditElection:value??undefined})}/>
      <BooleanFact label="All qualified foreign taxes for the year are included here" value={data.allQualifiedForeignTaxesIncludedConfirmed} onChange={value=>update({allQualifiedForeignTaxesIncludedConfirmed:value??undefined})}/>
      <BooleanFact label="No unused foreign-tax credit carryovers enter this year" value={data.noUnusedCreditCarryoversConfirmed} onChange={value=>update({noUnusedCreditCarryoversConfirmed:value??undefined})}/>
      <BooleanFact label="No foreign-tax redetermination affects these sources" value={data.noRedeterminationsConfirmed} onChange={value=>update({noRedeterminationsConfirmed:value??undefined})}/>
    </>}
    {(data.election==='deduction'||data.sources!==undefined)&&<fieldset className="guided-fieldset"><legend>Actual paid foreign-tax sources</legend>
      {data.election==='credit'&&<p className="guided-hint">A credit election cannot retain a foreign-tax deduction. These saved deduction-source records need separate credit-source reconciliation before the credit calculation can use them.</p>}
      {(data.sources??[]).map((source,index)=><fieldset className="guided-fieldset" key={index}><legend>Foreign-tax source {index+1}</legend>
        <label className="guided-field"><span className="guided-field-label">Foreign-tax statement {index+1}</span><select className="guided-input" value={source.sourceId??''} onChange={event=>{
          const selected=statements.find(row=>row.id===event.target.value);update({sources:data.sources?.map((row,offset)=>offset===index?(selected?snapshotForeignTaxSource(selected.entry,selected.id):{}):row)});
        }}><option value="">Select the actual statement</option>{statements.map(row=><option key={row.id} value={row.id}>{row.id.startsWith('form1099Int')?'1099-INT':'1099-DIV'}: {row.entry.payer} — {row.entry.accountReference??'Account reference missing'}</option>)}</select></label>
        {source.sourceId&&<p className="guided-hint">Actual source: {source.payerName}; {source.owner==='primary'?'primary taxpayer':source.owner==='spouse'?'spouse':'owner unresolved'}; country {source.foreignCountry??'unknown'}; reported tax {source.reportedTaxAmount??'unknown'}. Correct source facts in investment income before selecting a replacement.</p>}
        <label className="guided-field"><span className="guided-field-label">Source {index+1} jurisdiction</span><select className="guided-input" value={source.jurisdictionType??''} onChange={event=>updateSource(index,{jurisdictionType:(event.target.value||undefined) as ForeignTaxSourceData['jurisdictionType']})}><option value="">Not answered</option><option value="foreign_country">Foreign country</option><option value="us_territory">U.S. territory requiring separate tax routing</option></select></label>
        <BooleanFact label={`Source ${index+1} is a qualified foreign income tax`} value={source.qualifiedIncomeTaxConfirmed} onChange={value=>updateSource(index,{qualifiedIncomeTaxConfirmed:value??undefined})}/>
        {([['taxOnExcludedIncome','tax on excluded income'],['taxDeductedElsewhere','tax deducted elsewhere'],['investmentAllocableAmount','investment tax allocation']] as const).map(([key,label])=><CurrencyField key={key} label={`Source ${index+1} ${label}`} value={source[key]??''} onChange={value=>updateSource(index,{[key]:value})}/>)}
        <TextFact label={`Source ${index+1} allocation method`} value={source.allocationMethodDescription??''} onChange={allocationMethodDescription=>updateSource(index,{allocationMethodDescription})}/>
        <TextFact label={`Source ${index+1} tax record reference`} value={source.sourceReference??''} onChange={sourceReference=>updateSource(index,{sourceReference})}/>
        <p className="guided-hint">Use the actual payment or withholding date and USD amount. Do not infer a date or exchange rate from an annual total.</p>
        {(source.payments??[]).map((payment,offset)=><div key={offset} className="guided-field-row"><TextFact label={`Source ${index+1} payment ${offset+1} date`} value={payment.date} onChange={date=>updateSource(index,{payments:source.payments?.map((row,rowIndex)=>rowIndex===offset?{...row,date}:row)})}/><CurrencyField label={`Source ${index+1} payment ${offset+1} USD amount`} value={payment.amountUsd} onChange={amountUsd=>updateSource(index,{payments:source.payments?.map((row,rowIndex)=>rowIndex===offset?{...row,amountUsd}:row)})}/><button type="button" className="utility-button" onClick={()=>updateSource(index,{payments:source.payments?.filter((_,rowIndex)=>rowIndex!==offset)})}>Remove payment {offset+1} for source {index+1}</button></div>)}
        <button type="button" className="utility-button" onClick={()=>updateSource(index,{payments:[...(source.payments??[]),{date:'',amountUsd:''}]})}>Add payment for source {index+1}</button>
        <button type="button" className="utility-button" onClick={()=>update({sources:data.sources?.filter((_,offset)=>offset!==index)})}>Remove foreign-tax source {index+1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={()=>update({sources:[...(data.sources??[]),{}]})}>Add foreign-tax statement</button>
      {data.sources===undefined&&<button type="button" className="utility-button" onClick={()=>update({sources:[]})}>Confirm no foreign-tax statements</button>}
    </fieldset>}
    {(data.noUnusedCreditCarryoversConfirmed===false||data.deductionYearCarryover!==undefined)&&<ForeignTaxCarryoverDetails data={data.deductionYearCarryover} investment={investment} onChange={deductionYearCarryover=>update({deductionYearCarryover})}/>}
    <BooleanFact label="Foreign-tax election sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>onChange({...data,sourceFactsConfirmed})}/>
    <button type="button" className="utility-button" onClick={()=>onChange(undefined)}>Remove annual foreign-tax election</button>
  </div>;
}
