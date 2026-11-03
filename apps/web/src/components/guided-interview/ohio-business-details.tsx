'use client';
import {useState} from 'react';
import type {TaxYearInput} from '@/models/inputs';
import {emptyOhioBusinessDraft,emptyOhioBusinessReceipt,emptyOhioBusinessDeduction,confirmGuidedOhioBusinessFacts,type OhioBusinessDraft} from '@/lib/guided-ohio-business-facts';
import {confirmGuidedOhioResidencyFacts,type OhioResidencyDraft} from '@/lib/guided-ohio-residency-facts';
import {BooleanFact,TextFact} from './fact-fields';
import {CurrencyField} from './currency-field';
type Path=Array<string|number>;
function read(value:unknown,path:Path):unknown{let current=value;for(const key of path){if(!current||typeof current!=='object')return undefined;current=Reflect.get(current,key);}return current;}
function write(value:unknown,path:Path,next:unknown):void{let current=value;for(const key of path.slice(0,-1)){if(!current||typeof current!=='object')throw Error('Retained actual business source structure is incomplete.');current=Reflect.get(current,key);}const last=path.at(-1);if(!current||typeof current!=='object'||last===undefined)throw Error('Actual source field is required.');Reflect.set(current,last,next);}
const ownerOptions:[string,string][]=[['primary','Primary taxpayer'],['spouse','Spouse (requires its separate supported method)']];
export function OhioBusinessDetails({data,residency,originalInput,onChange}:{data:OhioBusinessDraft|undefined;residency:OhioResidencyDraft|undefined;originalInput?:TaxYearInput|null;onChange:(data:OhioBusinessDraft)=>void}){
 const[error,setError]=useState<string|null>(null);
 function edit(path:Path,value:unknown){
  if(!data)return;
  const copy=structuredClone(data);write(copy,path,value);copy.sourceFactsConfirmed=null;
  if(path.length===1&&(path[0]==='taxYear'||path[0]==='sourceReference'))write(copy,['facts',path[0]],value);
  if(path[0]==='receiptOriginals'){
   const row=copy.facts.businesses[0];if(row){const old=row.sales.rows;row.sales.rows=copy.receiptOriginals.map((receipt,index)=>({...old[index],receiptId:receipt.receiptId,sourceReference:receipt.sourceReference,grossReceipt:receipt.grossReceipt,ohioBenefitReceipt:receipt.ohioBenefitReceipt,purchaserBenefitSitusingConfirmed:receipt.purchaserBenefitSitusingConfirmed}));}
  }
  setError(null);onChange(copy);
 }
 function text(label:string,path:Path,type:'text'|'date'='text'){const value=read(data,path);return <TextFact key={path.join('.')} label={label} type={type} value={typeof value==='string'?value:''} onChange={value=>edit(path,value)}/>;}
 function money(label:string,path:Path){const value=read(data,path);return <CurrencyField key={path.join('.')} label={label} value={typeof value==='string'?value:''} onChange={value=>edit(path,value)}/>;}
 function flag(label:string,path:Path){const value=read(data,path);return <BooleanFact key={path.join('.')} label={label} value={typeof value==='boolean'?value:null} onChange={value=>edit(path,value)}/>;}
 function choice(label:string,path:Path,options:[string,string][]){const value=read(data,path);return <label className="guided-field" key={path.join('.')}><span className="guided-field-label">{label}</span><select className="guided-input" value={typeof value==='string'?value:''} onChange={e=>edit(path,e.target.value)}><option value="">Select from actual records</option>{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>;}
 if(!data)return <section aria-label="Ohio actual business sources"><h3>Ohio business records</h3><p>For a current ordinary sole proprietorship, enter actual annual property, payroll and customer-benefit records. This does not add a second business income source.</p><button type="button" onClick={()=>onChange(emptyOhioBusinessDraft())}>Add actual Ohio business source facts</button></section>;
 const b:Path=['facts','businesses',0];
 return <section className="space-y-5" aria-label="Ohio actual business sources"><h3 className="font-semibold">Ohio business source records</h3>
  <p>Use complete current-year originals. Leave unknown answers blank, including zero amounts that have not been established. Annual business allocation does not use the fraction of the year spent in Ohio. The first method covers one primary taxpayer's ordinary sole proprietorship.</p>
  {!originalInput?.scheduleC&&<p role="status">The actual current business source is missing. Retained records remain available for review.</p>}
  {data.facts.businesses.length!==1&&<p role="alert">Retained business rows require their separate supported method; they have not been discarded.</p>}
  <div className="grid gap-3 md:grid-cols-2">
   {text('Business source year',['taxYear'])}{text('Business source reference',['sourceReference'])}
   {flag('All current businesses covered',['facts','allBusinessesIncludedConfirmed'])}
   {flag('No other business income or adjustments',['facts','noOtherBusinessIncomeOrAdjustmentsConfirmed'])}
   {flag('No full-year Ohio resident business owners',['facts','noFullYearResidentBusinessOwnersConfirmed'])}
   {flag('All personal federal deduction originals included',['allFederalDeductionSourcesIncludedConfirmed'])}
  </div>
  {data.facts.businesses[0]&&<>
   <fieldset className="grid gap-3 md:grid-cols-2"><legend>Actual current business</legend>
    {text('Business source identifier',[...b,'businessSourceId'])}{choice('Business owner',[...b,'accountHolder'],ownerOptions)}
    {choice('Business owner residency',[...b,'ownerResidencyStatus'],[['nonresident','Nonresident all year'],['part_year_resident','Part-year Ohio resident']])}
    {text('Business original year',[...b,'sourceTaxYear'])}{text('Business original reference',[...b,'sourceReference'])}
    {flag('Ordinary sole proprietorship records',[...b,'ordinarySoleProprietorshipConfirmed'])}{flag('Business operated full calendar year',[...b,'fullCalendarYearBusinessConfirmed'])}
    {flag('No lower-tier business entities',[...b,'noLowerTierEntitiesConfirmed'])}{flag('No special industry or alternative allocation',[...b,'noSpecialIndustryOrAlternativeAllocationConfirmed'])}
    {flag('No special business sale',[...b,'noSpecialBusinessSaleConfirmed'])}{flag('No Ohio depreciation adjustments',[...b,'noOhioDepreciationAdjustmentsConfirmed'])}
    {flag('No other business income or adjustments for this business',[...b,'noOtherBusinessIncomeOrAdjustmentsConfirmed'])}
   </fieldset>
   <fieldset className="grid gap-3 md:grid-cols-2"><legend>Annual original-cost property and rental records</legend>
    {text('Business property ledger reference',[...b,'property','sourceReference'])}{flag('Property values use original cost and exclude ineligible property',[...b,'property','originalCostAndStatutoryExclusionsConfirmed'])}{flag('Rental records unchanged for full year',[...b,'property','fullYearUnchangedRentalConfirmed'])}
    {money('Owned property in Ohio at beginning',[...b,'property','ownedBeginning','ohio'])}{money('Owned property everywhere at beginning',[...b,'property','ownedBeginning','everywhere'])}
    {money('Owned property in Ohio at end',[...b,'property','ownedEnd','ohio'])}{money('Owned property everywhere at end',[...b,'property','ownedEnd','everywhere'])}
    {money('Annual business rent in Ohio',[...b,'property','annualRent','ohio'])}{money('Annual business rent everywhere',[...b,'property','annualRent','everywhere'])}
    {money('Annual subrent in Ohio',[...b,'property','annualSubrent','ohio'])}{money('Annual subrent everywhere',[...b,'property','annualSubrent','everywhere'])}
   </fieldset>
   <fieldset className="grid gap-3 md:grid-cols-2"><legend>Actual employee compensation</legend>
    {text('Business payroll ledger reference',[...b,'payroll','sourceReference'])}{flag('Payroll covers qualifying employee compensation',[...b,'payroll','qualifyingEmployeeCompensationConfirmed'])}{flag('No research or special-industry payroll',[...b,'payroll','noResearchOrSpecialIndustryPayrollConfirmed'])}
    {money('Employee compensation in Ohio',[...b,'payroll','ohio'])}{money('Employee compensation everywhere',[...b,'payroll','everywhere'])}
   </fieldset>
   <fieldset className="grid gap-3 md:grid-cols-2"><legend>Actual customer-benefit receipt records</legend>
    {text('Business receipt ledger reference',[...b,'sales','sourceReference'])}{flag('All business receipts included',[...b,'sales','allReceiptsIncludedConfirmed'])}{flag('No duplicate business receipt originals',[...b,'sales','noDuplicateReceiptSourcesConfirmed'])}{flag('Receipts are ordinary services with exclusions checked',[...b,'sales','ordinaryServicesAndStatutoryExclusionsConfirmed'])}
   </fieldset>
  </>}
  <fieldset className="space-y-3"><legend>Original business receipts</legend>{data.receiptOriginals.map((_,i)=>{const path:Path=['receiptOriginals',i],label=`Business receipt ${i+1}`;return <fieldset className="grid gap-3 md:grid-cols-2" key={i}><legend>{label}</legend>
   {text(`${label} identifier`,[...path,'receiptId'])}{text(`${label} reference`,[...path,'sourceReference'])}{text(`${label} source year`,[...path,'sourceTaxYear'])}{choice(`${label} owner`,[...path,'accountHolder'],ownerOptions)}{text(`${label} date`,[...path,'date'],'date')}{text(`${label} original document identifier`,[...path,'originalDocumentId'])}
   {money(`${label} gross amount`,[...path,'grossReceipt'])}{money(`${label} Ohio purchaser-benefit amount`,[...path,'ohioBenefitReceipt'])}{flag(`${label} purchaser benefit location confirmed`,[...path,'purchaserBenefitSitusingConfirmed'])}{flag(`${label} current uncorrected nonvoid original`,[...path,'currentUncorrectedNonvoidConfirmed'])}
   <button type="button" onClick={()=>edit(['receiptOriginals'],data.receiptOriginals.filter((_,index)=>index!==i))}>Remove business receipt {i+1}</button>
  </fieldset>;})}<button type="button" onClick={()=>edit(['receiptOriginals'],[...data.receiptOriginals,emptyOhioBusinessReceipt()])}>Add actual business receipt original</button></fieldset>
  <fieldset className="space-y-3"><legend>Actual dated personal federal deductions</legend><p>Use the original dates and accrual records. Do not assign a year-end date or spread a deduction over residency days.</p>{data.federalDeductionSources.map((_,i)=>{const path:Path=['federalDeductionSources',i],label=`Business deduction ${i+1}`;return <fieldset className="grid gap-3 md:grid-cols-2" key={i}><legend>{label}</legend>
   {text(`${label} identifier`,[...path,'deductionId'])}{choice(`${label} owner`,[...path,'accountHolder'],ownerOptions)}{text(`${label} source year`,[...path,'sourceTaxYear'])}{choice(`${label} kind`,[...path,'deductionKind'],[['deductible_half_se_tax','Deductible half of self-employment tax']])}{text(`${label} reference`,[...path,'sourceReference'])}
   {text(`${label} document identifier`,[...path,'original','documentId'])}{choice(`${label} document type`,[...path,'original','documentType'],[['personal_federal_deduction_workpaper','Actual personal federal deduction workpaper']])}{choice(`${label} original owner`,[...path,'original','accountHolder'],ownerOptions)}{text(`${label} original year`,[...path,'original','sourceTaxYear'])}{money(`${label} original amount`,[...path,'original','amount'])}{text(`${label} original date`,[...path,'original','date'],'date')}{choice(`${label} paid or accrued`,[...path,'original','paidOrAccrued'],[['paid','Paid'],['accrued','Accrued']])}{text(`${label} original reference`,[...path,'original','sourceReference'])}{flag(`${label} all underlying accruals included`,[...path,'original','allUnderlyingDeductionAccrualsIncludedConfirmed'])}{text(`${label} original description`,[...path,'original','description'])}
   <button type="button" onClick={()=>edit(['federalDeductionSources'],data.federalDeductionSources.filter((_,index)=>index!==i))}>Remove personal deduction {i+1}</button>
  </fieldset>;})}<button type="button" onClick={()=>edit(['federalDeductionSources'],[...data.federalDeductionSources,emptyOhioBusinessDeduction()])}>Add actual personal federal deduction original</button></fieldset>
  <p role="status">{data.sourceFactsConfirmed===true?'Actual business originals explicitly confirmed.':'Actual business originals need confirmation.'}</p>
  <button type="button" disabled={!originalInput||!residency} onClick={()=>{if(!originalInput||!residency)return;try{const confirmed=confirmGuidedOhioBusinessFacts(originalInput,data);confirmGuidedOhioResidencyFacts(originalInput,{...residency,businessSources:confirmed});setError(null);onChange(confirmed);}catch(e){setError(e instanceof Error?e.message:'Complete and reconcile the actual business originals.');}}}>Confirm actual Ohio business source records</button>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
