'use client';
import { useState } from 'react';
import type { DeductionData, FilingStatus } from '@/lib/guided-interview-flow';
import type { GuidedMortgageInsurancePrepaidData } from '@/lib/guided-mortgage-insurance-prepaid';
import { buildGuidedMortgageInputs, captureGuidedMortgageInsurancePrepaid, confirmGuidedMortgageInsurancePrepaid } from '@/lib/guided-mortgage-worksheet';
import { CurrencyField, isValidCurrencyValue, parseCurrencyInput } from './currency-field';

const facts = {
  allPremiumsIncluded:'Do these original records include every prepaid premium for this policy?',
  privateInsuranceMeetsHpaDefinition:'Do actual records establish qualifying private mortgage insurance under the Homeowners Protection Act?',
  premiumAllocableBeyondYearEnd:'Do actual premium records establish allocation to periods beyond this year end?',
  mortgageOutstandingAtYearEnd:'Was this original mortgage still outstanding at year end?',
  mortgageSatisfied:'Was this mortgage satisfied at any time during the year?',
  refinanced:'Was this mortgage refinanced?',
  premiumsRefunded:'Were any of these premiums refunded?',
  insuranceCancelled:'Was this insurance cancelled?',
  otherBorrowerPayments:'Did another borrower pay any of this original premium?',
  otherPremiumPayments:'Were there any other premium payments or prior premium histories for this policy?',
} as const;
export function MortgageInsurancePrepaidFields({data,index,taxYear,filingStatus,onChange}:{data:DeductionData;index:number;taxYear?:number|null;filingStatus?:FilingStatus|null;onChange:(draft:GuidedMortgageInsurancePrepaidData)=>void}) {
  const entry=data.mortgageEntries?.[index];
  const current=entry?.insurancePrepaid ?? {};
  const [error,setError]=useState('');
  let confirmationCurrent=false;
  if(current.sourceFactsConfirmed===true){try{buildGuidedMortgageInputs(data,taxYear,filingStatus);confirmationCurrent=true;}catch{/* Retained confirmation is never displayed as current without replay. */}}
  function update(change:Partial<GuidedMortgageInsurancePrepaidData>) {
    if (Object.entries(change).every(([key,value])=>Object.is(current[key as keyof GuidedMortgageInsurancePrepaidData],value))) return;
    setError('');onChange({...current,...change,sourceFactsConfirmed:null});
  }
  function action(kind:'capture'|'confirm') {
    try { const next=kind==='capture' ? captureGuidedMortgageInsurancePrepaid(data,index,taxYear,filingStatus) : confirmGuidedMortgageInsurancePrepaid(data,index,taxYear,filingStatus);onChange(next);setError(''); }
    catch(cause){setError(cause instanceof Error ? cause.message : 'Complete the actual source records and mortgage worksheet.');}
  }
  const text=(key:'sourceReference'|'paidDate'|'insuranceObtainedDate'|'statedTermMonths'|'mortgageSatisfiedDate',label:string,type='text')=><label className="guided-field" key={key}><span className="guided-field-label">{label}</span><input className="guided-input" type={type} value={current[key]??''} onChange={event=>update({[key]:event.target.value})}/></label>;
  return <fieldset className="guided-fieldset"><legend>Original prepaid mortgage insurance records</legend>
    <p className="guided-hint">This method supports an original 2026 FHA or qualifying private policy paid at closing by the primary taxpayer. Copy the actual records; Box 5 does not establish the original premium or annual allocation. Unknown facts remain blank.</p>
    {text('sourceReference','Original premium policy and payment record reference')}
    <label className="guided-field"><span className="guided-field-label">Actual original mortgage insurance provider</span><select className="guided-input" value={current.provider??''} onChange={event=>update({provider:event.target.value as GuidedMortgageInsurancePrepaidData['provider']})}><option value="">Choose actual provider</option><option value="fha">FHA</option><option value="private">Qualifying private insurance</option><option value="va">VA — separate method required</option><option value="rhs">RHS — separate method required</option></select></label>
    <CurrencyField label="Actual original prepaid premium paid" value={current.prepaidPremiumPaid??''} required hint="Enter the actual original payment, including 0 only if confirmed. Do not copy Box 5 or enter a calculated annual amount." onChange={raw=>update({prepaidPremiumPaid:isValidCurrencyValue(raw)?parseCurrencyInput(raw):raw})}/>
    <label className="guided-field"><span className="guided-field-label">Actual original premium payment method</span><select className="guided-input" value={current.paymentMethod??''} onChange={event=>update({paymentMethod:event.target.value as GuidedMortgageInsurancePrepaidData['paymentMethod']})}><option value="">Choose actual method</option><option value="cash">Paid in cash</option><option value="financed">Financed</option></select></label>
    {text('paidDate','Actual original premium payment date','date')}
    {text('insuranceObtainedDate','Actual date this insurance was obtained','date')}
    {text('statedTermMonths','Actual stated mortgage term in whole months')}
    {Object.entries(facts).map(([key,label])=>key==='privateInsuranceMeetsHpaDefinition' && current.provider!=='private' && current.privateInsuranceMeetsHpaDefinition==null?null:<label className="guided-field" key={key}><span className="guided-field-label">{label}</span><select className="guided-input" value={current[key as keyof typeof facts]==null?'':String(current[key as keyof typeof facts])} onChange={event=>update({[key]:event.target.value===''?null:event.target.value==='true'})}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>)}
    {(current.mortgageSatisfied===true || current.mortgageSatisfiedDate?.trim()) && text('mortgageSatisfiedDate','Actual mortgage satisfaction date','date')}
    <p className="guided-hint">First confirm the mortgage entry and annual home-debt worksheet below. Capture retains an original snapshot and clears confirmations. Reconfirm the current entry and worksheet, then confirm these retained originals. Edits never silently replace the snapshot.</p>
    <button type="button" className="utility-button" onClick={()=>action('capture')}>Capture actual original premium records</button>
    <button type="button" className="utility-button" onClick={()=>action('confirm')}>Confirm retained original premium records</button>
    {current.capturedOriginal && <p className="guided-hint">An original premium snapshot is retained. Recapture explicitly if the original records change.</p>}
    {confirmationCurrent && <p className="guided-hint" role="status">Original premium records explicitly confirmed.</p>}
    {error && <p className="guided-hint" role="alert">{error}</p>}
  </fieldset>;
}
