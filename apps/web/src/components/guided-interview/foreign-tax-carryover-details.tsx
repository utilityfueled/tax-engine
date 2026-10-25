"use client";
import { foreignCarryoverStatements, snapshotForeignCarryoverIncome, type ForeignCarryoverData, type ForeignCarryoverIncomeData, type ForeignCarryoverBalanceData } from '@/lib/guided-foreign-tax-carryover';
import type { InvestmentData } from '@/lib/guided-investment-facts';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({label,value,options,onChange}:{label:string;value?:string;options:readonly(readonly[string,string])[];onChange:(value:string|undefined)=>void}) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value??''} onChange={event=>onChange(event.target.value||undefined)}><option value="">Not answered</option>{options.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>;
}
export function ForeignTaxCarryoverDetails({data,investment,onChange}:{data?:ForeignCarryoverData;investment?:InvestmentData;onChange:(data:ForeignCarryoverData|undefined)=>void}) {
  if(!data)return <button type="button" className="utility-button" onClick={()=>onChange({})}>Add deduction-year carryover worksheet</button>;
  const statements=foreignCarryoverStatements(investment);
  const update=(patch:Partial<ForeignCarryoverData>)=>{
    const next={...data,...patch,sourceFactsConfirmed:undefined};
    if('incomeSources' in patch&&next.itemizedAllocation)next.itemizedAllocation={...next.itemizedAllocation,sourceFactsConfirmed:undefined,
      stateAllocation:next.itemizedAllocation.stateAllocation?{...next.itemizedAllocation.stateAllocation,sourceFactsConfirmed:undefined}:undefined,
      stateIncomeTaxes:next.itemizedAllocation.stateIncomeTaxes?.map(row=>({...row,countryIncomeConfirmed:undefined}))};
    onChange(next);
  };
  const income=(index:number,patch:Partial<ForeignCarryoverIncomeData>)=>update({incomeSources:data.incomeSources?.map((row,i)=>i===index?{...row,...patch}:row)});
  const balance=(index:number,patch:Partial<ForeignCarryoverBalanceData>)=>update({carryovers:data.carryovers?.map((row,i)=>i===index?{...row,...patch}:row)});
  const allocation=data.itemizedAllocation;
  const updateAllocation=(patch:Partial<NonNullable<ForeignCarryoverData['itemizedAllocation']>>)=>{
    const next={...allocation,...patch,sourceFactsConfirmed:undefined};
    if(next.stateAllocation)next.stateAllocation={...next.stateAllocation,sourceFactsConfirmed:undefined};
    update({itemizedAllocation:next});
  };
  const stateMethod=allocation?.stateAllocation;
  const updateMethod=(patch:Partial<NonNullable<typeof stateMethod>>)=>updateAllocation({stateAllocation:{...stateMethod,...patch}});
  return <fieldset className="guided-fieldset"><legend>Deduction-year prior credit balances</legend>
    <p className="guided-hint">Unused credit can be absorbed in a deduction year even though it gives no current tax benefit. Enter actual foreign income and adjusted prior balances. The return calculates the hypothetical credit limit; do not enter a guessed limit. Mixed filing histories, special categories and loss accounts require their own methods.</p>
    <TextFact label="Carryover worksheet tax year" value={data.sourceTaxYear??''} onChange={sourceTaxYear=>update({sourceTaxYear})}/>
    <TextFact label="Balances adjusted through tax year" value={data.adjustedThroughTaxYear??''} onChange={adjustedThroughTaxYear=>update({adjustedThroughTaxYear})}/>
    <TextFact label="Carryover worksheet source reference" value={data.sourceReference??''} onChange={sourceReference=>update({sourceReference})}/>
    <Choice label="Carryover calculation method" value={data.method} options={[["ordinary_passive","Ordinary passive interest and dividends"]]} onChange={method=>update({method:method as ForeignCarryoverData['method']})}/>
    <Choice label="Actual carryover filing history" value={data.filingHistory} options={[["continuous_individual","Individual returns throughout the carryover history"],["continuous_joint_same_spouse","Joint returns with the same spouse throughout"]]} onChange={filingHistory=>update({filingHistory:filingHistory as ForeignCarryoverData['filingHistory']})}/>
    {([
      ['filingHistoryConfirmed','Filing history checked against actual returns'],
      ['noCarrybackOrRedeterminationAdjustmentsConfirmed','No unresolved carryback or redetermination adjustments'],
      ['noForeignOrDomesticLossAccountsConfirmed','No foreign or domestic loss-account adjustments'],
      ['noOtherForeignIncomeConfirmed','All foreign ordinary income is recorded here'],
      ['allCurrentTaxesCreditEligibleConfirmed','Current foreign taxes are eligible for credit'],
      ['passiveCategoryConfirmed','Income classification is ordinary passive'],
    ] as const).map(([key,label])=><BooleanFact key={key} label={label} value={data[key]} onChange={value=>update({[key]:value??undefined})}/>)}
    <fieldset className="guided-fieldset"><legend>Actual foreign ordinary income</legend>
      <p className="guided-hint">Include each current paid-tax statement and any other foreign ordinary income in the supported category. The foreign amount can be only part of a statement&apos;s total.</p>
      {(data.incomeSources??[]).map((source,index)=><fieldset className="guided-fieldset" key={index}><legend>Income source {index+1}</legend>
        <Choice label={`Carryover income statement ${index+1}`} value={source.sourceId} options={statements.map(row=>[row.sourceId,`${row.entry.payer} — ${row.entry.accountReference??'Account reference missing'}`])} onChange={id=>{
          const actual=statements.find(row=>row.sourceId===id);update({incomeSources:data.incomeSources?.map((row,i)=>i===index?actual?snapshotForeignCarryoverIncome(actual):{}:row)});
        }}/>
        <CurrencyField label={`Income ${index+1} actual foreign ordinary amount`} value={source.foreignIncome??''} onChange={foreignIncome=>income(index,{foreignIncome})}/>
        <TextFact label={`Income ${index+1} source reference`} value={source.sourceReference??''} onChange={sourceReference=>income(index,{sourceReference})}/>
        <button type="button" className="utility-button" onClick={()=>update({incomeSources:data.incomeSources?.filter((_,i)=>i!==index)})}>Remove carryover income {index+1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={()=>update({incomeSources:[...(data.incomeSources??[]),{}]})}>Add carryover income statement</button>
      {data.incomeSources===undefined&&<button type="button" className="utility-button" onClick={()=>update({incomeSources:[]})}>Confirm no foreign ordinary income statements</button>}
    </fieldset>
    <fieldset className="guided-fieldset"><legend>Adjusted prior balances</legend>
      {(data.carryovers??[]).map((source,index)=><fieldset className="guided-fieldset" key={index}><legend>Prior balance {index+1}</legend>
        <TextFact label={`Balance ${index+1} origin tax year`} value={source.originTaxYear??''} onChange={originTaxYear=>balance(index,{originTaxYear})}/>
        <Choice label={`Balance ${index+1} actual category`} value={source.category} options={[["passive","Passive category"],["general","General category"]]} onChange={category=>balance(index,{category:category as ForeignCarryoverBalanceData['category']})}/>
        <CurrencyField label={`Balance ${index+1} adjusted amount`} value={source.amount??''} onChange={amount=>balance(index,{amount})}/>
        <TextFact label={`Balance ${index+1} source reference`} value={source.sourceReference??''} onChange={sourceReference=>balance(index,{sourceReference})}/>
        <button type="button" className="utility-button" onClick={()=>update({carryovers:data.carryovers?.filter((_,i)=>i!==index)})}>Remove prior balance {index+1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={()=>update({carryovers:[...(data.carryovers??[]),{}]})}>Add prior credit balance</button>
      {data.carryovers===undefined&&<button type="button" className="utility-button" onClick={()=>update({carryovers:[]})}>Confirm no adjusted prior balance remains</button>}
    </fieldset>
    {allocation?<fieldset className="guided-fieldset"><legend>Hypothetical allowed itemized deduction sources</legend>
      <p className="guided-hint">Complete this when the return would still itemize after removing the foreign income-tax deduction. Use actual allowed state/local components, including any cap allocation. State income taxes require the complete jurisdiction worksheet and actual method history. Include states that exempt foreign income or impose no income tax; use actual nonoverlapping income attribution, not a guessed split.</p>
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
        <BooleanFact label="State jurisdiction sources checked after the last edit" value={stateMethod?.sourceFactsConfirmed} onChange={value=>update({itemizedAllocation:{...allocation,sourceFactsConfirmed:undefined,stateAllocation:{...stateMethod,sourceFactsConfirmed:value??undefined}}})}/>
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
      <BooleanFact label="Itemized allocation sources checked after the last edit" value={allocation.sourceFactsConfirmed} onChange={value=>update({itemizedAllocation:{...allocation,sourceFactsConfirmed:value??undefined}})}/>
      <button type="button" className="utility-button" onClick={()=>update({itemizedAllocation:undefined})}>Remove itemized allocation worksheet</button>
    </fieldset>:<button type="button" className="utility-button" onClick={()=>update({itemizedAllocation:{}})}>Add itemized deduction allocation</button>}
    <BooleanFact label="Carryover worksheet sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={value=>onChange({...data,sourceFactsConfirmed:value??undefined})}/>
    <button type="button" className="utility-button" onClick={()=>onChange(undefined)}>Remove deduction-year carryover worksheet</button>
  </fieldset>;
}
