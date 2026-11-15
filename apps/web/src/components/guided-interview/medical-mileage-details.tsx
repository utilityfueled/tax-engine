'use client';

import {MedicalMileageHohDetails} from './medical-mileage-hoh-details';

import {
  medicalMileageConfirmations, medicalMileageDraftSchema, newMedicalMileageDraft,
  type MedicalMileageDraft,
} from '@/lib/guided-medical-mileage';
import { CurrencyField } from './currency-field';
import { BooleanFact, TextFact } from './fact-fields';

const confirmationFields = Object.keys(medicalMileageConfirmations) as (keyof typeof medicalMileageConfirmations)[];

export function MedicalMileageDetails({ data, available, headOfHousehold = false, onChange }: {
  data?: MedicalMileageDraft;
  available: boolean;
  headOfHousehold?: boolean;
  onChange: (next: MedicalMileageDraft | undefined) => void;
}) {
  if (data === undefined) {
    return available ? <button type="button" onClick={() => onChange(newMedicalMileageDraft())}>Add medical mileage log</button> : null;
  }
  const saved = medicalMileageDraftSchema.safeParse(data);
  const remove = <button type="button" onClick={() => onChange(undefined)}>Remove medical mileage log</button>;
  if (!available || !saved.success) {
    return <section aria-label="Medical mileage">
      <p role="alert">The saved medical mileage needs a supported 2026 own-care record.</p>
      {remove}
    </section>;
  }
  const log = saved.data;
  const edit = (patch: Partial<MedicalMileageDraft>) => onChange({ ...log, ...patch });
  return <section aria-label="Medical mileage" className="guided-expand-body">
    <h4>2026 medical mileage</h4>
    <p className="guided-hint">Use a neutral reference such as mileage-log-1. Keep names, destinations and medical details out of the reference. Enter one eligible mileage total per date and enter zero only when your records show zero.</p>
    <div className="guided-form-grid">
      <TextFact label="Private mileage log reference" value={log.logReference} onChange={logReference => edit({ logReference })} />
      <CurrencyField label="Other eligible unreimbursed medical expenses" value={log.otherEligibleUnreimbursedMedicalExpenses} onChange={otherEligibleUnreimbursedMedicalExpenses => edit({ otherEligibleUnreimbursedMedicalExpenses })} />
      <CurrencyField label="Eligible medical parking and tolls" value={log.parkingAndTolls} onChange={parkingAndTolls => edit({ parkingAndTolls })} />
    </div>
    {log.entries.map((row, index) => {
      const label = `Medical mileage ${index + 1}`;
      const updateRow = (patch: Partial<typeof row>) => edit({ entries: log.entries.map((entry, position) => position === index ? { ...entry, ...patch } : entry) });
      return <div className="guided-form-grid" key={index}>
        <TextFact label={`${label} date`} type="date" value={row.date} onChange={date => updateRow({ date })} />
        <TextFact label={`${label} eligible miles`} value={row.miles} onChange={miles => updateRow({ miles })} />
        <button type="button" onClick={() => edit({ entries: log.entries.filter((_, position) => position !== index) })}>Remove {label}</button>
      </div>;
    })}
    <button type="button" disabled={log.entries.length >= 365} onClick={() => edit({ entries: [...log.entries, { date: '', miles: '' }] })}>Add medical mileage date</button>
    <div className="guided-form-grid">
      {headOfHousehold && <MedicalMileageHohDetails data={log.headOfHouseholdSources} onChange={headOfHouseholdSources => onChange({...log,headOfHouseholdSources})}/>}
    {confirmationFields.map(field => <BooleanFact key={field} label={medicalMileageConfirmations[field]} value={log[field]} onChange={value => onChange({ ...log, [field]: value })} />)}
    </div>
    {remove}
  </section>;
}
