"use client";
import type { NolFilingUnitHistoryData, NolFilingUnitOriginData, NolFilingUnitUseData, NolSameCoupleJointHistoryData, NolNewMarriageCurrentSourcesData } from '@/lib/guided-nol-filing-unit';
import { CharitableFilingUnitDetails } from './charitable-filing-unit-details';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

const nestedSourceStyle = { border: 0, margin: 0, padding: 0, minWidth: 0 };
function SourceChoice({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (value: string | undefined) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value || undefined)}>
    <option value="">Choose from actual records</option>
    {value && !options.some(([id]) => id === value) && <option value={value}>Saved source: {value}</option>}
    {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
  </select></label>;
}
function people(data?: NolFilingUnitHistoryData): [string, string][] { return (data?.persons ?? []).flatMap((row, i) => row.sourceId ? [[row.sourceId, `Person ${i + 1}: ${row.name || row.sourceId}`]] : []); }
function returns(data?: NolFilingUnitHistoryData): [string, string][] { return (data?.returns ?? []).flatMap((row, i) => row.sourceId ? [[row.sourceId, `Return ${i + 1}: ${row.taxYear || 'year unknown'} (${row.sourceId})`]] : []); }

export function NolFilingUnitDetails({ label, data, onChange }: { label: string; data?: NolFilingUnitHistoryData; onChange: (data: NolFilingUnitHistoryData | undefined) => void }) {
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>{label} original ownership timeline</legend>
    <p className="guided-hint">Use the original filed returns and each owner&apos;s historical loss worksheets. Keep regular and AMT histories separate, including an explicitly empty carry list. A current joint return also needs the actual same-couple marital years below. Historical joint returns need both owners&apos; actual computations.</p>
    <CharitableFilingUnitDetails data={data} onChange={onChange} />
  </fieldset>;
}

export function NolSameCoupleJointDetails({ label, timeline, data, onChange, newMarriage = false }: { label: string; timeline?: NolFilingUnitHistoryData; data?: NolSameCoupleJointHistoryData; newMarriage?: boolean; onChange: (data: NolSameCoupleJointHistoryData | undefined) => void }) {
  if (!data) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add {newMarriage ? 'new-marriage' : 'same-couple'} marital history for {label}</button>;
  const change = (patch: Partial<NolSameCoupleJointHistoryData>) => onChange({ ...data, ...patch });
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>{label} current joint marital history</legend>
    <p className="guided-hint">{newMarriage ? 'Identify the current spouses in every relevant year. Record that they were not married to each other before this marriage, then record the actual marriage years. Individual losses keep their original owner. Reunion and prior joint losses need separate allocation records.' : 'For a current joint return, identify the same two spouses in every relevant original and intervening year. Separate-return status alone does not identify the spouse. Copy actual marital records; do not enter this year’s deduction or divide the joint closing carry.'}</p>
    <TextFact label={`${label} marital history source reference`} value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
    <BooleanFact label={`${label} all relevant marital years included`} value={data.allRelevantYearsIncluded} onChange={allRelevantYearsIncluded => change({ allRelevantYearsIncluded })} />
    {data.years === undefined && <p role="status">The actual marital years are unknown.</p>}
    {(data.years ?? []).map((row, index) => {
      const prefix = `${label} marital year ${index + 1}`;
      const edit = (patch: Partial<typeof row>) => change({ years: data.years!.map((item, i) => i === index ? { ...item, ...patch } : item) });
      return <fieldset className="panel-stack" style={nestedSourceStyle} key={index}><legend>{prefix}</legend><div className="guided-form-grid">
        <TextFact label={`${prefix} tax year`} value={row.taxYear ?? ''} onChange={taxYear => edit({ taxYear })} />
        <SourceChoice label={`${prefix} first spouse`} value={row.firstPersonId} options={people(timeline)} onChange={firstPersonId => edit({ firstPersonId })} />
        <SourceChoice label={`${prefix} second spouse`} value={row.secondPersonId} options={people(timeline)} onChange={secondPersonId => edit({ secondPersonId })} />
        <BooleanFact label={`${prefix} married to each other`} value={row.marriedToEachOther} onChange={marriedToEachOther => edit({ marriedToEachOther })} />
        <TextFact label={`${prefix} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
      </div><button type="button" className="utility-button" onClick={() => change({ years: data.years!.filter((_, i) => i !== index) })}>Remove {prefix}</button></fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => change({ years: [...(data.years ?? []), {}] })}>Add marital year for {label}</button>
    <button type="button" className="utility-button" onClick={() => change({ years: undefined })}>Mark marital years unknown for {label}</button>
    <BooleanFact label={`${label} marital sources checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove {newMarriage ? 'new-marriage' : 'same-couple'} marital history for {label}</button>
  </fieldset>;
}

export function NolFilingUnitOrigin({ prefix, timeline, data, onChange }: { prefix: string; timeline?: NolFilingUnitHistoryData; data?: NolFilingUnitOriginData; onChange: (data: NolFilingUnitOriginData | undefined) => void }) {
  const change = (patch: Partial<NolFilingUnitOriginData>) => onChange({ ...data, ...patch });
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>{prefix} original ownership</legend>
    <p className="guided-hint">Copy the original return&apos;s full NOL and each owner&apos;s separately computed NOL. The original filed loss above is the present owner&apos;s portion. These facts establish ownership; they do not enter this year&apos;s deduction.</p>
    <div className="guided-form-grid">
      <SourceChoice label={`${prefix} original carry owner`} value={data?.ownerPersonId} options={people(timeline)} onChange={ownerPersonId => change({ ownerPersonId })} />
      <SourceChoice label={`${prefix} original filed return`} value={data?.returnSourceId} options={returns(timeline)} onChange={returnSourceId => change({ returnSourceId })} />
      <CurrencyField label={`${prefix} original joint or separate return NOL`} value={data?.originalReturnLoss ?? ''} onChange={originalReturnLoss => change({ originalReturnLoss })} />
    </div>
    {data?.separateComputations === undefined && <p role="status">The original owners&apos; separate computations are unknown.</p>}
    {(data?.separateComputations ?? []).map((row, index) => {
      const label = `${prefix} original owner ${index + 1}`;
      const edit = (patch: Partial<typeof row>) => change({ separateComputations: data!.separateComputations!.map((item, i) => i === index ? { ...item, ...patch } : item) });
      return <fieldset className="panel-stack" style={nestedSourceStyle} key={index}><legend>{label}</legend><div className="guided-form-grid">
        <SourceChoice label={`${label} person`} value={row.personId} options={people(timeline)} onChange={personId => edit({ personId })} />
        <CurrencyField label={`${label} separate NOL`} value={row.netOperatingLoss ?? ''} onChange={netOperatingLoss => edit({ netOperatingLoss })} />
        <TextFact label={`${label} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
      </div><button type="button" className="utility-button" onClick={() => change({ separateComputations: data!.separateComputations!.filter((_, i) => i !== index) })}>Remove {label}</button></fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => change({ separateComputations: [...(data?.separateComputations ?? []), {}] })}>Add original owner computation for {prefix}</button>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove original ownership for {prefix}</button>
  </fieldset>;
}

const historicalAmounts = [['claimedDeduction', 'claimed deduction'], ['modifiedAbsorption', 'modified absorption'], ['attributeReduction', 'attribute reduction']] as const;
export function NolFilingUnitUses({ prefix, timeline, data, onChange }: { prefix: string; timeline?: NolFilingUnitHistoryData; data?: NolFilingUnitUseData[]; onChange: (data: NolFilingUnitUseData[] | undefined) => void }) {
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>{prefix} actual filed uses</legend>
    <p className="guided-hint">Copy each filed return&apos;s use of this original loss and its amounts for every original owner. Modified absorption can differ from the deduction claimed. Record attribute reductions separately. Enter established zero explicitly; leave unknown facts blank.</p>
    {data === undefined && <p role="status">The actual filed-owner history is unknown.</p>}
    {(data ?? []).map((row, index) => {
      const label = `${prefix} filed use ${index + 1}`;
      const edit = (patch: Partial<NolFilingUnitUseData>) => onChange(data!.map((item, i) => i === index ? { ...item, ...patch } : item));
      return <fieldset className="panel-stack" style={nestedSourceStyle} key={index}><legend>{label}</legend><div className="guided-form-grid">
        <SourceChoice label={`${label} original return`} value={row.returnSourceId} options={returns(timeline)} onChange={returnSourceId => edit({ returnSourceId })} />
        <TextFact label={`${label} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
        {historicalAmounts.map(([key, text]) => <CurrencyField key={key} label={`${label} return ${text}`} value={row[key] ?? ''} onChange={value => edit({ [key]: value })} />)}
        <BooleanFact label={`${label} all original owners included`} value={row.allOriginOwnersIncluded} onChange={allOriginOwnersIncluded => edit({ allOriginOwnersIncluded })} />
        <BooleanFact label={`${label} all other NOL sources included in the filed computation`} value={row.allOtherNolSourcesIncluded} onChange={allOtherNolSourcesIncluded => edit({ allOtherNolSourcesIncluded })} />
      </div>
      {row.owners === undefined && <p role="status">The historical owner amounts are unknown.</p>}
      {(row.owners ?? []).map((owner, ownerIndex) => {
        const ownerLabel = `${label} owner ${ownerIndex + 1}`;
        const change = (patch: Partial<typeof owner>) => edit({ owners: row.owners!.map((item, i) => i === ownerIndex ? { ...item, ...patch } : item) });
        return <fieldset className="panel-stack" style={nestedSourceStyle} key={ownerIndex}><legend>{ownerLabel}</legend><div className="guided-form-grid">
          <SourceChoice label={`${ownerLabel} person`} value={owner.personId} options={people(timeline)} onChange={personId => change({ personId })} />
          {historicalAmounts.map(([key, text]) => <CurrencyField key={key} label={`${ownerLabel} ${text}`} value={owner[key] ?? ''} onChange={value => change({ [key]: value })} />)}
        </div><button type="button" className="utility-button" onClick={() => edit({ owners: row.owners!.filter((_, i) => i !== ownerIndex) })}>Remove {ownerLabel}</button></fieldset>;
      })}
      <button type="button" className="utility-button" onClick={() => edit({ owners: [...(row.owners ?? []), {}] })}>Add owner amounts for {label}</button>
      <BooleanFact label={`${label} sources checked after the last edit`} value={row.sourceFactsConfirmed} onChange={sourceFactsConfirmed => edit({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(data!.filter((_, i) => i !== index))}>Remove {label}</button></fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => onChange([...(data ?? []), {}])}>Add actual filed use for {prefix}</button>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Mark filed-owner history unknown for {prefix}</button>
  </fieldset>;
}

const expenseFields = {
  scheduleA: [['medicalExpenses', 'Medical expenses'], ['realEstateTaxes', 'Real estate taxes'], ['additionalStateLocalIncomeTaxes', 'Additional state and local income taxes'], ['nonW2IncomeTaxesDeductedElsewhere', 'Nonwage taxes deducted elsewhere'], ['personalPropertyTaxes', 'Personal property taxes'], ['excludedPuertoRicoIncome', 'Excluded Puerto Rico income'], ['form4563ExcludedIncome', 'Form4563 excluded income'], ['investmentInterestExpense', 'Investment interest expense'], ['gamblingWinnings', 'Gambling winnings'], ['gamblingLosses', 'Gambling losses'], ['gamblingExpenses', 'Gambling expenses']],
  adjustments: [['otherTaxesPaid', 'Other taxes paid'], ['educatorExpenses', 'Educator expenses'], ['primaryEducatorExpenses', 'Primary educator expenses'], ['spouseEducatorExpenses', 'Spouse educator expenses'], ['businessExpenseAdjustments', 'Business expense adjustments'], ['hsaDeduction', 'HSA contributions'], ['armedForcesMovingExpenses', 'Military moving expenses'], ['archerMSADeduction', 'Archer MSA contributions'], ['selfEmployedHealthInsurance', 'Self-employed health premiums'], ['studentLoanInterest', 'Student loan interest'], ['iraDeduction', 'IRA contributions'], ['otherAdjustmentsTotal', 'Other adjustments'], ['alimonyPaid', 'Alimony paid'], ['earlyWithdrawalPenalty', 'Early withdrawal penalty'], ['seRetirementContributions', 'Self-employed retirement contributions']],
  priorYear: [['shortTermCapitalLoss', 'Prior short-term capital loss'], ['longTermCapitalLoss', 'Prior long-term capital loss'], ['capitalLossCarryforward', 'Prior aggregate capital loss']],
} satisfies Record<string, [string, string][]>;
const ownerSourceFields: [string, string][] = [['w2s', 'W-2'], ['form1099Int', '1099-INT'], ['form1099Div', '1099-DIV'], ['form1099B', '1099-B'], ['form1099DA', '1099-DA'], ['form1099Nec', '1099-NEC'], ['form1099Misc', '1099-MISC'], ['form1099G', '1099-G'], ['form1099OID', '1099-OID'], ['formW2G', 'W-2G'], ['form1099K', '1099-K'], ['form1099R', '1099-R'], ['form1099SA', '1099-SA'], ['formSSA1099', 'SSA-1099'], ['formRRB1099', 'RRB-1099'], ['scheduleK1', 'Business K-1'], ['scheduleK1Form1041', 'Estate K-1'], ['form1098', '1098 mortgage'], ['form1098E', '1098-E student loan'], ['donations', 'Donation'], ['rentalProperties', 'Rental property'], ['form6252', 'Installment sale'], ['homeSales', 'Home sale'], ['form8824', 'Like-kind exchange'], ['scheduleC', 'Schedule C business'], ['scheduleF', 'Schedule F farm'], ['form4562', 'Depreciation'], ['form4797', 'Business property sale'], ['form4137', 'Unreported tips'], ['form8919', 'Uncollected wage taxes'], ['form5329', 'Retirement additional-tax facts'], ['form8606', 'IRA basis'], ['form8889', 'HSA facts'], ['form3903', 'Moving expenses'], ['seHealthInsuranceWorksheet', 'Health insurance worksheet'], ['form7206', 'Self-employed health insurance'], ['form4684', 'Casualty loss'], ['form4952', 'Investment interest'], ['form4952Amt', 'AMT investment interest'], ['amtCapitalGains', 'AMT capital gains'], ['studentLoanInterestFacts', 'Student loan facts'], ['socialSecurityFacts', 'Social Security facts'], ['taxableRefundWorksheet', 'Taxable refund'], ['salesTaxDeduction', 'Sales tax payments'], ['form6781', 'Section1256 contracts'], ['form8915F', 'Disaster distribution'], ['form461', 'Excess business loss facts']];
export function NolNewMarriageCurrentDetails({ data, onChange }: { data?: NolNewMarriageCurrentSourcesData; onChange: (data: NolNewMarriageCurrentSourcesData | undefined) => void }) {
  if (!data) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add actual current owner income and expense sources</button>;
  const change = (patch: Partial<NolNewMarriageCurrentSourcesData>) => onChange({ ...data, ...patch });
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>New-marriage current owner sources</legend>
    <p className="guided-hint">Use each income document&apos;s actual owner. For expenses entered as a joint total, record the actual amount belonging to each spouse and its source. The calculator recomputes separate income limits. Do not enter a taxable income, loss deduction or closing carry.</p>
    <TextFact label="Current owner records source reference" value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
    <BooleanFact label="All current owner income and deductions included" value={data.allIncomeAndDeductionsIncluded} onChange={allIncomeAndDeductionsIncluded => change({ allIncomeAndDeductionsIncluded })} />
    <BooleanFact label="Community property applies to these current sources" value={data.communityPropertyApplies} onChange={communityPropertyApplies => change({ communityPropertyApplies })} />
    <BooleanFact label="Spouses lived together during any part of this year" value={data.livedWithSpouseAtAnyTimeDuringYear} onChange={livedWithSpouseAtAnyTimeDuringYear => change({ livedWithSpouseAtAnyTimeDuringYear })} />
    {(['primary', 'spouse'] as const).map(owner => <SourceChoice key={owner} label={`${owner === 'primary' ? 'Primary' : 'Spouse'} separate-return deduction election for the owner worksheet`} value={owner === 'primary' ? data.primaryDeductionElection : data.spouseDeductionElection} options={[['standard', 'Standard deduction'], ['itemized', 'Itemized deductions']]} onChange={value => change(owner === 'primary' ? { primaryDeductionElection: value as 'standard' | 'itemized' | undefined } : { spouseDeductionElection: value as 'standard' | 'itemized' | undefined })} />)}
    {data.expenseAllocations === undefined && <p role="status">The actual raw expense allocations are unknown.</p>}
    {(data.expenseAllocations ?? []).map((row, index) => {
      const prefix = `Current owner expense ${index + 1}`;
      const edit = (patch: Partial<typeof row>) => change({ expenseAllocations: data.expenseAllocations!.map((item, i) => i === index ? { ...item, ...patch } : item) });
      return <fieldset key={index} className="panel-stack" style={nestedSourceStyle}><legend>{prefix}</legend>
        <SourceChoice label={`${prefix} source group`} value={row.kind} options={[['scheduleA', 'Itemized expense'], ['adjustments', 'Income adjustment'], ['priorYear', 'Prior capital loss']]} onChange={kind => edit({ kind: kind as typeof row.kind, field: undefined })} />
        <SourceChoice label={`${prefix} actual source amount`} value={row.field} options={row.kind ? expenseFields[row.kind] : []} onChange={field => edit({ field })} />
        <CurrencyField label={`${prefix} primary raw amount`} value={row.primaryAmount ?? ''} onChange={primaryAmount => edit({ primaryAmount })} />
        <CurrencyField label={`${prefix} spouse raw amount`} value={row.spouseAmount ?? ''} onChange={spouseAmount => edit({ spouseAmount })} />
        <TextFact label={`${prefix} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
        <button type="button" className="utility-button" onClick={() => change({ expenseAllocations: data.expenseAllocations!.filter((_, i) => i !== index) })}>Remove {prefix}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => change({ expenseAllocations: [...(data.expenseAllocations ?? []), {}] })}>Add actual owner expense split</button>
    <button type="button" className="utility-button" onClick={() => change({ expenseAllocations: [] })}>Record no joint raw expenses to allocate</button>
    <p className="guided-hint">For a source without an owner field, identify its actual owner below. A document number is its position in the source list, starting with1. Whole business or worksheet sources do not need a document number.</p>
    {(data.sourceOwners ?? []).map((row, index) => {
      const prefix = `Current owner document ${index + 1}`;
      const edit = (patch: Partial<typeof row>) => change({ sourceOwners: data.sourceOwners!.map((item, i) => i === index ? { ...item, ...patch } : item) });
      return <fieldset key={index} className="panel-stack" style={nestedSourceStyle}><legend>{prefix}</legend>
        <SourceChoice label={`${prefix} source`} value={row.field} options={ownerSourceFields} onChange={field => edit({ field })} />
        <TextFact label={`${prefix} document number when a list`} value={row.index === undefined || row.index === '' ? '' : String(Number(row.index) + 1)} onChange={value => edit({ index: /^\d+$/.test(value) && Number(value) > 0 ? String(Number(value) - 1) : value ? 'invalid' : undefined })} />
        <SourceChoice label={`${prefix} actual owner`} value={row.owner} options={[['primary', 'Primary taxpayer'], ['spouse', 'Spouse']]} onChange={owner => edit({ owner: owner as typeof row.owner })} />
        <TextFact label={`${prefix} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
        <button type="button" className="utility-button" onClick={() => change({ sourceOwners: data.sourceOwners!.filter((_, i) => i !== index) })}>Remove {prefix}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => change({ sourceOwners: [...(data.sourceOwners ?? []), {}] })}>Add actual source owner assignment</button>
    <BooleanFact label="Current owner sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove current owner sources</button>
  </fieldset>;
}
