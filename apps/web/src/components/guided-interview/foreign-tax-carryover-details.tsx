"use client";
import { ForeignTaxItemizedAllocationDetails } from './foreign-tax-itemized-allocation-details';
import { foreignCarryoverStatements, snapshotForeignCarryoverIncome, type ForeignCarryoverData, type ForeignCarryoverIncomeData, type ForeignCarryoverBalanceData, type ForeignCarryoverAmtData } from '@/lib/guided-foreign-tax-carryover';
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
    if(('incomeSources' in patch || 'itemizedAllocation' in patch) && next.amt) next.amt={...next.amt,sourceFactsConfirmed:undefined,foreignAmountsSameAsRegularConfirmed:undefined};
    onChange(next);
  };
  const income=(index:number,patch:Partial<ForeignCarryoverIncomeData>)=>update({incomeSources:data.incomeSources?.map((row,i)=>i===index?{...row,...patch}:row)});
  const balance=(index:number,patch:Partial<ForeignCarryoverBalanceData>)=>update({carryovers:data.carryovers?.map((row,i)=>i===index?{...row,...patch}:row)});
  const amt=(patch:Partial<ForeignCarryoverAmtData>)=>update({amt:{...data.amt,...patch,sourceFactsConfirmed:undefined}});
  const amtBalance=(index:number,patch:Partial<ForeignCarryoverBalanceData>)=>amt({carryovers:data.amt?.carryovers?.map((row,i)=>i===index?{...row,...patch}:row)});
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
    {!data.amt ? <button type="button" className="utility-button" onClick={()=>update({amt:{}})}>Add independent AMT carry history</button> :
      <fieldset className="guided-fieldset"><legend>Independent AMT deduction-year history</legend>
        <p className="guided-hint">Use the separate AMT worksheets and election history. An empty history must be confirmed from the records; regular credit balances are not copied here.</p>
        <TextFact label="AMT carry source tax year" value={data.amt.sourceTaxYear??''} onChange={sourceTaxYear=>amt({sourceTaxYear})}/>
        <TextFact label="AMT balances adjusted through year" value={data.amt.adjustedThroughTaxYear??''} onChange={adjustedThroughTaxYear=>amt({adjustedThroughTaxYear})}/>
        <TextFact label="AMT carry history source reference" value={data.amt.sourceReference??''} onChange={sourceReference=>amt({sourceReference})}/>
        <BooleanFact label="Complete AMT carry history checked" value={data.amt.carryoverHistoryConfirmed} onChange={value=>amt({carryoverHistoryConfirmed:value??undefined})}/>
        {(data.amt.carryovers??[]).map((source,index)=><fieldset className="guided-fieldset" key={index}><legend>AMT prior balance {index+1}</legend>
          <TextFact label={`AMT balance ${index+1} origin tax year`} value={source.originTaxYear??''} onChange={originTaxYear=>amtBalance(index,{originTaxYear})}/>
          <Choice label={`AMT balance ${index+1} actual category`} value={source.category} options={[["passive","Passive category"],["general","General category"]]} onChange={category=>amtBalance(index,{category:category as ForeignCarryoverBalanceData['category']})}/>
          <CurrencyField label={`AMT balance ${index+1} adjusted amount`} value={source.amount??''} onChange={amount=>amtBalance(index,{amount})}/>
          <TextFact label={`AMT balance ${index+1} source reference`} value={source.sourceReference??''} onChange={sourceReference=>amtBalance(index,{sourceReference})}/>
          <button type="button" className="utility-button" onClick={()=>amt({carryovers:data.amt?.carryovers?.filter((_,i)=>i!==index)})}>Remove prior AMT balance {index+1}</button>
        </fieldset>)}
        <button type="button" className="utility-button" onClick={()=>amt({carryovers:[...(data.amt?.carryovers??[]),{}]})}>Add prior AMT credit balance</button>
        {data.amt.carryovers===undefined&&<button type="button" className="utility-button" onClick={()=>amt({carryovers:[]})}>Confirm no prior AMT credit balance</button>}
        {Boolean(data.amt.carryovers?.length)&&<>
          <BooleanFact label="AMT foreign source amounts match the recorded ordinary income" value={data.amt.foreignAmountsSameAsRegularConfirmed} onChange={value=>amt({foreignAmountsSameAsRegularConfirmed:value??undefined})}/>
          <TextFact label="First post-1997 AMT credit claim year" value={data.amt.firstPost1997CreditClaimTaxYear??''} onChange={firstPost1997CreditClaimTaxYear=>amt({firstPost1997CreditClaimTaxYear})}/>
          <BooleanFact label="Simplified AMT limitation elected in that first claim year" value={data.amt.simplifiedElectionMadeInFirstClaimYear} onChange={value=>amt({simplifiedElectionMadeInFirstClaimYear:value??undefined})}/>
          <BooleanFact label="AMT election history includes no revocation" value={data.amt.noRevocationConfirmed} onChange={value=>amt({noRevocationConfirmed:value??undefined})}/>
        </>}
        <BooleanFact label="AMT carry sources checked after the last edit" value={data.amt.sourceFactsConfirmed} onChange={value=>update({amt:{...data.amt,sourceFactsConfirmed:value??undefined}})}/>
        <button type="button" className="utility-button" onClick={()=>update({amt:undefined})}>Remove independent AMT carry history</button>
      </fieldset>}
    <ForeignTaxItemizedAllocationDetails allocation={data.itemizedAllocation} onChange={itemizedAllocation=>update({itemizedAllocation})}/>
    <BooleanFact label="Carryover worksheet sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={value=>onChange({...data,sourceFactsConfirmed:value??undefined})}/>
    <button type="button" className="utility-button" onClick={()=>onChange(undefined)}>Remove deduction-year carryover worksheet</button>
  </fieldset>;
}
