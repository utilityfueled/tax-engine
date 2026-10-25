"use client";
import type { ForeignCarryoverData } from '@/lib/guided-foreign-tax-carryover';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({label,value,options,onChange}:{label:string;value?:string;options:readonly(readonly[string,string])[];onChange:(value:string|undefined)=>void}) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value??''} onChange={event=>onChange(event.target.value||undefined)}><option value="">Not answered</option>{options.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>;
}
export function ForeignTaxItemizedAllocationDetails({ allocation, onChange, purpose = 'deduction' }: { allocation?: ForeignCarryoverData['itemizedAllocation']; onChange: (data: ForeignCarryoverData['itemizedAllocation']) => void; purpose?: 'deduction' | 'credit' }) {
  const updateAllocation=(patch:Partial<NonNullable<ForeignCarryoverData['itemizedAllocation']>>)=>{
    const next={...allocation,...patch,sourceFactsConfirmed:undefined};
    if(next.stateAllocation)next.stateAllocation={...next.stateAllocation,sourceFactsConfirmed:undefined};
    onChange(next);
  };
  const stateMethod=allocation?.stateAllocation;
  const updateMethod=(patch:Partial<NonNullable<typeof stateMethod>>)=>updateAllocation({stateAllocation:{...stateMethod,...patch}});
  return allocation?<fieldset className="guided-fieldset"><legend>{purpose === 'deduction' ? 'Hypothetical allowed itemized deduction sources' : 'Actual allowed itemized deduction sources'}</legend>
      <p className="guided-hint">{purpose === 'deduction' ? 'Complete this when the return would still itemize after removing the foreign income-tax deduction.' : 'Complete this when this return itemizes. Enter the actual allowed source amounts.'} Use actual allowed state/local components, including any cap allocation. State income taxes require the complete jurisdiction worksheet and actual method history. Include states that exempt foreign income or impose no income tax; use actual nonoverlapping income attribution, not a guessed split.</p>
      <TextFact label="Itemized allocation source reference" value={allocation.sourceReference??''} onChange={sourceReference=>updateAllocation({sourceReference})}/>
      {([['incomeOrSalesTaxes','Allowed income or sales taxes'],['homeRealPropertyTaxes','Allowed personal-home real estate taxes'],['personalPropertyTaxes','Allowed personal property taxes']] as const).map(([key,label])=><CurrencyField key={key} label={label} value={allocation[key]??''} onChange={value=>updateAllocation({[key]:value})}/>)}
      <BooleanFact label="All allocated real estate taxes are for a personal residence" value={allocation.allRealPropertyTaxesForPersonalResidenceConfirmed} onChange={value=>updateAllocation({allRealPropertyTaxesForPersonalResidenceConfirmed:value??undefined})}/>
      <BooleanFact label="No charitable deduction is allocated under a foreign treaty" value={allocation.noTreatyCharitableDeductionConfirmed} onChange={value=>updateAllocation({noTreatyCharitableDeductionConfirmed:value??undefined})}/>
      <Choice label="Actual mortgage-interest allocation method" value={allocation.mortgageInterestMethod} options={[["gross_income","Gross-income method"],["us_source_small_foreign_income","Elect U.S.-source interest allocation when gross foreign income is at most $5,000"]]} onChange={method=>updateAllocation({mortgageInterestMethod:method as NonNullable<ForeignCarryoverData['itemizedAllocation']>['mortgageInterestMethod']})}/>
      <fieldset className="guided-fieldset"><legend>Actual state jurisdiction worksheet</legend>
        <p className="guided-hint">The ordinary method combines eligible state bases once. An existing safe-harbor election or another binding method needs its own calculation. Enter a completed reasonable attribution of U.S. taxable income to each no-tax state, including known zero when applicable.</p>
        <Choice label="Actual state income-tax allocation method" value={stateMethod?.method} options={[["ordinary_presumption","Ordinary taxable-source presumption"],["existing_safe_harbor_or_other","Existing safe-harbor election or other method"]]} onChange={method=>updateMethod({method:method as NonNullable<typeof stateMethod>['method']})}/>
        <TextFact label="State jurisdiction worksheet source reference" value={stateMethod?.sourceReference??''} onChange={sourceReference=>updateMethod({sourceReference})}/>
        {([['methodHistoryConfirmed','State allocation method history checked'],['allStateSourcesIncludedConfirmed','All taxing and no-tax state sources are included'],['nonoverlappingIncomeConfirmed','State source income does not overlap']] as const).map(([key,label])=><BooleanFact key={key} label={label} value={stateMethod?.[key]} onChange={value=>updateMethod({[key]:value??undefined})}/>)}
        {(stateMethod?.noTaxStateIncome??[]).map((source,index)=>{
          const updateNoTax=(patch:Partial<typeof source>)=>updateMethod({noTaxStateIncome:stateMethod?.noTaxStateIncome?.map((row,i)=>i===index?{...row,...patch}:row)});
          return <fieldset className="guided-fieldset" key={index}><legend>No-tax state {index+1}</legend>
            <TextFact label={`No-tax state ${index+1} code`} value={source.stateCode??''} onChange={stateCode=>updateNoTax({stateCode})}/>
            <CurrencyField label={`No-tax state ${index+1} U.S. taxable income`} value={source.usTaxableIncome??''} onChange={usTaxableIncome=>updateNoTax({usTaxableIncome})}/>
            <TextFact label={`No-tax state ${index+1} source reference`} value={source.sourceReference??''} onChange={sourceReference=>updateNoTax({sourceReference})}/>
            <button type="button" className="utility-button" onClick={()=>updateMethod({noTaxStateIncome:stateMethod?.noTaxStateIncome?.filter((_,i)=>i!==index)})}>Remove no-tax state {index+1}</button>
          </fieldset>;
        })}
        <button type="button" className="utility-button" onClick={()=>updateMethod({noTaxStateIncome:[...(stateMethod?.noTaxStateIncome??[]),{}]})}>Add no-tax state income source</button>
        {stateMethod?.noTaxStateIncome===undefined&&<button type="button" className="utility-button" onClick={()=>updateMethod({noTaxStateIncome:[]})}>Confirm no no-tax state income sources</button>}
        <BooleanFact label="State jurisdiction sources checked after the last edit" value={stateMethod?.sourceFactsConfirmed} onChange={value=>onChange({...allocation,sourceFactsConfirmed:undefined,stateAllocation:{...stateMethod,sourceFactsConfirmed:value??undefined}})}/>
      </fieldset>
      {(allocation.stateIncomeTaxes??[]).map((source,index)=>{
        const updateState=(patch:Partial<typeof source>,preserveCountryConfirmation=false)=>updateAllocation({stateIncomeTaxes:allocation.stateIncomeTaxes?.map((row,i)=>i===index?{...row,...patch,...(preserveCountryConfirmation?{}:{countryIncomeConfirmed:undefined})}:row)});
        return <fieldset className="guided-fieldset" key={index}><legend>State allocation {index+1}</legend>
          <TextFact label={`State allocation ${index+1} state code`} value={source.stateCode??''} onChange={stateCode=>updateState({stateCode})}/>
          <CurrencyField label={`State allocation ${index+1} deductible tax`} value={source.deductibleAmount??''} onChange={deductibleAmount=>updateState({deductibleAmount})}/>
          <CurrencyField label={`State allocation ${index+1} actual taxable income`} value={source.stateTaxableIncome??''} onChange={stateTaxableIncome=>updateState({stateTaxableIncome})}/>
          <BooleanFact label={`State allocation ${index+1} specifically exempts foreign income`} value={source.foreignIncomeSpecificallyExempt} onChange={value=>updateState({foreignIncomeSpecificallyExempt:value??undefined})}/>
          <TextFact label={`State allocation ${index+1} source reference`} value={source.sourceReference??''} onChange={sourceReference=>updateState({sourceReference})}/>
          {(source.countryIncome??[]).map((country,countryIndex)=>{
            const updateCountry=(patch:Partial<typeof country>)=>updateState({countryIncome:source.countryIncome?.map((row,i)=>i===countryIndex?{...row,...patch}:row)});
            return <fieldset className="guided-fieldset" key={countryIndex}><legend>State allocation {index+1} country {countryIndex+1}</legend>
              <TextFact label={`State allocation ${index+1} country ${countryIndex+1} name`} value={country.foreignCountry??''} onChange={foreignCountry=>updateCountry({foreignCountry})}/>
              <CurrencyField label={`State allocation ${index+1} country ${countryIndex+1} taxable income`} value={country.stateTaxableIncome??''} onChange={stateTaxableIncome=>updateCountry({stateTaxableIncome})}/>
              <TextFact label={`State allocation ${index+1} country ${countryIndex+1} source reference`} value={country.sourceReference??''} onChange={sourceReference=>updateCountry({sourceReference})}/>
              <button type="button" className="utility-button" onClick={()=>updateState({countryIncome:source.countryIncome?.filter((_,i)=>i!==countryIndex)})}>Remove state allocation {index+1} country {countryIndex+1}</button>
            </fieldset>;
          })}
          <button type="button" className="utility-button" onClick={()=>updateState({countryIncome:[...(source.countryIncome??[]),{}]})}>Add state allocation {index+1} country</button>
          <BooleanFact label={`State allocation ${index+1} country sources checked after the last edit`} value={source.countryIncomeConfirmed} onChange={value=>updateState({countryIncomeConfirmed:value??undefined},true)}/>
          <button type="button" className="utility-button" onClick={()=>updateAllocation({stateIncomeTaxes:allocation.stateIncomeTaxes?.filter((_,i)=>i!==index)})}>Remove state allocation {index+1}</button>
        </fieldset>;
      })}
      <button type="button" className="utility-button" onClick={()=>updateAllocation({stateIncomeTaxes:[...(allocation.stateIncomeTaxes??[]),{}]})}>Add state income-tax allocation</button>
      <BooleanFact label="Itemized allocation sources checked after the last edit" value={allocation.sourceFactsConfirmed} onChange={value=>onChange({...allocation,sourceFactsConfirmed:value??undefined})}/>
      <button type="button" className="utility-button" onClick={()=>onChange(undefined)}>Remove itemized allocation worksheet</button>
    </fieldset>:<button type="button" className="utility-button" onClick={()=>onChange({})}>Add itemized deduction allocation</button>;
}
