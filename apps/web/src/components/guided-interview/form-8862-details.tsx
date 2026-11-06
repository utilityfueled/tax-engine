"use client";
import type { FilingStatus, PersonalInfoData } from '@/lib/guided-interview-flow';
import { copyForm8862Household, updateForm8862Sources, type Form8862Data, type Form8862ChildData, type ResidenceDaysData } from '@/lib/guided-form-8862';
import { BooleanFact, TextFact } from './fact-fields';
import { EicQualifyingChildSourceDetails } from './eic-separated-spouse-details';

const buttonClass = 'utility-button utility-button-small';
const reasons = ['school', 'vacation', 'business', 'medical', 'military', 'juvenile_detention'] as const;
function ResidenceDays({ data, prefix, onChange }: { data: ResidenceDaysData | undefined; prefix: string; onChange: (next: ResidenceDaysData | undefined) => void }) {
  if (!data) return <button type="button" className={buttonClass} onClick={() => onChange({})}>{prefix}: add actual residence days</button>;
  const update = (patch: Partial<ResidenceDaysData>) => onChange({ ...data, ...patch });
  return <fieldset className="guided-card">
    <legend>{prefix}: actual residence days</legend>
    <p className="guided-hint">Enter distinct days from actual records. U.S. home days, qualifying temporary absences and counted foreign military days must not overlap. A blank amount or unrecorded absence list remains unknown. For a child born or deceased during the year, retain actual days during the period the child was alive; the form’s full-year entry is calculated separately.</p>
    <div className="guided-form-grid">
      <TextFact label={`${prefix}: residence source reference`} value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
      <TextFact label={`${prefix}: actual U.S. home days`} value={data.actualUnitedStatesDays ?? ''} onChange={actualUnitedStatesDays => update({ actualUnitedStatesDays })} />
      <TextFact label={`${prefix}: counted foreign extended-duty days`} value={data.militaryOutsideUnitedStatesDays ?? ''} onChange={militaryOutsideUnitedStatesDays => update({ militaryOutsideUnitedStatesDays })} />
    </div>
    {data.temporaryAbsences === undefined ? <button type="button" className={buttonClass} onClick={() => update({ temporaryAbsences: [] })}>{prefix}: record no temporary absences</button> : data.temporaryAbsences.length === 0 ? <p className="guided-hint">Actual record: no temporary absences.</p> : null}
    {(data.temporaryAbsences ?? []).map((absence, index) => {
      const name = `${prefix} absence ${index + 1}`;
      const edit = (patch: Partial<typeof absence>) => update({ temporaryAbsences: data.temporaryAbsences?.map((row, i) => i === index ? { ...row, ...patch } : row) });
      return <fieldset className="guided-card" key={index}><legend>{name}</legend><div className="guided-form-grid">
        <TextFact label={`${name}: source reference`} value={absence.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
        <label className="guided-field"><span className="guided-field-label">{name}: reason</span><select className="guided-input" value={absence.reason ?? ''} onChange={event => edit({ reason: reasons.find(reason => reason === event.target.value) })}><option value="">Confirm from actual records</option>{reasons.map(reason => <option key={reason} value={reason}>{reason.replaceAll('_', ' ')}</option>)}</select></label>
        <TextFact label={`${name}: days`} value={absence.days ?? ''} onChange={days => edit({ days })} />
      </div><button type="button" className="guided-card-remove" onClick={() => update({ temporaryAbsences: data.temporaryAbsences?.filter((_, i) => i !== index) })}>{name}: remove</button></fieldset>;
    })}
    <div className="panel-stack">
      <button type="button" className={buttonClass} onClick={() => update({ temporaryAbsences: [...(data.temporaryAbsences ?? []), {}] })}>{prefix}: add a temporary absence</button>
      {data.temporaryAbsences !== undefined && <button type="button" className={buttonClass} onClick={() => update({ temporaryAbsences: undefined })}>{prefix}: mark temporary absences unknown</button>}
      {!data.extendedActiveDuty ? <button type="button" className={buttonClass} onClick={() => update({ extendedActiveDuty: {} })}>{prefix}: add extended-duty order</button> : <fieldset className="guided-card"><legend>{prefix}: actual foreign extended-duty order</legend>
        <TextFact label={`${prefix}: military order source reference`} value={data.extendedActiveDuty.sourceReference ?? ''} onChange={sourceReference => update({ extendedActiveDuty: { ...data.extendedActiveDuty, sourceReference } })} />
        <BooleanFact label={`${prefix}: ordered over 90 days or indefinitely`} value={data.extendedActiveDuty.orderedOver90DaysOrIndefinite} onChange={orderedOver90DaysOrIndefinite => update({ extendedActiveDuty: { ...data.extendedActiveDuty, orderedOver90DaysOrIndefinite } })} />
        <button type="button" className="guided-card-remove" onClick={() => update({ extendedActiveDuty: undefined })}>{prefix}: remove extended-duty order</button>
      </fieldset>}
    </div>
    <BooleanFact label={`${prefix}: all days recorded without overlap`} value={data.allDaysIncludedAndDistinctConfirmed} onChange={allDaysIncludedAndDistinctConfirmed => update({ allDaysIncludedAndDistinctConfirmed })} />
    <button type="button" className="guided-card-remove" onClick={() => onChange(undefined)}>{prefix}: remove residence days</button>
  </fieldset>;
}
function CurrentChild({ data, index, onChange }: { data: Form8862ChildData; index: number; onChange: (next: Form8862ChildData) => void }) {
  const prefix = `Form 8862 child ${index + 1}`;
  const update = (patch: Partial<Form8862ChildData>) => onChange({ ...data, ...patch });
  const record = data.bornAndDeceasedRecord;
  return <div className="panel-stack">
    <EicQualifyingChildSourceDetails currentForm data={data} index={index} onChange={next => onChange({ ...data, ...next })} />
    <fieldset className="guided-card"><legend>{prefix}: dates and residence evidence</legend>
      <label className="guided-field"><span className="guided-field-label">{prefix}: death status during claim year</span><select className="guided-input" value={data.deathDate === undefined ? '' : data.deathDate === null ? 'alive' : 'deceased'} onChange={event => update({ deathDate: event.target.value === 'alive' ? null : event.target.value === 'deceased' ? '' : undefined })}><option value="">Confirm from actual records</option><option value="alive">Alive at year end</option><option value="deceased">Died during the claim year</option></select></label>
      {typeof data.deathDate === 'string' && <TextFact label={`${prefix}: actual death date`} type="date" value={data.deathDate} onChange={deathDate => update({ deathDate })} />}
      <ResidenceDays data={data.homeDays} prefix={prefix} onChange={homeDays => update({ homeDays })} />
      <p className="guided-hint">For a child born and deceased during the claim year without an SSN, the IRS requires a copy of a birth or death certificate or hospital record showing live birth. Record the actual document and retain its copy for attachment; these fields do not create or upload that document.</p>
      {!record ? <button type="button" className={buttonClass} onClick={() => update({ bornAndDeceasedRecord: {} })}>{prefix}: add actual live-birth document</button> : <fieldset className="guided-card"><legend>{prefix}: live-birth document</legend>
        <TextFact label={`${prefix}: live-birth source reference`} value={record.sourceReference ?? ''} onChange={sourceReference => update({ bornAndDeceasedRecord: { ...record, sourceReference } })} />
        <label className="guided-field"><span className="guided-field-label">{prefix}: live-birth document type</span><select className="guided-input" value={record.recordType ?? ''} onChange={event => update({ bornAndDeceasedRecord: { ...record, recordType: (['birth_certificate', 'death_certificate', 'hospital_record'] as const).find(kind => kind === event.target.value) } })}><option value="">Confirm from actual records</option><option value="birth_certificate">Birth certificate</option><option value="death_certificate">Death certificate</option><option value="hospital_record">Hospital record</option></select></label>
        <BooleanFact label={`${prefix}: document shows live birth`} value={record.showsLiveBirth} onChange={showsLiveBirth => update({ bornAndDeceasedRecord: { ...record, showsLiveBirth } })} />
        <BooleanFact label={`${prefix}: actual document copy available to attach`} value={record.copyAvailableForReturnAttachment} onChange={copyAvailableForReturnAttachment => update({ bornAndDeceasedRecord: { ...record, copyAvailableForReturnAttachment } })} />
        <button type="button" className="guided-card-remove" onClick={() => update({ bornAndDeceasedRecord: undefined })}>{prefix}: remove live-birth document record</button>
      </fieldset>}
    </fieldset>
  </div>;
}
export function Form8862Details({ personal, filingStatus, onChange }: { personal: PersonalInfoData; filingStatus: FilingStatus | null; onChange: (next: Form8862Data | undefined) => void }) {
  const data = personal.eicRecertificationSources;
  const update = (patch: Partial<Form8862Data>) => onChange(updateForm8862Sources(data ?? {}, patch));
  const jointDeath = data?.jointReturnAfterDeath;
  const showJointDeath = jointDeath !== undefined || (filingStatus === 'mfj'
    && (personal.standardDeductionFacts?.primaryDeceased === true || personal.standardDeductionFacts?.spouseDeceased === true));
  return <details className="guided-card"><summary>Current Form 8862 EIC recertification records</summary>
    <p className="guided-hint">Use these records when the actual EIC denial history requires a current Form 8862. Prior history determines whether the income-only shortcut applies. Record actual answers here and in the EIC claimant panel; a completed-form checkbox cannot replace them.</p>
    {!data ? <button type="button" className={buttonClass} onClick={() => onChange({})}>Add actual current Form 8862 records</button> : <div className="panel-stack">
      <div className="guided-form-grid">
        <TextFact label="Form 8862 current source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => update({ sourceTaxYear })} />
        <TextFact label="Form 8862 current source reference" value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
      </div>
      <button type="button" className={buttonClass} onClick={() => onChange(copyForm8862Household(personal, filingStatus, data))}>Copy current Form 8862 household originals</button>
      <p className="guided-hint">Copy the actual names, identifiers, birth dates, relationships and residence months already entered above. This records a known empty candidate list only when the household count is explicitly zero. Unchanged recorded answers are retained; a replacement person cannot inherit another person’s records.</p>
      {showJointDeath && (!jointDeath ? <button type="button" className={buttonClass} onClick={() => update({ jointReturnAfterDeath: {} })}>Add actual joint-return-after-death records</button> : <fieldset className="guided-card"><legend>Joint return after a spouse’s death</legend>
        <p className="guided-hint">Each filer retains their own tax-year period. Use the original death dates above and actual January 1 through death or December 31 records below. If both spouses died, the surviving spouse’s own period ends at their later death. Fiscal years, accounting-period changes and remarriage require separate return treatment; this record does not establish legal authority to file.</p>
        <TextFact label="Form 8862 joint death-period source reference" value={jointDeath.sourceReference ?? ''} onChange={sourceReference => update({ jointReturnAfterDeath: { ...jointDeath, sourceReference } })} />
        <BooleanFact label="Did the surviving spouse remarry before the end of their own tax year?" value={jointDeath.survivingSpouseRemarriedBeforeOwnYearEnd} onChange={survivingSpouseRemarriedBeforeOwnYearEnd => update({ jointReturnAfterDeath: { ...jointDeath, survivingSpouseRemarriedBeforeOwnYearEnd } })} />
        <button type="button" className="guided-card-remove" onClick={() => update({ jointReturnAfterDeath: undefined })}>Remove joint-return-after-death records</button>
      </fieldset>)}
      {data.filers?.map((filer, index) => {
        const prefix = `Form 8862 ${filer.owner ?? 'unassigned'} filer`;
        const edit = (patch: Partial<typeof filer>) => update({ filers: data.filers?.map((row, i) => i === index ? { ...row, ...patch } : row) });
        return <fieldset className="guided-card" key={index}><legend>{prefix}</legend>
          <p className="guided-hint">Original: {filer.originalTaxpayer?.firstName} {filer.originalTaxpayer?.lastName}; birth date {filer.originalTaxpayer?.dateOfBirth || 'unknown'}. Identifier retained locally.</p>
          <div className="guided-form-grid"><TextFact label={`${prefix}: source reference`} value={filer.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
            <TextFact label={`${prefix}: applicable year start`} type="date" value={filer.applicableYearStart ?? ''} onChange={applicableYearStart => edit({ applicableYearStart })} />
            <TextFact label={`${prefix}: applicable year end`} type="date" value={filer.applicableYearEnd ?? ''} onChange={applicableYearEnd => edit({ applicableYearEnd })} />
          </div><ResidenceDays data={filer.homeDays} prefix={prefix} onChange={homeDays => edit({ homeDays })} />
        </fieldset>;
      })}
      {data.children?.length === 0 && <p className="guided-hint">Actual copied household: no candidate children.</p>}
      {data.children?.map((child, index) => <CurrentChild key={child.sourceId ?? index} data={child} index={index} onChange={next => update({ children: data.children?.map((row, i) => i === index ? next : row) })} />)}
      <BooleanFact label="Form 8862 all candidate children recorded" value={data.allCandidateChildrenIncluded} onChange={allCandidateChildrenIncluded => update({ allCandidateChildrenIncluded })} />
      <BooleanFact label="Form 8862 current sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
      <p className="guided-hint">These records remain in the local workspace. Source edits revoke confirmations; check the current records, history and claimant facts again. <a href="https://www.irs.gov/instructions/i8862" target="_blank" rel="noreferrer">IRS Form 8862 instructions</a>. Claimant days are tested against each actual calendar-year period ending at death or December 31. Use the recorded death date and exact period; a spouse’s full-year days do not replace the deceased filer’s record.</p>
      <button type="button" className="guided-card-remove" onClick={() => onChange(undefined)}>Remove current Form 8862 records</button>
    </div>}
  </details>;
}
