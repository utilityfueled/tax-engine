'use client';

import {
  businessMileageConfirmations, businessMileageDraftSchema, newBusinessMileageDraft,
  type BusinessMileageDraft,
} from '@/lib/guided-business-mileage';
import { CurrencyField } from './currency-field';
import { BooleanFact, TextFact } from './fact-fields';

const confirmationFields = Object.keys(businessMileageConfirmations) as (keyof typeof businessMileageConfirmations)[];

export function BusinessMileageDetails({ data, available, error, onChange }: {
  data?: BusinessMileageDraft;
  available: boolean;
  error?: string;
  onChange: (next: BusinessMileageDraft | undefined) => void;
}) {
  if (data === undefined) {
    return available ? <button type="button" onClick={() => onChange(newBusinessMileageDraft())}>Add business mileage log</button> : null;
  }
  const saved = businessMileageDraftSchema.safeParse(data);
  const remove = <button type="button" onClick={() => onChange(undefined)}>Remove business mileage log</button>;
  if (!available || !saved.success) {
    return <section aria-label="Business mileage">
      <p role="alert">{error ?? 'The saved business mileage needs a supported 2026 federal return and a primary-owner cash business.'}</p>
      {remove}
    </section>;
  }
  const log = saved.data;
  const edit = (patch: Partial<BusinessMileageDraft>) => onChange({ ...log, ...patch });
  const editPartIV = (patch: Partial<BusinessMileageDraft['partIV']>) => edit({ partIV: { ...log.partIV, ...patch } });
  return <section aria-label="Business mileage" className="guided-expand-body">
    <h4>2026 business mileage</h4>
    <p className="guided-hint">Use a neutral reference such as vehicle-log-1. Keep names, destinations and business details in your own records. Enter one eligible business mileage total per date. Use your complete vehicle log for total, commuting and personal miles. Enter zero only when your records show zero.</p>
    <div className="guided-form-grid">
      <TextFact label="Private business mileage log reference" value={log.logReference} onChange={logReference => edit({ logReference })} />
      <TextFact label="First business-use date" type="date" value={log.placedInService} onChange={placedInService => edit({ placedInService })} />
      <TextFact label="Total vehicle miles" value={log.totalMiles} onChange={totalMiles => edit({ totalMiles })} />
      <TextFact label="Commuting miles" value={log.commutingMiles} onChange={commutingMiles => edit({ commutingMiles })} />
      <TextFact label="Other personal miles" value={log.otherPersonalMiles} onChange={otherPersonalMiles => edit({ otherPersonalMiles })} />
      <CurrencyField label="Eligible business parking and tolls" value={log.parkingAndTolls} onChange={parkingAndTolls => edit({ parkingAndTolls })} />
    </div>
    {log.entries.map((row, index) => {
      const label = `Business mileage ${index + 1}`;
      const editRow = (patch: Partial<typeof row>) => edit({ entries: log.entries.map((entry, position) => position === index ? { ...entry, ...patch } : entry) });
      return <div className="guided-form-grid" key={index}>
        <TextFact label={`${label} date`} type="date" value={row.date} onChange={date => editRow({ date })} />
        <TextFact label={`${label} eligible miles`} value={row.miles} onChange={miles => editRow({ miles })} />
        <button type="button" onClick={() => edit({ entries: log.entries.filter((_, position) => position !== index) })}>Remove {label}</button>
      </div>;
    })}
    <button type="button" disabled={log.entries.length >= 365} onClick={() => edit({ entries: [...log.entries, { date: '', miles: '' }] })}>Add business mileage date</button>
    <div className="guided-form-grid">
      {confirmationFields.map(field => <BooleanFact key={field} label={businessMileageConfirmations[field]} value={log[field]} onChange={value => edit({ [field]: value })} />)}
    </div>
    <details className="guided-expand">
      <summary className="guided-expand-trigger">Schedule C Part IV vehicle answers</summary>
      <p className="guided-hint">Optional for calculation. If you enter any of these answers, complete all three.</p>
      <div className="guided-form-grid">
        <BooleanFact label="Was this vehicle available for personal use off duty?" value={log.partIV.offDutyPersonalUseAvailable} onChange={offDutyPersonalUseAvailable => editPartIV({ offDutyPersonalUseAvailable })} />
        <BooleanFact label="Did you have another vehicle available for personal use?" value={log.partIV.otherPersonalVehicleAvailable} onChange={otherPersonalVehicleAvailable => editPartIV({ otherPersonalVehicleAvailable })} />
        <BooleanFact label="Confirm that Form 4562 is not required for this business" value={log.partIV.notRequiredToFileForm4562ForBusiness} onChange={notRequiredToFileForm4562ForBusiness => editPartIV({ notRequiredToFileForm4562ForBusiness })} />
      </div>
    </details>
    {error && <p className="guided-hint">{error}</p>}
    {remove}
  </section>;
}
