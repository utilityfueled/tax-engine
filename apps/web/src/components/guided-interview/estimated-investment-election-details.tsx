'use client';
import { ESTIMATED_INVESTMENT_AMOUNTS, emptyEstimatedInvestmentElection, type EstimatedInvestmentElectionData, type EstimatedInvestmentWorksheetData, type EstimatedInvestmentAmtData } from '@/lib/guided-estimated-investment-election';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';
import {EstimatedInvestmentHouseholdDetails} from './estimated-investment-household-details';

export function EstimatedInvestmentElectionDetails({ data, onChange }: { data?: EstimatedInvestmentElectionData; onChange: (data: EstimatedInvestmentElectionData | undefined) => void }) {
  if (!data) return <button type="button" onClick={() => onChange(emptyEstimatedInvestmentElection())}>Add actual period investment-interest election originals</button>;
  const update = (patch: Partial<EstimatedInvestmentElectionData>) => onChange({ ...data, ...patch, ...(Object.keys(patch).every(key => key === 'sourceFactsConfirmed') ? {} : { sourceFactsConfirmed: null }) });
  const amt=data.annualAmtCapitalGains ?? {};
  const updateAmt=(patch:Partial<EstimatedInvestmentAmtData>)=>update({annualAmtCapitalGains:{...amt,...patch,...(Object.keys(patch).every(key=>key==='sourceFactsConfirmed')?{}:{sourceFactsConfirmed:null})}});
  return <fieldset style={{ minWidth: 0 }}><legend>Actual Schedule AI investment-interest election originals</legend>
    <p className="guided-hint">For the supported 2025 single-primary or separately source-qualified joint household ordinary method, enter four actual cumulative Form 4952 originals. Enter the actual election and its capital-gain allocation; the app does not choose or optimize an election. Include known zeros. The allowed interest deduction is calculated separately for each period and reconciled to its itemized total. The full-year original must match the separate annual Form 4952 entered in deductions. Other methods remain for review.</p>
    <div className="guided-form-grid">
      {([['sourceTaxYear','Election originals tax year'],['sourceReference','Election originals source reference'],['taxpayerFirstName','Election original taxpayer first name'],['taxpayerLastName','Election original taxpayer last name'],['taxpayerSsnLast4','Election original taxpayer ID last four digits'],['annualForm4952SourceReference','Annual Form 4952 original source reference']] as const).map(([key,label])=><TextFact key={key} label={label} value={data[key] ?? ''} onChange={value=>update({[key]:value})}/>)}
      <label className="guided-field"><span className="guided-field-label">Election original owner</span><select className="guided-input" value={data.accountHolder ?? ''} onChange={event=>update({accountHolder:event.target.value as EstimatedInvestmentElectionData['accountHolder']})}><option value="">Choose actual owner</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse — separate method required</option></select></label>
      <BooleanFact label="All four actual election period originals are complete" value={data.allPeriodsCompleteConfirmed} onChange={allPeriodsCompleteConfirmed=>update({allPeriodsCompleteConfirmed})}/>
      <BooleanFact label="Actual investment-income election is valid" value={data.electionValidConfirmed} onChange={electionValidConfirmed=>update({electionValidConfirmed})}/>
      <BooleanFact label="Other investment income is present outside these originals" value={data.otherInvestmentIncomePresent} onChange={otherInvestmentIncomePresent=>update({otherInvestmentIncomePresent})}/>
    </div>
    <fieldset style={{minWidth:0}}><legend>Separate annual AMT capital gain original</legend><p className="guided-hint">Enter the separately sourced annual AMT amounts, including actual zero special gains. These are not copied from regular tax or the period worksheets.</p><div className="guided-form-grid">
      {([['sourceTaxYear','Annual AMT capital original tax year'],['sourceReference','Annual AMT capital original source reference']] as const).map(([key,label])=><TextFact key={key} label={label} value={amt[key] ?? ''} onChange={value=>updateAmt({[key]:value})}/>)}
      {([['qualifiedDividends','Qualified dividends'],['netCapitalGain','Net capital gain'],['section1250Gain','Section 1250 gain'],['collectiblesGain','Collectibles gain']] as const).map(([key,label])=><CurrencyField key={key} label={`Annual AMT capital original: ${label}`} value={amt[key] ?? ''} onChange={value=>updateAmt({[key]:value})}/>)}
      <BooleanFact label="Annual AMT capital original checked after the last edit" value={amt.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>updateAmt({sourceFactsConfirmed})}/>
    </div></fieldset>
    {(data.periods ?? []).map((period,index)=>{
      const prefix=`Election period ${index+1}`;
      const set=(patch:Partial<typeof period>)=>update({periods:data.periods?.map((row,i)=>i===index?{...row,...patch}:row)});
      const worksheet=period.form4952 ?? {};
      const setWorksheet=(patch:Partial<EstimatedInvestmentWorksheetData>)=>set({form4952:{...worksheet,...patch,...(Object.keys(patch).every(key=>key==='sourceFactsConfirmed')?{}:{sourceFactsConfirmed:null})}});
      return <fieldset key={index} style={{minWidth:0}}><legend>{prefix}</legend><div className="guided-form-grid">
        <TextFact label={`${prefix}: Actual cumulative cutoff date`} type="date" value={period.periodEnd ?? ''} onChange={periodEnd=>set({periodEnd})}/>
        <TextFact label={`${prefix}: Original tax year`} value={worksheet.sourceTaxYear ?? ''} onChange={sourceTaxYear=>setWorksheet({sourceTaxYear})}/>
        <TextFact label={`${prefix}: Original source reference`} value={worksheet.sourceReference ?? ''} onChange={sourceReference=>setWorksheet({sourceReference})}/>
        {ESTIMATED_INVESTMENT_AMOUNTS.map(([key,label])=><CurrencyField key={key} label={`${prefix}: ${label}`} value={worksheet[key] ?? ''} onChange={value=>setWorksheet({[key]:value})}/>)}
        <CurrencyField label={`${prefix}: Other itemized deductions`} value={period.otherItemizedDeductions ?? ''} onChange={otherItemizedDeductions=>set({otherItemizedDeductions})}/>
        <BooleanFact label={`${prefix}: Original checked after the last edit`} value={worksheet.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>setWorksheet({sourceFactsConfirmed})}/>
      </div></fieldset>;
    })}
    <EstimatedInvestmentHouseholdDetails data={data.household} onChange={household=>update({household})}/>
    <BooleanFact label="All investment-election originals checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>update({sourceFactsConfirmed})}/>
    <button type="button" onClick={()=>onChange(undefined)}>Remove period investment-election originals</button>
  </fieldset>;
}
