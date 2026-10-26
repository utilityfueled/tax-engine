"use client";

import type { K1CharitableSourcesData, K1CharitableStatementData, K1CharitableBasisData } from '@/lib/guided-k1-charitable-data';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
import { updateK1CharitableSources } from '@/lib/guided-k1-charitable-sources';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';
import { K1CashDistributionDetails } from './k1-cash-distribution-details';
import { K1CharitableAtRiskDetails } from './k1-charitable-at-risk-details';

type Field = readonly [string, string, 'text' | 'money' | 'signed' | 'boolean' | readonly (readonly [string, string])[]];
function Fields<T extends object>({ prefix, data, fields, onChange }: { prefix: string; data?: T; fields: readonly Field[]; onChange: (patch: Partial<T>) => void }) {
  const record = (data ?? {}) as Record<string, unknown>;
  return <div className="guided-form-grid">{fields.map(([key, name, kind]) => {
    const label = `${prefix} ${name}`, value = record[key], change = (next: unknown) => onChange({ [key]: next } as Partial<T>);
    if (kind === 'boolean') return <BooleanFact key={key} label={label} value={value as boolean | null | undefined} onChange={change} />;
    if (kind === 'money' || kind === 'signed') return <CurrencyField key={key} label={label} value={typeof value === 'string' ? value : ''} allowNegative={kind === 'signed'} onChange={change} />;
    if (kind === 'text') return <TextFact key={key} label={label} value={typeof value === 'string' ? value : ''} onChange={change} />;
    return <label className="guided-field" key={key}><span className="guided-field-label">{label}</span><select className="guided-input" value={typeof value === 'string' ? value : ''} onChange={event => change(event.target.value)}>
      <option value="">Choose from actual records</option>
      {typeof value === 'string' && value && !kind.some(([code]) => code === value) && <option value={value}>Saved source: {value}</option>}
      {kind.map(([code, text]) => <option key={code} value={code}>{text}</option>)}
    </select></label>;
  })}</div>;
}
const evidence: readonly Field[] = [['sourceTaxYear', 'source year', 'text'], ['sourceReference', 'source reference', 'text'], ['sourceFactsConfirmed', 'checked after the last edit', 'boolean']];
const owner = [['primary', 'Primary taxpayer'], ['spouse', 'Spouse on the actual joint return']] as const;
const entity = [['partnership', 'Partnership'], ['s_corporation', 'S corporation']] as const;
const category = [['cash_60', 'Cash — code A'], ['capital_gain_30', 'Capital gain property — code E'], ['capital_gain_20', 'Capital gain property — code F']] as const;
const capacity: readonly Field[] = [['adjustedBasisAtEffectiveDate', 'adjusted basis at effective date', 'money'], ['priorYearAmountAtRisk', 'prior-year amount at risk', 'money'],
  ['currentYearIncreases', 'current-year increases', 'money'], ['currentYearDecreases', 'current-year decreases', 'money']];

function Original({ prefix, data, onChange }: { prefix: string; data?: K1CharitableStatementData['original']; onChange: (data: K1CharitableStatementData['original']) => void }) {
  const change = (patch: Partial<NonNullable<K1CharitableStatementData['original']>>) => onChange({ ...data, ...patch });
  return <fieldset><legend>{prefix} original statement</legend>
    <Fields prefix={`${prefix} original`} data={data} fields={[
      ['taxYear', 'tax year', 'text'], ['partnershipName', 'entity name', 'text'], ['partnershipEIN', 'entity EIN', 'text'], ['entityType', 'entity type', entity], ['accountHolder', 'owner', owner],
      ['ordinaryIncome', 'ordinary income or loss', 'signed'], ['interestIncome', 'interest', 'money'], ['ordinaryDividends', 'ordinary dividends', 'money'], ['qualifiedDividends', 'qualified dividends', 'money'],
      ['netShortTermCapitalGain', 'short-term capital gain or loss', 'signed'], ['netLongTermCapitalGain', 'long-term capital gain or loss', 'signed'],
      ['charitableCash', 'cash contributions code A', 'money'], ['charitableCapitalGain30', 'capital gain property code E', 'money'], ['charitableCapitalGain20', 'capital gain property code F', 'money'],
      ['beginningBasis', 'opening outside or stock basis', 'money'], ['taxExemptInterest', 'tax-exempt interest', 'money'], ['otherTaxExemptIncome', 'other tax-exempt income', 'money'],
      ['nondeductibleExpenses', 'nondeductible expenses', 'money'], ['distributions', 'cash distributions', 'money'], ['federalIncomeTaxWithheld', 'federal income tax withheld', 'money'],
      ['section199AQBI', 'Section 199A qualified income or loss', 'signed'], ['section199AW2Wages', 'Section 199A W-2 wages', 'money'], ['section199AUBIA', 'Section 199A property basis', 'money'],
      ['section199AIsSST', 'specified service business', 'boolean'], ['isPassiveActivity', 'passive activity', 'boolean'], ['qbiMateriallyParticipated', 'owner materially participated', 'boolean'],
      ['selfEmploymentEarnings', 'partnership Box 14 code A (zero for S corporation)', 'signed'], ['selfEmploymentNetEarningsAfterAdjustments', 'partner worksheet net earnings (zero for S corporation)', 'signed'],
      ['selfEmploymentIncomeType', 'partnership self-employment type', [['farm', 'Farm'], ['nonfarm', 'Nonfarm']]], ['selfEmploymentFactsConfirmed', 'partnership self-employment sources confirmed', 'boolean'],
      ...(data?.entityType === 's_corporation' ? [
        ['beginningDebtBasis', 'opening shareholder debt basis', 'money'], ['additionalLoansToScorp', 'new shareholder loans', 'money'], ['priorDebtBasisReduction', 'prior debt basis reduction', 'money'],
        ['election1367', 'Section 1367 basis-order election made', 'boolean'],
      ] as const : []),
    ]} onChange={change} />
    <Fields prefix={`${prefix} original prior basis`} data={data?.priorSuspendedLosses} fields={[[ 'charitable', 'charitable suspension', 'money' ]]}
      onChange={patch => change({ priorSuspendedLosses: { ...data?.priorSuspendedLosses, ...patch } })} />
    <fieldset><legend>{prefix} original Form 6198</legend>
      <p className="guided-hint">Enter the eight amounts from the actual activity worksheet. Its income and deduction amounts must reconcile to the original K-1 and basis records.</p>
      <Fields prefix={`${prefix} Form 6198`} data={data?.form6198} fields={[
        ['activityName', 'activity name', 'text'], ['ordinaryIncome', 'ordinary income or loss', 'signed'], ['gainLossFromDispositions', 'disposition gain or loss', 'signed'],
        ['otherIncomeGains', 'other income or gains', 'signed'], ['otherDeductionsLosses', 'other deductions or losses', 'signed'], ...capacity,
      ]} onChange={patch => change({ form6198: { ...data?.form6198, ...patch } })} />
    </fieldset>
  </fieldset>;
}
function Basis({ prefix, data, onChange }: { prefix: string; data?: K1CharitableBasisData; onChange: (next: K1CharitableBasisData) => void }) {
  const change = (patch: Partial<K1CharitableBasisData>) => onChange({ ...data, ...patch });
  return <fieldset><legend>{prefix} original basis attachments</legend>
    <Fields prefix={`${prefix} basis`} data={data} fields={[...evidence,
      ['statementYearStart', 'statement period start', 'text'], ['statementYearEnd', 'statement period end', 'text'], ['entityName', 'entity name', 'text'], ['entityEIN', 'entity EIN', 'text'],
      ['entityType', 'entity type', entity], ['accountHolder', 'owner', owner], ['recipientName', 'recipient taxpayer name', 'text'], ['recipientTaxpayerIdLast4', 'recipient SSN last four', 'text'],
      ['basisFactsConfirmed', 'original basis facts established', 'boolean'], ['noOtherBasisChangesConfirmed', 'all basis changes are represented', 'boolean'],
      ['cashDistributionsOnlyConfirmed', 'distributions are cash only', 'boolean'], ['priorBasisHistoryComplete', 'all prior basis history included', 'boolean'],
    ]} onChange={change} />
    <p className="guided-hint">Each original gift needs its own source ID and recipient receipt. Earlier basis suspensions are separate from charitable percentage-limit carryovers.</p>
    {data?.currentContributions === undefined && <p role="status">The current gift list is unknown.</p>}
    {data?.currentContributions?.length === 0 && <p>Explicitly recorded: no current K-1 gifts.</p>}
    {data?.currentContributions?.map((row, index) => <fieldset className="guided-w2-card" key={index}><legend>{prefix} current gift {index + 1}</legend>
      <Fields prefix={`${prefix} current gift ${index + 1}`} data={row} fields={[
        ['sourceId', 'original source ID', 'text'], ['category', 'original category', category], ['contributionDate', 'contribution date', 'text'],
        ['contributionShare', 'contribution share', 'money'], ['adjustedBasisShare', 'adjusted basis share', 'money'], ['sourceReference', 'original reference', 'text'],
      ]} onChange={patch => change({ currentContributions: data.currentContributions?.map((value, i) => i === index ? { ...value, ...patch } : value) })} />
      <button type="button" className="utility-button" onClick={() => change({ currentContributions: data.currentContributions?.filter((_, i) => i !== index) })}>Remove {prefix} current gift {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => change({ currentContributions: [...(data?.currentContributions ?? []), {}] })}>Add {prefix} current gift</button>
    <button type="button" className="utility-button" onClick={() => change({ currentContributions: [] })}>Record no {prefix} current gifts</button>
    {data?.priorBasisSuspensions === undefined && <p role="status">The prior basis origin list is unknown.</p>}
    {data?.priorBasisSuspensions?.length === 0 && <p>Explicitly recorded: no prior charitable basis suspensions.</p>}
    {data?.priorBasisSuspensions?.map((row, index) => {
      const label = `${prefix} prior basis origin ${index + 1}`;
      const update = (patch: Partial<typeof row>) => change({ priorBasisSuspensions: data.priorBasisSuspensions?.map((value, i) => i === index ? { ...value, ...patch } : value) });
      return <fieldset className="guided-w2-card" key={index}><legend>{label}</legend>
        <Fields prefix={label} data={row} fields={[
          ['sourceId', 'original source ID', 'text'], ['originTaxYear', 'origin year', 'text'], ['category', 'original category', category],
          ['contributionShare', 'original contribution share', 'money'], ['adjustedBasisShare', 'original adjusted basis share', 'money'],
          ['appreciationPreviouslyTakenIntoAccount', 'appreciation previously taken into account', 'money'], ['sourceReference', 'original reference', 'text'],
        ]} onChange={update} />
        <p className="guided-hint">Record every year from the original contribution through the preceding year, including actual zero basis use.</p>
        {row.basisUseHistory === undefined && <p role="status">The basis-use history is unknown.</p>}
        {row.basisUseHistory?.map((use, i) => <div key={i}><Fields prefix={`${label} use ${i + 1}`} data={use} fields={[[ 'taxYear', 'tax year', 'text' ], [ 'basisAllowed', 'basis used', 'money' ]]}
          onChange={patch => update({ basisUseHistory: row.basisUseHistory?.map((value, n) => n === i ? { ...value, ...patch } : value) })} />
          <button type="button" className="utility-button" onClick={() => update({ basisUseHistory: row.basisUseHistory?.filter((_, n) => n !== i) })}>Remove {label} use {i + 1}</button></div>)}
        <button type="button" className="utility-button" onClick={() => update({ basisUseHistory: [...(row.basisUseHistory ?? []), {}] })}>Add {label} use year</button>
        <button type="button" className="utility-button" onClick={() => update({ basisUseHistory: [] })}>Record no {label} use years</button>
        <button type="button" className="utility-button" onClick={() => change({ priorBasisSuspensions: data.priorBasisSuspensions?.filter((_, i) => i !== index) })}>Remove {label}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => change({ priorBasisSuspensions: [...(data?.priorBasisSuspensions ?? []), {}] })}>Add {prefix} prior basis origin</button>
    <button type="button" className="utility-button" onClick={() => change({ priorBasisSuspensions: [] })}>Record no {prefix} prior basis origins</button>
  </fieldset>;
}
function CharitableStatement({ index, data, activities, onChange }: { index: number; data: K1CharitableStatementData; activities?: K1LossSourcesData['activities']; onChange: (next: K1CharitableStatementData) => void }) {
  const prefix = `Charitable K-1 ${index + 1}`, change = (patch: Partial<K1CharitableStatementData>) => onChange({ ...data, ...patch }), risk = data.atRisk;
  return <details className="guided-expand"><summary className="guided-expand-trigger">{prefix} original and attachments</summary><div className="guided-expand-body">
    <Fields prefix={prefix} data={data} fields={[
      ['link', 'original statement location', [['independent', 'Separate original K-1'], ['qbi', 'Existing K-1 in qualified loss sources']]],
      ...(data.link === 'qbi' ? [['qbiSourceId', 'existing original K-1', (activities ?? []).map((row, i) => [`scheduleK1:${i}`, `K-1 ${i + 1}: ${row.entityName || 'name not entered'} (${row.accountHolder || 'owner unknown'})`] as const)]] as readonly Field[] : []),
      ['originalSourceReference', 'original statement reference', 'text'], ['allUnlistedAmountsZeroConfirmed', 'all unlisted original amounts are zero', 'boolean'],
      ['domesticContinuingNonPtpConfirmed', 'continuing domestic activity without PTP or disposal', 'boolean'], ['sameRegularAmtTreatmentConfirmed', 'regular and AMT treatment are the same', 'boolean'],
    ]} onChange={change} />
    {data.link === 'qbi' && <p className="guided-hint">Select the same original activity already recorded in adjustments. Answer the separate noncharitable-zero question from its original boxes. If the attached original has capital or investment income, record those actual amounts and the activity assignment below and answer that zero question No. The original all-other-boxes-zero answer cannot describe a positive charitable contribution.</p>}
    <Original prefix={prefix} data={data.original} onChange={original => change({ original })} />
    <Basis prefix={prefix} data={data.basis} onChange={basis => change({ basis })} />
    <K1CashDistributionDetails prefix={prefix} data={data.cashDistribution} entityType={data.original?.entityType} onChange={cashDistribution => change({ cashDistribution })} />
    <fieldset><legend>{prefix} recipient receipts</legend>
      {data.receipts === undefined && <p role="status">The recipient receipt list is unknown.</p>}
      {data.receipts?.length === 0 && <p>Explicitly recorded: no recipient receipts.</p>}
      {data.receipts?.map((row, i) => <fieldset className="guided-w2-card" key={i}><legend>{prefix} receipt {i + 1}</legend>
        <Fields prefix={`${prefix} receipt ${i + 1}`} data={row} fields={[
          ['basisSourceId', 'original gift source ID', 'text'], ['originalBox', 'original K-1 box', [['13', 'Partnership box 13'], ['12', 'S-corporation box 12']]], ['originalCode', 'original code', [['A', 'A'], ['E', 'E'], ['F', 'F']]],
          ['recipientName', 'recipient organization', 'text'], ['recipientCategory', 'organization category', [['fifty-percent', '50% organization'], ['private-nonoperating', 'Private nonoperating foundation'], ['other-thirty-percent', 'Other 30% organization']]],
          ['qualifiedOrganization', 'qualified organization', 'boolean'], ['donorAdvisedFund', 'donor-advised fund', 'boolean'], ['supportingOrganization', 'supporting organization', 'boolean'],
          ['sourceReference', 'receipt reference', 'text'], ['contributionDate', 'contribution date', 'text'], ['propertyType', 'property type', [['appreciated_stock', 'Appreciated stock'], ['other_property', 'Other property — separate method']]],
          ['acquisitionDate', 'stock acquisition date', 'text'], ['fairMarketValueShare', 'allocated original fair market value', 'money'], ['qualifiedAppreciatedStock', 'qualified appreciated stock', 'boolean'],
        ]} onChange={patch => change({ receipts: data.receipts?.map((value, n) => n === i ? { ...value, ...patch } : value) })} />
        <button type="button" className="utility-button" onClick={() => change({ receipts: data.receipts?.filter((_, n) => n !== i) })}>Remove {prefix} receipt {i + 1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={() => change({ receipts: [...(data.receipts ?? []), {}] })}>Add {prefix} recipient receipt</button>
      <button type="button" className="utility-button" onClick={() => change({ receipts: [] })}>Record no {prefix} recipient receipts</button>
    </fieldset>
    <fieldset><legend>{prefix} independent at-risk source proof</legend>
      <Fields prefix={`${prefix} at risk`} data={risk} fields={[...evidence, ['simplifiedMethodEligible', 'simplified method eligibility established', 'boolean'],
        ['allActivityDeductionsIncluded', 'all activity deductions included', 'boolean'], ['computation', 'actual computation', [['first_year', 'First year'], ['subsequent_year', 'Subsequent year']]], ...capacity,
      ]} onChange={patch => change({ atRisk: { ...risk, ...patch } })} />
      <p className="guided-hint">These four source amounts must match the original Form 6198. The return verifies capacity against the original items. If capacity does not cover the deductions, the actual activity assignment below is required; do not enter a calculated allowance.</p>
      <K1CharitableAtRiskDetails prefix={prefix} data={risk?.activityAllocation} onChange={activityAllocation => change({ atRisk: { ...risk, activityAllocation } })} />
      <Fields prefix={`${prefix} prior at-risk history`} data={risk?.priorLossHistory} fields={evidence} onChange={patch => change({ atRisk: { ...risk, priorLossHistory: { ...risk?.priorLossHistory, ...patch } } })} />
      {risk?.priorLossHistory?.vintages === undefined && <p role="status">The preceding-year at-risk vintage list is unknown.</p>}
      {risk?.priorLossHistory?.vintages?.length === 0 && <p>Explicitly recorded: no prior at-risk vintages.</p>}
      {risk?.priorLossHistory?.vintages?.map((row, i) => <div key={i}><Fields prefix={`${prefix} prior at-risk vintage ${i + 1}`} data={row} fields={[[ 'taxYear', 'origin year', 'text' ], [ 'amount', 'filed remaining loss', 'money' ]]}
        onChange={patch => change({ atRisk: { ...risk, priorLossHistory: { ...risk.priorLossHistory, vintages: risk.priorLossHistory?.vintages?.map((value, n) => n === i ? { ...value, ...patch } : value) } } })} />
        <button type="button" className="utility-button" onClick={() => change({ atRisk: { ...risk, priorLossHistory: { ...risk.priorLossHistory, vintages: risk.priorLossHistory?.vintages?.filter((_, n) => n !== i) } } })}>Remove {prefix} prior at-risk vintage {i + 1}</button></div>)}
      <button type="button" className="utility-button" onClick={() => change({ atRisk: { ...risk, priorLossHistory: { ...risk?.priorLossHistory, vintages: [...(risk?.priorLossHistory?.vintages ?? []), {}] } } })}>Add {prefix} prior at-risk vintage</button>
      <button type="button" className="utility-button" onClick={() => change({ atRisk: { ...risk, priorLossHistory: { ...risk?.priorLossHistory, vintages: [] } } })}>Record no {prefix} prior at-risk vintages</button>
    </fieldset>
  </div></details>;
}
export function K1CharitableSourceDetails({ data, activities, onChange }: { data?: K1CharitableSourcesData; activities?: K1LossSourcesData['activities']; onChange: (next: K1CharitableSourcesData | undefined) => void }) {
  const change = (patch: Partial<K1CharitableSourcesData>) => onChange(updateK1CharitableSources(data ?? {}, patch));
  return <details className="guided-expand"><summary className="guided-expand-trigger">Charitable contributions reported on Schedule K-1</summary><div className="guided-expand-body">
    <p className="guided-hint">Use each original partnership or S-corporation K-1, attached gift receipts, basis history and Form 6198 sources. Keep these amounts separate from gifts you made directly and from charitable percentage-limit carryovers. Passive activities and ordinary losses also need the linked activity and independent histories in adjustments.</p>
    <p className="guided-hint">Current ordinary cash and appreciated-stock gifts are supported with complete sources and actual at-risk records. A binding limitation also requires the original activity assignment. Earlier charitable basis releases use their original histories. A cash distribution above basis needs the original attachment below, with investment-only assets or a complete single passive business report and linked histories. Other property, differing AMT treatment, prior at-risk releases, other business distributions and some 2026 prior-basis timing require separate methods; their entered facts stay saved.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add K-1 charitable sources</button> : <>
      <Fields prefix="K-1 charitable packet" data={data} fields={[...evidence, ['allK1CharitableSourcesIncluded', 'all original charitable K-1 attachments included', 'boolean']]} onChange={change} />
      {data.statements === undefined && <p role="status">The original charitable K-1 list is unknown.</p>}
      {data.statements?.length === 0 && <p>Explicitly recorded: no charitable K-1 sources.</p>}
      {data.statements?.map((row, index) => <div key={index}><CharitableStatement index={index} data={row} activities={activities} onChange={next => change({ statements: data.statements?.map((value, i) => i === index ? next : value) })} />
        <button type="button" className="utility-button" onClick={() => change({ statements: data.statements?.filter((_, i) => i !== index) })}>Remove charitable K-1 statement {index + 1}</button></div>)}
      <button type="button" className="utility-button" onClick={() => change({ statements: [...(data.statements ?? []), {}] })}>Add charitable K-1 statement</button>
      <button type="button" className="utility-button" onClick={() => change({ statements: [] })}>Record no charitable K-1 statements</button>
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove K-1 charitable sources</button>
    </>}
  </div></details>;
}
