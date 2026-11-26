"use client";
import { hohMedicalConfirmations, newMedicalMileageHohDraft, type MedicalMileageHohDraft } from '@/lib/guided-medical-mileage-hoh';
import { TextFact, BooleanFact } from './fact-fields';
import { CurrencyField } from './currency-field';
export function MedicalMileageHohDetails({ data, onChange, onOriginalsChange = onChange, instructions }: {
    data?: MedicalMileageHohDraft;
    onChange: (next: MedicalMileageHohDraft | undefined) => void;
    onOriginalsChange?: (next: MedicalMileageHohDraft | undefined) => void;
    instructions?: string;
}) {
    if (!data)
        return <button type="button" onClick={() => onOriginalsChange(newMedicalMileageHohDraft())}>Add head-of-household originals</button>;
    const edit = (patch: Partial<MedicalMileageHohDraft>) => onOriginalsChange({ ...data, ...patch });
    const person = (owner: 'primary' | 'child') => <>{(['firstName', 'lastName', 'ssn', 'dateOfBirth'] as const).map(field => <TextFact key={field} type={field === 'dateOfBirth' ? 'date' : 'text'} label={`Original ${owner} ${{ firstName: 'first name', lastName: 'last name', ssn: 'taxpayer ID', dateOfBirth: 'birth date' }[field]}`} value={data[owner][field]} onChange={value => edit({ [owner]: { ...data[owner], [field]: value } })}/>)}</>;
    return <section aria-label="Original head-of-household evidence" style={{ gridColumn: '1 / -1' }}>
  <h5>Original head-of-household evidence</h5><p>{instructions ?? 'For this route only: your unmarried biological child under 19 lived in the same home for more than half the year. This does not add the child’s medical costs. Use your original household worksheet; omit medical details from its reference.'}</p>
  <TextFact label="Household source tax year" value={data.taxYear} onChange={taxYear => edit({ taxYear })}/>
  <TextFact label="Private household source reference" value={data.sourceReference} onChange={sourceReference => edit({ sourceReference })}/>
  {(['street', 'apt', 'city', 'state', 'zip'] as const).map(field => <TextFact key={field} label={`Original household ${field}`} value={data.homeAddress[field] ?? ''} onChange={value => edit({ homeAddress: { ...data.homeAddress, [field]: field === 'apt' ? (value || undefined) : value } })}/>)}
  {person('primary')}
  <TextFact label="Original child index (first child is 0)" value={data.child.dependentIndex} onChange={dependentIndex => edit({ child: { ...data.child, dependentIndex } })}/>
  {person('child')}
  <TextFact label="Original child relationship (child)" value={data.child.relationship} onChange={relationship=>edit({child:{...data.child,relationship}})}/>
  <TextFact label="Actual child nights in the same home" value={data.child.actualNightsInHome} onChange={actualNightsInHome => edit({ child: { ...data.child, actualNightsInHome } })}/>
  <p>Eligible home costs include rent, mortgage interest, real estate tax, home insurance, repairs, utilities and food eaten at home. Exclude clothing, education, medical treatment, transportation, vacations, life insurance and anyone’s services. More than half must be paid by you.</p>
  <CurrencyField label="Total eligible home-upkeep costs" value={data.totalEligibleHomeCosts} onChange={totalEligibleHomeCosts => edit({ totalEligibleHomeCosts })}/>
  <CurrencyField label="Home-upkeep costs paid by the primary taxpayer" value={data.paidByPrimary} onChange={paidByPrimary => edit({ paidByPrimary })}/>
  {(Object.keys(hohMedicalConfirmations) as Array<keyof typeof hohMedicalConfirmations>).map(field => <BooleanFact key={field} label={hohMedicalConfirmations[field]} value={data[field]} onChange={value => onChange({ ...data, [field]: value })}/>)}
  <button type="button" onClick={() => onOriginalsChange(undefined)}>Remove head-of-household originals</button>
 </section>;
}
