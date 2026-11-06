"use client";
import type { FilingStatus, PersonalInfoData } from '@/lib/guided-interview-flow';
import { copyEicHistoryHousehold, updateEicHistorySources, type EicDisallowanceHistoryData, type EicHistoryFilerData, type EicHistoryDenialData, type EicHistoryAllowanceData } from '@/lib/guided-eic-disallowance-history';
import { BooleanFact, TextFact } from './fact-fields';

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T | undefined; options: readonly (readonly [T, string])[]; onChange: (value: T | undefined) => void }) {
  return <label className="guided-field" style={{ minWidth: 0 }}><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(options.find(([key]) => key === event.target.value)?.[0])}>
    <option value="">Not known yet</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select></label>;
}
function KnownDate({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (value: string | null | undefined) => void }) {
  return <>
    <Choice label={`${label} status`} value={value === undefined ? undefined : value === null ? 'not-occurred' : 'occurred'} options={[
      ['not-occurred', 'Confirmed not to have occurred'], ['occurred', 'Occurred; enter the actual date'],
    ]} onChange={status => onChange(status === 'not-occurred' ? null : status === 'occurred' ? typeof value === 'string' ? value : '' : undefined)} />
    {typeof value === 'string' && <TextFact label={`${label} date`} type="date" value={value} onChange={onChange} />}
  </>;
}
function DenialRecord({ data, prefix, onChange, onRemove }: { data: EicHistoryDenialData; prefix: string; onChange: (data: EicHistoryDenialData) => void; onRemove: () => void }) {
  const update = (patch: Partial<EicHistoryDenialData>) => onChange({ ...data, ...patch });
  return <fieldset className="guided-card"><legend>{prefix}</legend>
    <div className="guided-form-grid">
      <TextFact label={`${prefix}: original denial ID`} value={data.sourceId ?? ''} onChange={sourceId => update({ sourceId })} />
      <TextFact label={`${prefix}: source reference`} value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
      <TextFact label={`${prefix}: denied return tax year`} value={data.taxYear ?? ''} onChange={taxYear => update({ taxYear })} />
      <TextFact label={`${prefix}: original return filing date`} type="date" value={data.originalReturnFiledDate ?? ''} onChange={originalReturnFiledDate => update({ originalReturnFiledDate })} />
      <TextFact label={`${prefix}: IRS notice date`} type="date" value={data.noticeDate ?? ''} onChange={noticeDate => update({ noticeDate })} />
      <KnownDate label={`${prefix}: assessment`} value={data.assessmentDate} onChange={assessmentDate => update({ assessmentDate })} />
      <KnownDate label={`${prefix}: final determination`} value={data.finalDeterminationDate} onChange={finalDeterminationDate => update({ finalDeterminationDate })} />
      <Choice label={`${prefix}: actual denial reason`} value={data.reason} options={[
        ['math_or_clerical', 'Math or clerical correction'], ['qualifying_child_only', 'Only the qualifying-child determination'],
        ['income_only', 'Only reported investment or earned income'], ['other', 'Another nonclerical reason'], ['omitted_required_8862', 'A required Form 8862 was omitted'],
      ]} onChange={reason => update({ reason })} />
      <Choice label={`${prefix}: actual IRS procedure`} value={data.procedure} options={[
        ['math_or_clerical', 'Math or clerical procedure'], ['deficiency', 'Deficiency procedure'],
      ]} onChange={procedure => update({ procedure })} />
      <Choice label={`${prefix}: final conduct determination`} value={data.conduct} options={[
        ['none', 'No conduct ban determined'], ['reckless', 'Reckless or intentional disregard'], ['fraud', 'Fraud'],
      ]} onChange={conduct => update({ conduct })} />
      <BooleanFact label={`${prefix}: pending appeal`} value={data.appealPending} onChange={appealPending => update({ appealPending })} />
      {(data.reason === 'omitted_required_8862' || data.underlyingDenialSourceId !== undefined) && <TextFact label={`${prefix}: underlying original denial ID`} value={data.underlyingDenialSourceId ?? ''} onChange={underlyingDenialSourceId => update({ underlyingDenialSourceId })} />}
    </div>
    <p className="guided-hint">Use the actual notice, assessment and final-determination records. A notice date is not automatically the assessment or final date. Pending appeals require their separate contested-determination method.</p>
    {(data.conduct === 'reckless' || data.conduct === 'fraud' || data.interveningOriginalReturns !== undefined || data.interveningReturnHistoryCompleteConfirmed != null) && <>
      <p className="guided-hint">Record original returns for later tax years filed after this original return and before the final determination. These filing dates can change the ban years. Do not derive them from the tax year alone.</p>
      {data.interveningOriginalReturns === undefined ? <button type="button" className="utility-button utility-button-small" onClick={() => update({ interveningOriginalReturns: [], interveningReturnHistoryCompleteConfirmed: null })}>{prefix}: record no intervening original returns</button> : data.interveningOriginalReturns.length === 0 ? <p className="guided-hint">Actual record: no intervening original returns.</p> : null}
      {data.interveningOriginalReturns?.map((row, i) => {
        const change = (patch: Partial<typeof row>) => update({ interveningOriginalReturns: data.interveningOriginalReturns?.map((record, index) => index === i ? { ...record, ...patch } : record), interveningReturnHistoryCompleteConfirmed: null });
        return <fieldset className="guided-card" key={i}><legend>{prefix}: intervening return {i + 1}</legend><div className="guided-form-grid">
          <TextFact label={`${prefix}, intervening return ${i + 1}: tax year`} value={row.taxYear ?? ''} onChange={taxYear => change({ taxYear })} />
          <TextFact label={`${prefix}, intervening return ${i + 1}: actual filing date`} type="date" value={row.filedDate ?? ''} onChange={filedDate => change({ filedDate })} />
          <TextFact label={`${prefix}, intervening return ${i + 1}: source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
        </div><button type="button" className="guided-card-remove" onClick={() => update({ interveningOriginalReturns: data.interveningOriginalReturns?.filter((_, index) => index !== i), interveningReturnHistoryCompleteConfirmed: null })}>Remove {prefix.toLowerCase()} intervening return {i + 1}</button></fieldset>;
      })}
      <button type="button" className="utility-button utility-button-small" onClick={() => update({ interveningOriginalReturns: [...(data.interveningOriginalReturns ?? []), {}], interveningReturnHistoryCompleteConfirmed: null })}>{prefix}: add an intervening original return</button>
      {data.interveningOriginalReturns !== undefined && <button type="button" className="guided-card-remove" onClick={() => update({ interveningOriginalReturns: undefined, interveningReturnHistoryCompleteConfirmed: null })}>{prefix}: mark intervening history unknown</button>}
      <BooleanFact label={`${prefix}: complete intervening filing history recorded`} value={data.interveningReturnHistoryCompleteConfirmed} onChange={interveningReturnHistoryCompleteConfirmed => update({ interveningReturnHistoryCompleteConfirmed })} />
    </>}
    {data.banNotice === undefined ? <button type="button" className="utility-button utility-button-small" onClick={() => update({ banNotice: {} })}>{prefix}: add the actual ban notice</button> : <fieldset className="guided-card"><legend>{prefix}: actual ban notice</legend><div className="guided-form-grid">
      <TextFact label={`${prefix}: ban notice source reference`} value={data.banNotice.sourceReference ?? ''} onChange={sourceReference => update({ banNotice: { ...data.banNotice, sourceReference } })} />
      <TextFact label={`${prefix}: ban notice date`} type="date" value={data.banNotice.noticeDate ?? ''} onChange={noticeDate => update({ banNotice: { ...data.banNotice, noticeDate } })} />
      <TextFact label={`${prefix}: first eligible tax year stated in notice`} value={data.banNotice.firstEligibleTaxYear ?? ''} onChange={firstEligibleTaxYear => update({ banNotice: { ...data.banNotice, firstEligibleTaxYear } })} />
    </div><p className="guided-hint">Enter the actual year stated in the controlling notice. This is retained as original evidence and checked against the supported filing chronology; it is not an eligibility override.</p><button type="button" className="guided-card-remove" onClick={() => update({ banNotice: undefined })}>Remove {prefix.toLowerCase()} ban notice</button></fieldset>}
    <button type="button" className="guided-card-remove" onClick={onRemove}>Remove {prefix.toLowerCase()}</button>
  </fieldset>;
}
function AllowanceRecord({ data, prefix, onChange, onRemove }: { data: EicHistoryAllowanceData; prefix: string; onChange: (data: EicHistoryAllowanceData) => void; onRemove: () => void }) {
  const update = (patch: Partial<EicHistoryAllowanceData>) => onChange({ ...data, ...patch });
  return <fieldset className="guided-card"><legend>{prefix}</legend><div className="guided-form-grid">
    <TextFact label={`${prefix}: original allowance ID`} value={data.sourceId ?? ''} onChange={sourceId => update({ sourceId })} />
    <TextFact label={`${prefix}: source reference`} value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
    <TextFact label={`${prefix}: allowed return tax year`} value={data.taxYear ?? ''} onChange={taxYear => update({ taxYear })} />
    <TextFact label={`${prefix}: actual return filing date`} type="date" value={data.returnFiledDate ?? ''} onChange={returnFiledDate => update({ returnFiledDate })} />
    <TextFact label={`${prefix}: actual IRS allowance date`} type="date" value={data.allowanceDate ?? ''} onChange={allowanceDate => update({ allowanceDate })} />
    <Choice label={`${prefix}: eligibility evidence actually supplied`} value={data.demonstration} options={[
      ['form8862', 'Form 8862'], ['other_irs_required_documents', 'Other documents required by the IRS'],
    ]} onChange={demonstration => update({ demonstration })} />
  </div>
    <p className="guided-hint">A submitted return alone is not an IRS allowance. Link each earlier denial actually resolved by this allowance.</p>
    {data.resolvedDenialSourceIds?.map((id, i) => <div className="guided-form-grid" key={i}>
      <TextFact label={`${prefix}: resolved original denial ID ${i + 1}`} value={id} onChange={value => update({ resolvedDenialSourceIds: data.resolvedDenialSourceIds?.map((old, index) => index === i ? value : old) })} />
      <button type="button" className="guided-card-remove" onClick={() => update({ resolvedDenialSourceIds: data.resolvedDenialSourceIds?.filter((_, index) => index !== i) })}>Remove {prefix.toLowerCase()} denial link {i + 1}</button>
    </div>)}
    <button type="button" className="utility-button utility-button-small" onClick={() => update({ resolvedDenialSourceIds: [...(data.resolvedDenialSourceIds ?? []), ''] })}>{prefix}: link an actual earlier denial</button>
    <button type="button" className="guided-card-remove" onClick={onRemove}>Remove {prefix.toLowerCase()}</button>
  </fieldset>;
}
function FilerHistory({ data, index, onChange }: { data: EicHistoryFilerData; index: number; onChange: (data: EicHistoryFilerData) => void }) {
  const prefix = data.owner === 'primary' ? 'Primary filer' : data.owner === 'spouse' ? 'Spouse' : `Filer ${index + 1}`;
  const update = (patch: Partial<EicHistoryFilerData>) => onChange({ ...data, ...patch,
    ...('denials' in patch || 'laterAllowances' in patch ? { allHistoryIncluded: null } : {}) });
  return <fieldset className="guided-card"><legend>{prefix} EIC history</legend>
    <p className="guided-hint">Copied original: {data.originalTaxpayer?.firstName || 'unknown'} {data.originalTaxpayer?.lastName || ''}. Identifier retained locally. Include this filer’s own history before the marriage as well.</p>
    <TextFact label={`${prefix}: history source reference`} value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
    {data.denials === undefined ? <button type="button" className="utility-button utility-button-small" onClick={() => update({ denials: [] })}>{prefix}: record no prior EIC denials</button> : data.denials.length === 0 ? <p className="guided-hint">Actual record: no prior EIC denials.</p> : null}
    {data.denials?.map((row, i) => <DenialRecord key={i} data={row} prefix={`${prefix} denial ${i + 1}`} onChange={next => update({ denials: data.denials?.map((old, j) => j === i ? next : old) })} onRemove={() => update({ denials: data.denials?.filter((_, j) => j !== i) })} />)}
    <button type="button" className="utility-button utility-button-small" onClick={() => update({ denials: [...(data.denials ?? []), {}] })}>{prefix}: add an actual EIC denial</button>
    {data.denials !== undefined && <button type="button" className="guided-card-remove" onClick={() => update({ denials: undefined })}>{prefix}: mark denial history unknown</button>}
    {data.laterAllowances === undefined ? <button type="button" className="utility-button utility-button-small" onClick={() => update({ laterAllowances: [] })}>{prefix}: record no later IRS allowances</button> : data.laterAllowances.length === 0 ? <p className="guided-hint">Actual record: no later IRS allowances.</p> : null}
    {data.laterAllowances?.map((row, i) => <AllowanceRecord key={i} data={row} prefix={`${prefix} allowance ${i + 1}`} onChange={next => update({ laterAllowances: data.laterAllowances?.map((old, j) => j === i ? next : old) })} onRemove={() => update({ laterAllowances: data.laterAllowances?.filter((_, j) => j !== i) })} />)}
    <button type="button" className="utility-button utility-button-small" onClick={() => update({ laterAllowances: [...(data.laterAllowances ?? []), {}] })}>{prefix}: add an actual IRS allowance</button>
    {data.laterAllowances !== undefined && <button type="button" className="guided-card-remove" onClick={() => update({ laterAllowances: undefined })}>{prefix}: mark allowance history unknown</button>}
    <BooleanFact label={`${prefix}: all EIC history included`} value={data.allHistoryIncluded} onChange={allHistoryIncluded => update({ allHistoryIncluded })} />
    <BooleanFact label={`${prefix}: history checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
  </fieldset>;
}

export function EicDisallowanceHistoryDetails({ personal, filingStatus, onChange }: { personal: PersonalInfoData; filingStatus: FilingStatus | null; onChange: (data: EicDisallowanceHistoryData | undefined) => void }) {
  const data = personal.eicDisallowanceHistory;
  const update = (patch: Partial<EicDisallowanceHistoryData>) => onChange(updateEicHistorySources(data ?? {}, patch));
  return <details className="guided-card"><summary>Prior Earned Income Credit decisions</summary>
    <p className="guided-hint">Record actual IRS denials, later allowances and original filing dates. Each joint filer has a separate history. A blank record does not mean no prior denial. These records establish history; they do not complete current Form 8862 or resolve a pending appeal.</p>
    {!data ? <button type="button" className="utility-button utility-button-small" onClick={() => onChange({})}>Add EIC denial and allowance history</button> : <>
      <div className="guided-form-grid">
        <TextFact label="EIC history source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => update({ sourceTaxYear })} />
        <TextFact label="EIC history source reference" value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
        <Choice label="Current EIC claim status" value={data.claimStatus} options={[
          ['preparing', 'Preparing an unfiled claim'], ['filed', 'This claim was actually filed'],
        ]} onChange={claimStatus => update({ claimStatus, ...(claimStatus === 'preparing' ? { claimFilingDate: undefined } : claimStatus === 'filed' ? { preparationAsOfDate: undefined } : {}) })} />
        <TextFact label="EIC history reviewed through" type="date" value={data.reviewedThroughDate ?? ''} onChange={reviewedThroughDate => update({ reviewedThroughDate })} />
        {(data.claimStatus === 'preparing' || data.preparationAsOfDate !== undefined) && <TextFact label="EIC preparation as of" type="date" value={data.preparationAsOfDate ?? ''} onChange={preparationAsOfDate => update({ preparationAsOfDate })} />}
        {(data.claimStatus === 'filed' || data.claimFilingDate !== undefined) && <TextFact label="Actual current EIC claim filing date" type="date" value={data.claimFilingDate ?? ''} onChange={claimFilingDate => update({ claimFilingDate })} />}
      </div>
      <button type="button" className="utility-button utility-button-small" disabled={!filingStatus || (filingStatus === 'mfj' && !personal.spouse)} onClick={() => onChange(copyEicHistoryHousehold(personal, filingStatus, data))}>Copy actual filer identities</button>
      <p className="guided-hint">Copy the household names and identifiers entered above. No dates or history answers are filled in. Re-copying a replaced filer starts that person’s history as unknown; records are not reassigned to another person.</p>
      {data.filers?.map((filer, i) => <FilerHistory key={i} data={filer} index={i} onChange={next => update({ filers: data.filers?.map((row, j) => j === i ? next : row) })} />)}
      <BooleanFact label="EIC history checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
      <p className="guided-hint">An actual ban prevents the ordinary EIC claim. If history requires Form 8862, its current-year source questions remain a separate step; a confirmation here is not a substitute. <a href="https://www.irs.gov/publications/p596" target="_blank" rel="noreferrer">IRS Publication 596</a> explains the history rules. These records remain local unless you explicitly request an operation that uses them.</p>
      <button type="button" className="guided-card-remove" onClick={() => onChange(undefined)}>Remove EIC history records</button>
    </>}
  </details>;
}
