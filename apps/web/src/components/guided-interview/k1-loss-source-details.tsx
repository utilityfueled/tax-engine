"use client";

import { updateK1LossSources } from '@/lib/guided-k1-qbi-sources';
import type { K1ActivityData, K1EblHistoryData, K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

type Field = readonly [string, string, 'text' | 'money' | 'signed' | 'boolean' | readonly (readonly [string, string])[]];
function Fields<T extends object>({ prefix, data, fields, onChange }: { prefix: string; data?: T; fields: readonly Field[]; onChange: (patch: Partial<T>) => void }) {
  const record = (data ?? {}) as Record<string, unknown>;
  return <div className="guided-form-grid">{fields.map(([key, name, kind]) => {
    const label = `${prefix} ${name}`, value = record[key];
    const change = (next: unknown) => onChange({ [key]: next } as Partial<T>);
    if (kind === 'boolean') return <BooleanFact key={key} label={label} value={value as boolean | null | undefined} onChange={change} />;
    if (kind === 'money' || kind === 'signed') return <CurrencyField key={key} label={label} value={typeof value === 'string' ? value : ''} allowNegative={kind === 'signed'} onChange={change} />;
    if (kind === 'text') return <TextFact key={key} label={label} value={typeof value === 'string' ? value : ''} onChange={change} />;
    return <label className="guided-field" key={key}><span className="guided-field-label">{label}</span><select className="guided-input" value={typeof value === 'string' ? value : ''} onChange={event => change(event.target.value)}>
      <option value="">Choose from actual records</option>{kind.map(([code, text]) => <option key={code} value={code}>{text}</option>)}
    </select></label>;
  })}</div>;
}
const evidence: readonly Field[] = [['sourceTaxYear', 'source year', 'text'], ['sourceReference', 'source reference', 'text'], ['sourceFactsConfirmed', 'checked after the last edit', 'boolean']];
const owner: readonly (readonly [string, string])[] = [['primary', 'Primary taxpayer'], ['spouse', 'Spouse on the actual joint return']];
const vintageFields: readonly Field[] = [['taxYear', 'origin year', 'text'], ['originalLoss', 'original loss', 'money'],
  ['qualifiedOriginalLoss', 'original qualified loss', 'money'], ['remainingLoss', 'filed remaining loss', 'money'], ['qualifiedRemainingLoss', 'filed remaining qualified loss', 'money']];

function PassiveHistory({ prefix, data, onChange }: { prefix: string; data?: K1ActivityData['passiveHistory']; onChange: (data: K1ActivityData['passiveHistory']) => void }) {
  return !data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add {prefix} prior passive history</button> : <fieldset><legend>{prefix} prior passive history</legend>
    <Fields prefix={`${prefix} prior passive history`} data={data} fields={evidence} onChange={patch => onChange({ ...data, ...patch })} />
    {data.vintages === undefined && <p role="status">The prior passive vintage list is unknown.</p>}
    {data.vintages?.length === 0 && <p>Explicitly recorded: no prior passive vintages.</p>}
    {data.vintages?.map((row, index) => <div className="guided-w2-card" key={index}><Fields prefix={`${prefix} passive vintage ${index + 1}`} data={row}
      fields={[...vintageFields, ['materiallyParticipatedInCurrentYear', 'current material participation', 'boolean']]}
      onChange={patch => onChange({ ...data, vintages: data.vintages?.map((value, i) => i === index ? { ...value, ...patch } : value) })} />
      <button type="button" className="utility-button" onClick={() => onChange({ ...data, vintages: data.vintages?.filter((_, i) => i !== index) })}>Remove {prefix} passive vintage {index + 1}</button></div>)}
    <button type="button" className="utility-button" onClick={() => onChange({ ...data, vintages: [...(data.vintages ?? []), {}] })}>Add {prefix} passive vintage</button>
    <button type="button" className="utility-button" onClick={() => onChange({ ...data, vintages: [] })}>Record no {prefix} prior passive vintages</button>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove {prefix} prior passive history</button>
  </fieldset>;
}

function K1Activity({ index, data, onChange }: { index: number; data: K1ActivityData; onChange: (next: K1ActivityData) => void }) {
  const prefix = `K-1 ${index + 1}`, change = (patch: Partial<K1ActivityData>) => onChange({ ...data, ...patch });
  const basis = data.basis, risk = data.atRisk, se = data.selfEmploymentTreatment;
  return <details className="guided-expand"><summary className="guided-expand-trigger">{prefix} original and histories</summary><div className="guided-expand-body">
    <Fields prefix={prefix} data={data} fields={[
      ['sourceTaxYear', 'source year', 'text'], ['sourceReference', 'original source reference', 'text'],
      ['accountHolder', 'owner', owner], ['entityType', 'entity type', [['partnership', 'Partnership'], ['s_corporation', 'S corporation']]],
      ['entityName', 'entity name', 'text'], ['entityEIN', 'entity EIN', 'text'], ['recipientName', 'recipient name', 'text'], ['recipientTaxpayerIdLast4', 'recipient taxpayer ID last four', 'text'],
      ['ordinaryBusinessOnlyConfirmed', 'ordinary business activity only', 'boolean'], ['continuingActivityConfirmed', 'continuing activity without a disposal', 'boolean'],
      ['domesticNonPtpConfirmed', 'domestic activity and not a publicly traded partnership', 'boolean'],
      ['allOtherAmountsZeroConfirmed', 'all other income, deduction, credit, distribution and withholding boxes are zero', 'boolean'],
      ...(data.entityType === 's_corporation' ? [['noScorpDebtBasisOrElectionConfirmed', 'no shareholder debt basis or basis-ordering election', 'boolean'] as const] : []),
      ['sameOwnerHistoryConfirmed', 'history belongs to the same current owner', 'boolean'], ['sameRegularAmtTreatmentConfirmed', 'independent regular and AMT basis and loss treatment are the same', 'boolean'],
    ]} onChange={change} />
    <fieldset><legend>{prefix} original ordinary and Section 199A statement</legend><Fields prefix={prefix} data={data.statement} fields={[
      ['ordinaryIncome', 'ordinary income or loss', 'signed'], ['section199AQBI', 'original qualified income or loss', 'signed'],
      ['section199AW2Wages', 'Section 199A W-2 wages', 'money'], ['section199AUBIA', 'Section 199A property basis', 'money'],
      ['section199AIsSST', 'specified service business', 'boolean'], ['isPassiveActivity', 'passive activity for this owner', 'boolean'], ['qbiMateriallyParticipated', 'owner materially participated', 'boolean'],
      ...(data.entityType === 'partnership' ? [['selfEmploymentEarnings', 'original Box 14 code A', 'signed'],
        ['selfEmploymentIncomeType', 'self-employment income type', [['farm', 'Farm'], ['nonfarm', 'Nonfarm']]]] as readonly Field[] : []),
    ]} onChange={patch => change({ statement: { ...data.statement, ...patch } })} /></fieldset>
    {!basis ? <button type="button" className="utility-button" onClick={() => change({ basis: {} })}>Add {prefix} opening basis sources</button> : <fieldset><legend>{prefix} opening basis sources</legend>
      <Fields prefix={`${prefix} basis`} data={basis} fields={[...evidence, ['beginningBasis', 'actual opening basis', 'money'],
        ['priorSuspendedLoss', 'filed prior suspended basis loss', 'money'], ['noOtherBasisChangesConfirmed', 'no other basis changes beyond the reported ordinary result', 'boolean']]}
        onChange={patch => change({ basis: { ...basis, ...patch } })} />
      <p className="guided-hint">Use the preceding-year source. Positive prior basis losses require a separate release method and remain saved.</p>
      <button type="button" className="utility-button" onClick={() => change({ basis: undefined })}>Remove {prefix} opening basis sources</button>
    </fieldset>}
    {!risk ? <button type="button" className="utility-button" onClick={() => change({ atRisk: {} })}>Add {prefix} at-risk sources</button> : <fieldset><legend>{prefix} simplified at-risk sources</legend>
      <Fields prefix={`${prefix} at risk`} data={risk} fields={[...evidence, ['simplifiedMethodEligible', 'simplified method eligibility established', 'boolean'],
        ['adjustedBasisAtEffectiveDate', 'adjusted basis at effective date', 'money'], ['priorYearAmountAtRisk', 'prior-year amount at risk', 'money'],
        ['currentYearIncreases', 'current source increases', 'money'], ['currentYearDecreases', 'current source decreases', 'money'], ['priorSuspendedLoss', 'filed prior suspended at-risk loss', 'money']]}
        onChange={patch => change({ atRisk: { ...risk, ...patch } })} />
      <p className="guided-hint">The ordinary amount on Form 6198 comes from the calculated basis limit. Enter source movements above, not a current allowance.</p>
      {!risk.priorLossHistory ? <button type="button" className="utility-button" onClick={() => change({ atRisk: { ...risk, priorLossHistory: {} } })}>Add {prefix} prior at-risk history</button> : <>
        <Fields prefix={`${prefix} prior at-risk history`} data={risk.priorLossHistory} fields={evidence} onChange={patch => change({ atRisk: { ...risk, priorLossHistory: { ...risk.priorLossHistory, ...patch } } })} />
        <p>{risk.priorLossHistory.vintages === undefined ? 'The preceding-year at-risk loss list is unknown.' : `Recorded prior at-risk vintages: ${risk.priorLossHistory.vintages.length}. Positive releases require their separate method.`}</p>
        <button type="button" className="utility-button" onClick={() => change({ atRisk: { ...risk, priorLossHistory: { ...risk.priorLossHistory, vintages: [] } } })}>Record no {prefix} prior at-risk vintages</button>
      </>}
      <button type="button" className="utility-button" onClick={() => change({ atRisk: undefined })}>Remove {prefix} at-risk sources</button>
    </fieldset>}
    <Fields prefix={prefix} data={data} fields={[[ 'priorPassiveLoss', 'filed prior passive loss', 'money' ]]} onChange={change} />
    <PassiveHistory prefix={prefix} data={data.passiveHistory} onChange={passiveHistory => change({ passiveHistory })} />
    {data.entityType === 'partnership' && (!se ? <button type="button" className="utility-button" onClick={() => change({ selfEmploymentTreatment: {} })}>Add {prefix} partner adjustment facts</button> : <fieldset><legend>{prefix} partner adjustment facts</legend>
      <p className="guided-hint">Original negative Box 14 must have the same character as the original ordinary loss. Basis, at-risk and passive limits determine the current transfer. Different loss character, prior SE loss and other partner deductions require their separate method.</p>
      <Fields prefix={`${prefix} SE`} data={se} fields={[...evidence, ['method', 'source method', [['ordinary_current', 'Ordinary current partner amounts']]],
        ['noOtherPartnerAdjustmentsConfirmed', 'no other partner deductions or adjustments', 'boolean']]} onChange={patch => change({ selfEmploymentTreatment: { ...se, ...patch } })} />
      {!se.priorLossHistory ? <button type="button" className="utility-button" onClick={() => change({ selfEmploymentTreatment: { ...se, priorLossHistory: {} } })}>Add {prefix} prior SE history</button> : <Fields prefix={`${prefix} prior SE history`} data={se.priorLossHistory}
        fields={[...evidence, ['amount', 'actual suspended SE loss', 'money']]} onChange={patch => change({ selfEmploymentTreatment: { ...se, priorLossHistory: { ...se.priorLossHistory, ...patch } } })} />}
      <button type="button" className="utility-button" onClick={() => change({ selfEmploymentTreatment: undefined })}>Remove {prefix} partner adjustment facts</button>
    </fieldset>)}
  </div></details>;
}

function EblHistory({ index, data, nol, onChange }: { index: number; data: K1EblHistoryData; nol?: NetOperatingLossData; onChange: (next: K1EblHistoryData) => void }) {
  const prefix = `EBL history ${index + 1}`, change = (patch: Partial<K1EblHistoryData>) => onChange({ ...data, ...patch });
  const original = nol?.vintages?.find(row => row.sourceId === data.nolSourceId);
  return <details className="guided-expand"><summary className="guided-expand-trigger">{prefix}</summary><div className="guided-expand-body">
    <Fields prefix={prefix} data={data} fields={[...evidence, ['nolSourceId', 'original regular NOL source', (nol?.vintages ?? []).filter(row => row.originKind === 'excess_business_loss' && row.sourceId).map(row => [row.sourceId ?? '', `${row.sourceId} — ${row.lossTaxYear ?? 'year unknown'}`] as const)],
      ['accountHolder', 'owner', owner], ['recipientName', 'recipient name', 'text'], ['recipientTaxpayerIdLast4', 'recipient taxpayer ID last four', 'text'],
      ['activityName', 'origin activity name', 'text'], ['activityEIN', 'origin activity EIN', 'text'], ['limitationSourceReference', 'origin Form 461 and character record', 'text'],
      ['originalQualifiedLoss', 'filed original qualified loss', 'money'], ['qualifiedOpeningCarryforward', 'filed opening qualified carry', 'money'],
      ['allHistoryIncluded', 'all intervening qualified history included', 'boolean'], ['materiallyParticipatedInCurrentYear', 'current material participation', 'boolean']]}
      onChange={change} />
    <button type="button" className="utility-button" disabled={!original} onClick={() => original && change({ originalNol: structuredClone(original), sourceFactsConfirmed: null })}>Copy {prefix} original regular NOL record</button>
    {data.originalNol ? <p>Saved original: {data.originalNol.sourceId}, year {data.originalNol.lossTaxYear}, original loss {data.originalNol.originalLoss}, opening carry {data.originalNol.openingCarryforward}. The actual regular record and every history row must still match.</p> : <p role="status">The original regular NOL record has not been linked.</p>}
    {data.history === undefined && <p role="status">The qualified use and reduction history is unknown.</p>}
    {data.history?.length === 0 && <p>Explicitly recorded: no historical qualified use or reduction.</p>}
    {data.history?.map((row, i) => <div className="guided-w2-card" key={i}><Fields prefix={`${prefix} use ${i + 1}`} data={row} fields={[
      ['taxYear', 'actual year', 'text'], ['qualifiedNolAbsorption', 'qualified loss absorption', 'money'], ['qualifiedAttributeReduction', 'qualified attribute reduction', 'money'], ['sourceReference', 'source reference', 'text'],
    ]} onChange={patch => change({ history: data.history?.map((value, n) => n === i ? { ...value, ...patch } : value) })} />
      <button type="button" className="utility-button" onClick={() => change({ history: data.history?.filter((_, n) => n !== i) })}>Remove {prefix} use {i + 1}</button></div>)}
    <button type="button" className="utility-button" onClick={() => change({ history: [...(data.history ?? []), {}] })}>Add {prefix} use or reduction</button>
    <button type="button" className="utility-button" onClick={() => change({ history: [] })}>Record no {prefix} prior uses or reductions</button>
  </div></details>;
}

export function K1LossSourceDetails({ data, nol, onChange }: { data?: K1LossSourcesData; nol?: NetOperatingLossData; onChange: (next: K1LossSourcesData | undefined) => void }) {
  const change = (patch: Partial<K1LossSourcesData>) => onChange(updateK1LossSources(data ?? {}, patch));
  const classification = data?.form461Classification;
  return <details className="guided-expand"><summary className="guided-expand-trigger">K-1 and qualified loss sources</summary><div className="guided-expand-body">
    <p className="guided-hint">Use original K-1 and Section 199A statements, opening basis and at-risk records, and filed qualified-loss histories. The return calculates the current deduction and carry. Prior EBL character uses its separate regular NOL record; AMT and ordinary QBI carries stay separate.</p>
    <p className="guided-hint">This method covers continuing ordinary domestic K-1 activities. Other boxes, prior basis or at-risk releases, differing AMT treatment and mixed loss pools under a new excess-business-loss limit need their additional methods. Keep their actual records; do not substitute zero.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add K-1 and qualified loss sources</button> : <>
      <Fields prefix="K-1 packet" data={data} fields={[...evidence, ['allK1ActivitiesIncluded', 'all original K-1 activities included', 'boolean']]} onChange={change} />
      {data.activities === undefined && <p role="status">The original K-1 list is unknown.</p>}
      {data.activities?.length === 0 && <p>Explicitly recorded: no original K-1s.</p>}
      {data.activities?.map((row, index) => <div key={index}><K1Activity index={index} data={row} onChange={next => change({ activities: data.activities?.map((value, i) => i === index ? next : value) })} />
        <button type="button" className="utility-button" onClick={() => change({ activities: data.activities?.filter((_, i) => i !== index) })}>Remove K-1 {index + 1}</button></div>)}
      <button type="button" className="utility-button" onClick={() => change({ activities: [...(data.activities ?? []), {}] })}>Add original K-1</button>
      <button type="button" className="utility-button" onClick={() => change({ activities: [] })}>Record no original K-1s</button>
      {!classification ? <button type="button" className="utility-button" onClick={() => change({ form461Classification: {} })}>Add current business classification</button> : <fieldset><legend>Current business classification</legend>
        <Fields prefix="Business classification" data={classification} fields={[...evidence,
          ['method', 'source method', [['ordinary_k1_only', 'Ordinary K-1 businesses only']]],
          ['allNonEmployeeBusinessSourcesIncluded', 'all nonemployee business sources included', 'boolean'], ['capitalIncomeIsNonbusiness', 'capital income is nonbusiness investment income', 'boolean'],
          ['otherBusinessIncome', 'actual other business income', 'money'], ['otherBusinessDeductions', 'actual other business deductions', 'money'],
        ]} onChange={patch => change({ form461Classification: { ...classification, ...patch } })} />
        <p className="guided-hint">The supported classification requires actual zero other business sources. SE, health and retirement deductions are calculated separately from the return records.</p>
        <button type="button" className="utility-button" onClick={() => change({ form461Classification: undefined })}>Remove current business classification</button>
      </fieldset>}
      <fieldset><legend>Prior EBL qualified character</legend>
        <Fields prefix="EBL sources" data={data} fields={[[ 'allExcessBusinessLossHistoriesIncluded', 'all actual regular EBL histories included', 'boolean' ]]} onChange={change} />
        {data.excessBusinessLossHistories === undefined && <p role="status">The prior qualified EBL history list is unknown.</p>}
        {data.excessBusinessLossHistories?.map((row, index) => <div key={index}><EblHistory index={index} data={row} nol={nol} onChange={next => change({ excessBusinessLossHistories: data.excessBusinessLossHistories?.map((value, i) => i === index ? next : value) })} />
          <button type="button" className="utility-button" onClick={() => change({ excessBusinessLossHistories: data.excessBusinessLossHistories?.filter((_, i) => i !== index) })}>Remove EBL history {index + 1}</button></div>)}
        <button type="button" className="utility-button" onClick={() => change({ excessBusinessLossHistories: [...(data.excessBusinessLossHistories ?? []), {}] })}>Add prior EBL qualified history</button>
        <button type="button" className="utility-button" onClick={() => change({ excessBusinessLossHistories: [] })}>Record no prior EBL qualified histories</button>
      </fieldset>
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove K-1 and qualified loss sources</button>
    </>}
  </div></details>;
}
