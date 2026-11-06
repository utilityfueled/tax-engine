"use client";
import { useState } from 'react';
import { captureGuidedRefundSources, updateGuidedTaxRefund, type GuidedTaxRefundData } from '@/lib/guided-tax-refund';
import type { UnemploymentEntryData } from '@/lib/guided-unemployment-facts';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({label,value,options,onChange}:{label:string;value?:string;options:[string,string][];onChange:(value:string)=>void}) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value??''} onChange={event=>onChange(event.target.value)}><option value="">Choose from actual records</option>{options.map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>;
}
export function TaxRefundSourceDetails({data,entries,onChange}:{data?:GuidedTaxRefundData;entries:UnemploymentEntryData[];onChange:(next:GuidedTaxRefundData|undefined)=>void}) {
  const [copyError,setCopyError]=useState('');
  const change=(patch:Partial<GuidedTaxRefundData>)=>onChange(updateGuidedTaxRefund(data??{},patch));
  const copy=()=>{try{const sources=captureGuidedRefundSources(entries);if(!sources.length)throw new Error('Enter the original positive income-tax refund first.');change({originalRefundSources:sources});setCopyError('');}catch(error){setCopyError(error instanceof Error?error.message:'Complete the original refund records.');}};
  return <details className="guided-expand"><summary className="guided-expand-trigger">Historical income-tax refund worksheet</summary><div className="guided-expand-body">
    <p className="guided-hint">Use the return for the year the refunded taxes were paid and deducted. Box 3 can name a different state-return year. This worksheet uses one deduction year and the same taxpayer or joint spouses.</p>
    {!data?<button type="button" className="utility-button" onClick={()=>onChange({})}>Add historical refund worksheet</button>:<>
      <button type="button" className="utility-button" onClick={copy}>Copy current refund records</button>
      {copyError&&<p role="alert">{copyError}</p>}
      <p className="guided-hint">{data.originalRefundSources?`${data.originalRefundSources.length} original refund record(s) captured. Recopy after changing a statement.`:'Original refund records have not been captured.'}</p>
      <div className="guided-form-grid">
        {([
          ['sourceTaxYear','Refund receipt tax year'],['priorTaxYear','Actual historical paid and deducted year'],
          ['sourceReference','Historical return and worksheet reference'],['primaryName','Primary taxpayer name on the historical return'],
          ['primaryTaxpayerIdLast4','Primary taxpayer SSN last four on the historical return'],
        ] as const).map(([key,label])=><TextFact key={key} label={label} value={data[key]??''} onChange={value=>change({[key]:value})}/>)}
        <Choice label="Historical federal filing status" value={data.priorYearFilingStatus} options={[
          ['single','Single'],['mfj','Married filing jointly'],['mfs','Married filing separately'],['hoh','Head of household'],['qss','Qualifying surviving spouse'],
        ]} onChange={value=>change({priorYearFilingStatus:value as GuidedTaxRefundData['priorYearFilingStatus']})}/>
        {(data.priorYearFilingStatus==='mfj'||data.spouseName||data.spouseTaxpayerIdLast4)&&<>
          <TextFact label="Spouse name on the historical joint return" value={data.spouseName??''} onChange={spouseName=>change({spouseName})}/>
          <TextFact label="Spouse SSN last four on the historical joint return" value={data.spouseTaxpayerIdLast4??''} onChange={spouseTaxpayerIdLast4=>change({spouseTaxpayerIdLast4})}/>
        </>}
        <BooleanFact label="The individual or joint-return spouses are unchanged" value={data.returnMembershipUnchanged} onChange={returnMembershipUnchanged=>change({returnMembershipUnchanged})}/>
        <BooleanFact label="All income-tax refund sources for this worksheet are included" value={data.allRefundSourcesIncluded} onChange={allRefundSourcesIncluded=>change({allRefundSourcesIncluded})}/>
        <BooleanFact label="All refunded taxes were paid in the stated expense year" value={data.allRefundedTaxesPaidInExpenseYear} onChange={allRefundedTaxesPaidInExpenseYear=>change({allRefundedTaxesPaidInExpenseYear})}/>
        <BooleanFact label="Did you itemize in the deduction year?" value={data.priorYearItemized} onChange={priorYearItemized=>change({priorYearItemized})}/>
        <BooleanFact label="Was itemization required because your separately filing spouse itemized?" value={data.priorYearMandatoryItemization} onChange={priorYearMandatoryItemization=>change({priorYearMandatoryItemization})}/>
        <CurrencyField label="Historical available standard deduction" hint="Use the amount available in the historical recovery worksheet, including age and blindness. Enter zero only for actual mandatory itemization; do not copy an itemized amount from Form 1040." value={data.priorYearStandardDeduction??''} onChange={priorYearStandardDeduction=>change({priorYearStandardDeduction})}/>
        {(data.priorTaxYear==='2025'||data.priorTaxYear==='2026'||data.priorYearSaltMagi!==undefined)&&<CurrencyField label="Historical SALT MAGI" hint="Use the actual historical SALT worksheet, including its required income exclusions." value={data.priorYearSaltMagi??''} allowNegative onChange={priorYearSaltMagi=>change({priorYearSaltMagi})}/>}
        {data.priorYearItemized===true&&<>
          <Choice label="Actual prior Schedule A tax election" value={data.priorYearStateLocalTaxElection} options={[
            ['income','State and local income taxes'],['sales','General sales taxes'],
          ]} onChange={value=>change({priorYearStateLocalTaxElection:value as GuidedTaxRefundData['priorYearStateLocalTaxElection']})}/>
          {([
            ['priorYearItemizedTotal','Historical Schedule A total itemized deductions'],
            ['priorYearStateLocalTaxesPaid','Historical state and local income taxes paid'],
            ['priorYearPropertyTaxesPaid','Historical state and local property taxes paid'],
            ['priorYearAlternativeGeneralSalesTaxDeduction','Historical available general sales tax deduction'],
          ] as const).map(([key,label])=><CurrencyField key={key} label={label} value={data[key]??''} onChange={value=>change({[key]:value})}/>)}
        </>}
        {data.priorYearItemized===true&&data.priorYearStateLocalTaxElection==='income'&&<>
          <p className="guided-hint">Ordinary recovery treatment needs the following actual prior-return facts. Earlier recoveries, NOL carryovers, AMT, unused credits, capital-rate worksheets, dependency and other recoveries may require a separate tax-benefit calculation.</p>
          {([
            ['priorYearTaxableIncome','Historical taxable income'],['priorYearRegularTax','Historical regular income tax before credits'],
            ['priorYearAmt','Historical alternative minimum tax'],['priorYearUnusedTaxCredits','Historical unused tax credits'],
            ['otherItemizedRecoveries','Other recoveries from the same deduction year'],
            ['priorRecoveriesBeforeReceiptYear','Recoveries received before this receipt year for the historical deductions'],
            ['priorYearNolCarryover','Historical NOL carryover affecting the recovery worksheet'],
          ] as const).map(([key,label])=><CurrencyField key={key} label={label} value={data[key]??''} allowNegative={key==='priorYearTaxableIncome'} onChange={value=>change({[key]:value})}/>)}
          <BooleanFact label="Was a capital-gain or qualified-dividend tax worksheet used on the historical return?" value={data.priorYearCapitalRateWorksheetUsed} onChange={priorYearCapitalRateWorksheetUsed=>change({priorYearCapitalRateWorksheetUsed})}/>
          <BooleanFact label="Could someone claim you as a dependent in the deduction year?" value={data.priorYearCouldBeClaimedAsDependent} onChange={priorYearCouldBeClaimedAsDependent=>change({priorYearCouldBeClaimedAsDependent})}/>
        </>}
      </div>
      <BooleanFact label="Refund worksheet checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>change({sourceFactsConfirmed})}/>
      <button type="button" className="utility-button" onClick={()=>onChange(undefined)}>Remove historical refund worksheet</button>
    </>}
  </div></details>;
}
