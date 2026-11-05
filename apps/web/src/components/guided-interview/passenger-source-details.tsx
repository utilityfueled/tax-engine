"use client";
import {useState} from 'react';
import {PassengerFirstYearSourcesSchema} from '@/models/passenger-auto-first-year-sources';
import {PassengerAutoParentSourcesSchema,PASSENGER_PARENT_ALLOWED_EXPENSES,PASSENGER_PARENT_EXPENSE_KEYS} from '@/models/passenger-auto-parent-sources';
import {passengerOtherSourceInventories,passengerSummaryFields,type GuidedPassengerDraft} from '@/lib/guided-passenger-sources';
import {BooleanFact,TextFact} from './fact-fields';
import {CurrencyField,isValidCurrencyValue,parseCurrencyInput} from './currency-field';
const inventoryLabels:Record<string,string>={"w2s": "W-2 wage forms", "form1099Int": "1099-INT interest", "form1099Div": "1099-DIV dividends", "form1099B": "1099-B securities", "form1099DA": "1099-DA digital assets", "form1099Misc": "1099-MISC miscellaneous income", "form1099G": "1099-G government payments", "form1099OID": "1099-OID original issue discount", "formW2G": "W-2G gambling winnings", "form1099K": "1099-K payment reports", "form1099C": "1099-C canceled debt", "form1099Q": "1099-Q education distributions", "scheduleK1": "Business Schedule K-1", "scheduleK1Form1041": "Estate or trust Schedule K-1", "form1098": "1098 mortgage interest", "form1098E": "1098-E student loan interest", "form1095A": "1095-A marketplace insurance", "donations": "Charitable donation records", "rentalProperties": "Rental property records", "savingsBondRedemptions": "Savings bond redemption records", "form6252": "Installment sale records", "form8814": "Child investment income elections", "homeSales": "Home sale records", "form8824": "Like-kind exchange records", "form1099R": "1099-R retirement distributions", "formSSA1099": "SSA-1099 benefits", "formRRB1099": "RRB-1099 benefits"};
const label=(s:string)=>s.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/Confirmed$/,'confirmed');
/** Every displayed answer starts unknown. Capture is an explicit validated action. */
export function PassengerSourceDetails({draft:d={},onChange,onCapture}:{draft?:GuidedPassengerDraft;onChange:(d:GuidedPassengerDraft)=>void;onCapture:()=>GuidedPassengerDraft}){
 const [error,setError]=useState('');
 if(!d||typeof d!=='object'||Array.isArray(d))return <p role="alert">Saved unsupported passenger source structure remains available for review; no facts were changed.</p>;
 const get=(path:string[]):unknown=>path.reduce<unknown>((v,k)=>v&&typeof v==='object'?(v as Record<string,unknown>)[k]:undefined,d);
 const set=(path:string[],value:unknown)=>{if(Object.is(get(path),value))return;const next=structuredClone(d) as Record<string,unknown>;let node=next;for(let i=0;i<path.length-1;i++){const k=path[i];if(node[k]===undefined)node[k]=/^\d+$/.test(path[i+1])?[]:{};if(!node[k]||typeof node[k]!=='object')return setError('Saved unsupported source structure remains for review.');node=node[k] as Record<string,unknown>;}node[path[path.length-1]]=value;onChange({...next,sourceFactsConfirmed:null});setError('');};
 const text=(name:string,path:string[]) => <span data-passenger-path={path.join('.')} key={path.join('.')}><TextFact label={name} value={typeof get(path)==='string'?get(path) as string:''} onChange={v=>set(path,v)}/></span>;
 const amount=(name:string,path:string[]) => <span data-passenger-path={path.join('.')} key={path.join('.')}><CurrencyField label={name} value={typeof get(path)==='string'?get(path) as string:''} onChange={raw=>set(path,isValidCurrencyValue(raw)?parseCurrencyInput(raw):raw)}/></span>;
 const bool=(name:string,path:string[]) => <span data-passenger-path={path.join('.')} key={path.join('.')}><BooleanFact label={name} value={typeof get(path)==='boolean'?get(path) as boolean:null} onChange={v=>set(path,v)}/></span>;
 const select=(name:string,path:string[],options:Array<[string,string]>)=><label className="guided-field" key={path.join('.')} data-passenger-path={path.join('.')}><span className="guided-field-label">{name}</span><select className="guided-input" value={typeof get(path)==='string'?get(path) as string:''} onChange={e=>set(path,e.target.value||undefined)}><option value="">Not answered</option>{options.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>;
 const refs=['sourceReference','invoiceReference','purchaseContractReference','eligibilityReference','mileageReference','electionReference','partIReference','inventoryReference'];
 const rows=get(['parent','necRows']);const classifications=get(['parent','expenseClassifications']);
 return <fieldset className="guided-fieldset"><legend>Actual passenger car documentary records</legend>
 <p className="guided-hint">One new ordinary passenger car for a single primary cash-service business in 2026, first used January through September. Other vehicles, activities, years or history remain unsupported. Enter actual records, including each known zero. Blank is unknown. This handoff does not enable filing or qualify official forms.</p>
 {text('Actual source tax year',['sourceTaxYear'])}
 <fieldset><legend>Vehicle, purchase and use records</legend>
 {refs.map(k=>text(label(k),['vehicle',k]))}
 {text('Actual vehicle description',['vehicle','description'])}
 {['make','model','vin','recordReference'].map(k=>text('Vehicle '+label(k),['vehicle','vehicleIdentity',k]))}
 <span data-passenger-path="vehicle.vehicleIdentity.modelYear"><TextFact label="Actual vehicle model year" value={String(get(['vehicle','vehicleIdentity','modelYear'])??'')} onChange={v=>set(['vehicle','vehicleIdentity','modelYear'],/^\d{4}$/.test(v)?Number(v):v)}/></span>
 {['acquisitionDate','purchaseContractDate','placedInServiceDate'].map(k=>text('Actual '+label(k)+' (YYYY-MM-DD)',['vehicle',k]))}
 {amount('Actual gross Cost Basis',['vehicle','grossCostBasis'])}{['unloadedVehicleWeightPounds','businessUsePercentage'].map(k=>text('Actual '+label(k),['vehicle',k]))}
 {select('Actual recovery period',['vehicle','recoveryPeriod'],[['5','Five years']])}
 {select('Actual depreciation method',['vehicle','method'],[['200DB','200% declining balance GDS']])}
 {select('Actual convention',['vehicle','convention'],[['halfYear','Half-year']])}
 {['isListedProperty','isPassengerAutomobile','disposedDuringYear','section280FRecaptureTriggered','firstYearBonusEligible'].map(k=>bool('Actual '+label(k),['vehicle',k]))}
 {['businessMiles','commutingMiles','otherPersonalMiles','totalMiles'].map(k=>text('Actual annual '+label(k),['vehicle','mileage',k]))}
 {bool('Is the mileage supported by actual written evidence?',['vehicle','mileage','writtenEvidenceConfirmed'])}
 </fieldset>
 <fieldset><legend>Documented eligibility and complete inventory</legend>
 {Object.keys(PassengerFirstYearSourcesSchema.shape.eligibility.shape).map(k=>bool('Do the actual records establish '+label(k)+'?',['vehicle','eligibility',k]))}
 </fieldset>
 <fieldset><legend>Actual completed Form 4562 Part I and bonus election</legend>
 {Object.keys(PassengerFirstYearSourcesSchema.shape.partI.shape).map(k=>amount('Completed Part I '+label(k),['vehicle','partI',k]))}
 {select('Actual bonus treatment',['vehicle','bonus','treatment'],[['elected_out','Actual class election out'],['qualified_100_percent','Actual qualified 100% treatment']])}
 {text('Actual class',['vehicle','bonus','electionClass'])}
 <span data-passenger-path="vehicle.bonus.electionTaxYear"><TextFact label="Actual election tax year" value={String(get(['vehicle','bonus','electionTaxYear'])??'')} onChange={v=>set(['vehicle','bonus','electionTaxYear'],/^\d{4}$/.test(v)?Number(v):v)}/></span>
 {text('Actual bonus treatment source',['vehicle','bonus','sourceReference'])}
 {text('Actual class election-out reference (election-out branch only)',['vehicle','bonus','classElectionOutReference'])}
 <button type="button" onClick={()=>set(['vehicle','bonus','classElectionOutReference'],null)}>Record no class election-out reference for actual 100% branch</button>
 {['noReducedRateElection','qualified100Percent'].map(k=>bool('Actual '+label(k),['vehicle','bonus',k]))}
 </fieldset>
 <fieldset><legend>All separate deduction and history amounts</legend>{passengerSummaryFields.map(k=>amount('Actual '+label(k),['summary',k]))}</fieldset>
 <fieldset><legend>Actual reviewed no-other-source inventories</legend><p className="guided-hint">For each category, identify the actual reviewed records establishing no source in this return. An absent screen or empty array is not evidence.</p>{passengerOtherSourceInventories.map(k=><fieldset key={k}><legend>{inventoryLabels[k]}</legend>{text('Original inventory review reference',['otherSources',k,'sourceReference'])}{bool('Do the actual reviewed records establish no such income or property source?',['otherSources',k,'reviewedNoneConfirmed'])}</fieldset>)}</fieldset>
 <fieldset><legend>Complete business ledger and source classifications</legend>
 {['sourceReference','assetReference','incomeWorksheetReference','ledgerReference'].map(k=>text('Actual '+label(k),['parent',k]))}
 {amount('Actual receipts not already on Forms 1099-NEC',['parent','nonNecCashReceipts'])}
 {['grossReceipts','returnsAndAllowances','costOfGoodsSold','otherIncome'].map(k=>amount('Actual annual ledger '+label(k),['parent','amounts',k]))}
 {PASSENGER_PARENT_EXPENSE_KEYS.map(k=>amount('Actual annual '+label(k)+' (enter each known zero)',['parent','amounts','expenses',k]))}
 {(Array.isArray(classifications)?classifications:[]).map((_,i)=><fieldset key={i}><legend>Expense classification {i+1}</legend>{select('Actual expense category',['parent','expenseClassifications',String(i),'category'],PASSENGER_PARENT_ALLOWED_EXPENSES.map(k=>[k,label(k)]))}{text('Original expense classification reference',['parent','expenseClassifications',String(i),'sourceReference'])}{['currentCashBusinessOnlyConfirmed','notCapitalizedInventoryPersonalOrDeductedElsewhereConfirmed','noHealthInsuranceOrOtherLimitedDeductionConfirmed'].map(k=>bool('Actual '+label(k),['parent','expenseClassifications',String(i),k]))}<button type="button" onClick={()=>set(['parent','expenseClassifications'],(classifications as unknown[]).filter((_,n)=>n!==i))}>Remove expense classification {i+1}</button></fieldset>)}
 <button type="button" onClick={()=>set(['parent','expenseClassifications'],[...(Array.isArray(classifications)?classifications:[]),{}])}>Add actual expense classification (all six required)</button>
 {(Array.isArray(rows)?rows:[]).map((_,i)=><fieldset key={i}><legend>Actual NEC original {i+1}</legend><TextFact label="Zero-based actual NEC inventory index" value={String(get(['parent','necRows',String(i),'index'])??'')} onChange={v=>set(['parent','necRows',String(i),'index'],/^\d+$/.test(v)?Number(v):v)}/>{text('Original NEC reference',['parent','necRows',String(i),'sourceReference'])}{bool('Have you confirmed this actual NEC original?',['parent','necRows',String(i),'confirmed'])}{bool('Does this NEC belong to this same cash-service business?',['parent','necRows',String(i),'actualSameBusinessCashServicesConfirmed'])}<button type="button" onClick={()=>set(['parent','necRows'],(rows as unknown[]).filter((_,n)=>n!==i))}>Remove NEC reference {i+1}</button></fieldset>)}
 <button type="button" onClick={()=>set(['parent','necRows'],[...(Array.isArray(rows)?rows:[]),{}])}>Add actual NEC original reference</button>
 <button type="button" onClick={()=>set(['parent','necRows'],[])}>Record reviewed empty NEC inventory</button>
 {Object.keys(PassengerAutoParentSourcesSchema.shape.scope.shape).map(k=>bool('Do the complete originals establish '+label(k)+'?',['parent','scope',k]))}
 </fieldset>
 <p className="guided-hint">Reconcile the six business expenses and all other zero records against the normal business fields. Enter the completed Part I income limit and election yourself; this collector does not guess them. Reconfirm business income and expense reviews before source capture.</p>
 <button type="button" onClick={()=>{try{const next=onCapture();onChange(next);setError('');}catch{setError('Complete and reconcile the actual vehicle, purchase, mileage, election, Part I, owner, year, all expense and no-other-source records before capture.');}}}>Capture and confirm complete passenger sources after the last edit</button>
 <p role="status">{d.sourceFactsConfirmed===true?'Original sources captured; current return checks still apply.':'Passenger sources require actual review and capture.'}</p>
 {error?<p role="alert">{error}</p>:null}
 </fieldset>;
}
