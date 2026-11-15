"use client";
import type { EicHistoryPetitionData } from '@/lib/guided-eic-disallowance-history';
import { BooleanFact, TextFact } from './fact-fields';

const textFields = [
  ['sourceTaxYear', 'current return tax year'], ['deniedTaxYear', 'denied return tax year'],
  ['originalTaxpayerSsn', 'original petitioner SSN'], ['sourceReference', 'complete proof source reference'],
  ['denialSourceId', 'linked original denial ID'], ['denialSourceReference', 'linked denial reference'],
  ['deficiencyNoticeReference', 'statutory deficiency notice reference'],
  ['docketReference', 'court docket source reference'], ['docketNumber', 'actual court docket number'],
  ['petitionReference', 'filed petition source reference'],
  ['accountTranscriptReference', 'account transcript reference'], ['courtEventHistoryReference', 'complete court event history reference'],
] as const;
const dateFields = [
  ['originalReturnFiledDate', 'original return filing date'], ['noticeDate', 'original notice date'],
  ['noticeLastPetitionDate', 'last petition date printed on actual notice'], ['petitionFiledDate', 'actual petition filing date'],
  ['claimDate', 'actual claim or preparation date'], ['reviewedThroughDate', 'original records reviewed through date'],
] as const;
const eventFields = [
  ['assessmentDate', 'assessment'], ['finalDeterminationDate', 'final determination'],
  ['decisionDate', 'court decision'], ['dismissalDate', 'dismissal'], ['settlementDate', 'settlement'],
  ['assessmentWaiverDate', 'assessment waiver'], ['terminationOrJeopardyAssessmentDate', 'termination or jeopardy assessment'],
  ['bankruptcyCaseDate', 'bankruptcy case'], ['paymentAssessmentDate', 'payment assessment'],
  ['otherAssessmentExceptionDate', 'other assessment exception'],
] as const;
const confirmationFields = [
  ['noticeDeadlineConfirmed', 'printed notice deadline checked against original'],
  ['actualTaxCourtDeficiencyPetitionConfirmed', 'actual Tax Court deficiency petition confirmed'],
  ['actualTimelyPetitionConfirmed', 'actual timely filing confirmed from originals'],
  ['completeCourtAndAccountHistoryConfirmed', 'complete court and account history through review date confirmed'],
] as const;

export function EicUnassessedPetitionDetails({ data, prefix, onChange, onRemove }: {
  data: EicHistoryPetitionData; prefix: string; onChange: (data: EicHistoryPetitionData) => void; onRemove: () => void;
}) {
  const change = (patch: Partial<EicHistoryPetitionData>) => onChange({ ...data, ...patch, sourceFactsConfirmed: null });
  return <fieldset className="guided-card"><legend>{prefix}: unassessed Tax Court petition originals</legend>
    <p className="guided-hint">Use only an actual timely Tax Court deficiency petition with complete notice, docket, filed petition and account records showing no assessment or finality through the claim and review dates. Pending appeal alone is insufficient. Assessed denials, final bans and other appeals remain separate; this record does not award EIC or complete Form 8862.</p>
    <div className="guided-form-grid">
      <label className="guided-field" style={{ minWidth: 0, gridColumn: '1 / -1' }}><span className="guided-field-label">{prefix}: original petitioner owner</span>
        <select className="guided-input" value={data.owner ?? ''} onChange={event => change({ owner: event.target.value === 'primary' ? 'primary' : event.target.value === 'spouse' ? 'spouse' : undefined })}>
          <option value="">Not known yet</option><option value="primary">Primary filer</option><option value="spouse">Spouse</option>
        </select>
      </label>
      {textFields.map(([key,label]) => <TextFact key={key} label={`${prefix}: ${label}`} value={data[key] ?? ''} onChange={value => change({ [key]: value })} />)}
      {dateFields.map(([key,label]) => <TextFact key={key} label={`${prefix}: ${label}`} type="date" value={data[key] ?? ''} onChange={value => change({ [key]: value })} />)}
      {eventFields.map(([key,label]) => <div key={key} style={{ minWidth: 0, gridColumn: '1 / -1' }}>
        <label className="guided-field"><span className="guided-field-label">{prefix}: {label} original status</span>
          <select className="guided-input" value={data[key] === undefined ? '' : data[key] === null ? 'none' : 'date'} onChange={event => change({ [key]: event.target.value === 'none' ? null : event.target.value === 'date' ? typeof data[key] === 'string' ? data[key] : '' : undefined })}>
            <option value="">Not known yet</option><option value="none">Originals confirm no event through review</option><option value="date">Event occurred; enter actual date</option>
          </select>
        </label>
        {typeof data[key] === 'string' && <TextFact label={`${prefix}: ${label} actual event date`} type="date" value={data[key]} onChange={value => change({ [key]: value })} />}
      </div>)}
      {confirmationFields.map(([key,label]) => <BooleanFact key={key} label={`${prefix}: ${label}`} value={data[key]} onChange={value => change({ [key]: value })} />)}
      <BooleanFact label={`${prefix}: proof checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />
    </div>
    <button type="button" className="guided-card-remove" onClick={onRemove}>Remove {prefix.toLowerCase()} petition originals</button>
  </fieldset>;
}
