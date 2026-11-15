'use client';
import {HOUSEHOLD_TEXT,HOUSEHOLD_FLAGS,SPOUSE_AMOUNTS,DIVIDEND_TEXT,DIVIDEND_AMOUNTS,type EstimatedInvestmentHouseholdData} from '@/lib/guided-estimated-investment-household';
import {BooleanFact,TextFact} from './fact-fields';
import {CurrencyField} from './currency-field';
export function EstimatedInvestmentHouseholdDetails({data,onChange}:{data?:EstimatedInvestmentHouseholdData;onChange:(data:EstimatedInvestmentHouseholdData|undefined)=>void}){
 if(!data)return <button type="button" onClick={()=>onChange({})}>Add actual joint household investment originals</button>;
 const update=(patch:Partial<EstimatedInvestmentHouseholdData>)=>onChange({...data,...patch,...(Object.keys(patch).every(k=>k==='sourceFactsConfirmed')?{}:{sourceFactsConfirmed:null})});
 return <fieldset style={{minWidth:0}}><legend>Actual joint household investment originals</legend>
 <p className="guided-hint">This finite 2025 joint-return method requires both spouses alive and US residents all year, separately documented full-year Massachusetts domicile, and investments owned only by the primary taxpayer with no community-property history. Enter actual marriage, domicile, acquisition and ownership records and complete spouse investment originals. A spouse blank is unknown, not zero. The app does not infer domicile from an address or ownership from marriage. Other joint methods remain for review.</p>
 <div className="guided-form-grid">{HOUSEHOLD_TEXT.map(([key,label])=><TextFact key={key} label={label} value={data[key]??''} onChange={v=>update({[key]:v})}/>)}
 {HOUSEHOLD_FLAGS.map(([key,label])=><BooleanFact key={key} label={label} value={data[key]} onChange={v=>update({[key]:v})}/>)}
 {SPOUSE_AMOUNTS.map(([key,label])=><CurrencyField key={key} label={label} value={data[key]??''} onChange={v=>update({[key]:v})}/>)}</div>
 {(['primary','spouse']as const).map(owner=><fieldset key={owner} style={{minWidth:0}}><legend>{owner==='primary'?'Primary':'Spouse'} actual household identity and domicile</legend><div className="guided-form-grid">
 {([['firstName','first name'],['lastName','last name'],['ssn','complete SSN']]as const).map(([key,label])=><TextFact key={key} label={`Household ${owner}: original ${label}`} value={data[owner]?.[key]??''} onChange={v=>update({[owner]:{...data[owner],[key]:v}})}/>)}
 {([['state','domicile state'],['startDate','domicile start date'],['endDate','domicile end date'],['sourceReference','domicile original reference']]as const).map(([key,label])=>{const d=owner==='primary'?'primaryDomicile':'spouseDomicile';return <TextFact key={key} type={key==='startDate'||key==='endDate'?'date':'text'} label={`Household ${owner}: ${label}`} value={data[d]?.[key]??''} onChange={v=>update({[d]:{...data[d],[key]:v}})}/>;})}
 </div></fieldset>)}
 <p className="guided-hint">For every actual primary 1099-DIV, enter its original recipient, payer, account, year and complete amounts in the same order as the investment entries. All other boxes must actually be zero. A changed account, source or recipient needs fresh reconciliation.</p>
 {(data.dividendSources??[]).map((row,i)=>{const prefix=`Household dividend ${i+1}`;const set=(patch:Partial<typeof row>)=>update({dividendSources:data.dividendSources?.map((r,j)=>i===j?{...r,...patch}:r)});return <fieldset key={i} style={{minWidth:0}}><legend>{prefix} original</legend><div className="guided-form-grid">
 {DIVIDEND_TEXT.map(([key,label])=><TextFact key={key} label={`${prefix}: ${label}`} value={row[key]??''} onChange={v=>set({[key]:v})}/>)}
 {([['firstName','first name'],['lastName','last name'],['ssn','complete SSN']]as const).map(([key,label])=><TextFact key={key} label={`${prefix}: recipient ${label}`} value={row.recipient?.[key]??''} onChange={v=>set({recipient:{...row.recipient,[key]:v}})}/>)}
 <label className="guided-field"><span className="guided-field-label">{prefix}: Actual owner</span><select className="guided-input" value={row.accountHolder??''} onChange={e=>set({accountHolder:e.target.value===''?undefined:e.target.value as 'primary'|'spouse'})}><option value="">Choose actual owner</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse — another method required</option></select></label>
 {DIVIDEND_AMOUNTS.map(([key,label])=><CurrencyField key={key} label={`${prefix}: ${label}`} value={row[key]??''} onChange={v=>set({[key]:v})}/>)}
 <BooleanFact label={`${prefix}: All other reported boxes are actually zero`} value={row.otherReportedAmountsZeroConfirmed} onChange={v=>set({otherReportedAmountsZeroConfirmed:v})}/></div>
 <button type="button" onClick={()=>update({dividendSources:data.dividendSources?.filter((_,j)=>j!==i)})}>Remove household dividend {i+1} original</button></fieldset>;})}
 <button type="button" onClick={()=>update({dividendSources:[...(data.dividendSources??[]),{}]})}>Add actual household dividend original</button>
 <BooleanFact label="Joint household originals checked after the last edit" value={data.sourceFactsConfirmed} onChange={v=>update({sourceFactsConfirmed:v})}/>
 <button type="button" onClick={()=>onChange(undefined)}>Remove joint household investment originals</button></fieldset>;
}
