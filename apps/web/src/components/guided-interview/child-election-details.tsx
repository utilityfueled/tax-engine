"use client";
import { childElectionAmounts, updateChildElection, type ChildElectionData } from '@/lib/guided-child-election-facts';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({ label, value, options, onChange }: { label: string; value?: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span>
    <select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}>
      <option value="">Choose from actual records</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select></label>;
}
const parentChoices = [
  ['joint_with_other_parent', 'Joint return with the other parent'], ['married_separate', 'Married parents filing separately'],
  ['custodial_unmarried', 'Unmarried custodial parent'], ['custodial_considered_unmarried', 'Custodial parent considered unmarried under section 7703'],
  ['custodial_joint_stepparent', 'Custodial parent and stepparent filing jointly'], ['custodial_separate_stepparent', 'Custodial parent and stepparent filing separately'],
  ['never_married_together_all_year', 'Never-married parents living together all year'], ['surviving_unmarried', 'Surviving parent who has not remarried'],
  ['surviving_joint_stepparent', 'Surviving parent and stepparent filing jointly'], ['surviving_separate_stepparent', 'Surviving parent and stepparent filing separately'],
] as const;
function ChildCard({ entry, index, onChange, onRemove }: { entry: ChildElectionData; index: number; onChange: (patch: Partial<ChildElectionData>) => void; onRemove: () => void }) {
  const statements = entry.amtStatements ?? [];
  const comparison = ['married_separate', 'custodial_separate_stepparent', 'surviving_separate_stepparent', 'never_married_together_all_year'].includes(entry.parentSituation ?? '')
    || [entry.comparisonTaxYear, entry.returnTaxableIncomeWithoutChild, entry.otherParentTaxableIncomeWithoutChild, entry.returnSourceReference, entry.otherParentSourceReference].some(value => value?.trim());
  return <div className="guided-w2-card">
    <div className="guided-w2-card-header"><strong className="guided-w2-card-title">Child election {index + 1}{entry.firstName ? ` — ${entry.firstName}` : ''}</strong>
      <button type="button" className="utility-button utility-button-small" onClick={onRemove}>Remove child election {index + 1}</button></div>
    <p className="guided-hint">Use the child’s own records. Report only income belonging to this child here. A blank remains unknown; enter zero only after checking the source.</p>
    <div className="guided-form-grid">
      {([['taxYear', 'Child source tax year'], ['sourceReference', 'Child election worksheet reference'], ['firstName', 'Child first name'], ['lastName', 'Child last name'], ['ssn', 'Child SSN']] as const).map(([key, label]) =>
        <TextFact key={key} label={label} value={entry[key] ?? ''} onChange={value => onChange({ [key]: value })} />)}
      <TextFact label="Child birth date" type="date" value={entry.dateOfBirth ?? ''} onChange={dateOfBirth => onChange({ dateOfBirth })} />
      {childElectionAmounts.map(([key, label]) => <CurrencyField key={key} label={label} value={entry[key] ?? ''} onChange={value => onChange({ [key]: value })} />)}
      <BooleanFact label="Did the child receive Alaska Permanent Fund dividends?" value={entry.alaskaDividendPresent} onChange={alaskaDividendPresent => onChange({ alaskaDividendPresent })} />
      <BooleanFact label="Do capital distributions include collectibles, section 1250 or section 1202 gain?" value={entry.specialCapitalDistributionPresent} onChange={specialCapitalDistributionPresent => onChange({ specialCapitalDistributionPresent })} />
      <BooleanFact label="Does the child have a foreign account or foreign trust reporting obligation?" value={entry.foreignAccountOrTrustPresent} onChange={foreignAccountOrTrustPresent => onChange({ foreignAccountOrTrustPresent })} />
    </div>
    {(entry.alaskaDividendPresent || entry.specialCapitalDistributionPresent || entry.foreignAccountOrTrustPresent) && <p className="guided-hint" role="status">This source needs its separate worksheet before this interview can calculate it. Keep the actual records saved for review.</p>}
    <fieldset><legend>Election and return facts</legend><div className="guided-form-grid">
      <BooleanFact label="Do you elect to report this child’s income on this return?" value={entry.electionRequested} onChange={electionRequested => onChange({ electionRequested })} />
      <Choice label="Actual election filing status" value={entry.timelyElectionStatus} options={[
        ['planned_timely', 'Planned with a timely return, including any extension'], ['filed_timely', 'Already filed with a timely return'], ['late', 'Late or no timely filing plan'],
      ]} onChange={timelyElectionStatus => onChange({ timelyElectionStatus })} />
      <BooleanFact label="Would the child be required to file a return without this election?" value={entry.childRequiredToFile} onChange={childRequiredToFile => onChange({ childRequiredToFile })} />
      <BooleanFact label="Does the child file a joint return for this year?" value={entry.childFilesJointReturn} onChange={childFilesJointReturn => onChange({ childFilesJointReturn })} />
    </div></fieldset>
    <details className="guided-expand"><summary className="guided-expand-trigger">Student enrollment facts</summary><div className="guided-expand-body">
      <p className="guided-hint">For a child age 19 through 23 at year end, enter the actual program and each calendar month with full-time attendance. January 1 birthdays follow the IRS prior-day age rule.</p>
      <Choice label="Actual student program" value={entry.studentProgram} options={[
        ['school', 'School, college, technical or trade school'], ['school_on_farm', 'Full-time on-farm course given by a school'], ['government_on_farm', 'Full-time on-farm course given by a government agency'],
        ['online_only', 'School offering only online courses'], ['correspondence', 'Correspondence school'], ['on_the_job', 'On-the-job training'],
      ]} onChange={studentProgram => onChange({ studentProgram })} />
      <TextFact label="Full-time student months, separated by commas" value={entry.studentMonths ?? ''} onChange={studentMonths => onChange({ studentMonths })} />
      <TextFact label="Student enrollment source reference" value={entry.studentSourceReference ?? ''} onChange={studentSourceReference => onChange({ studentSourceReference })} />
    </div></details>
    <fieldset><legend>Eligible parent</legend><div className="guided-form-grid">
      <Choice label="Parent making this election" value={entry.electingTaxpayer} options={[["primary", "Primary taxpayer"], ["spouse", "Spouse on this joint return"]]} onChange={electingTaxpayer => onChange({ electingTaxpayer })} />
      <Choice label="Relationship to this child" value={entry.relationshipToChild} options={[["parent", "Parent"], ["stepparent", "Stepparent"]]} onChange={relationshipToChild => onChange({ relationshipToChild })} />
      <Choice label="Actual parent filing situation" value={entry.parentSituation} options={parentChoices} onChange={parentSituation => onChange({ parentSituation })} />
      {(entry.parentSituation?.startsWith('custodial') || entry.custodialParentConfirmed != null) && <BooleanFact label="Has the actual custodial parent been established?" value={entry.custodialParentConfirmed} onChange={custodialParentConfirmed => onChange({ custodialParentConfirmed })} />}
      {(entry.parentSituation === 'custodial_considered_unmarried' || entry.consideredUnmarriedUnder7703Confirmed != null) && <BooleanFact label="Are the section 7703 considered-unmarried conditions met?" value={entry.consideredUnmarriedUnder7703Confirmed} onChange={consideredUnmarriedUnder7703Confirmed => onChange({ consideredUnmarriedUnder7703Confirmed })} />}
    </div>
      {comparison && <fieldset><legend>Completed parent income comparison</legend><p className="guided-hint">Use each parent’s taxable income before any child elections. This return’s figure must agree with its calculated income.</p><div className="guided-form-grid">
        <TextFact label="Parent comparison tax year" value={entry.comparisonTaxYear ?? ''} onChange={comparisonTaxYear => onChange({ comparisonTaxYear })} />
        {([['returnTaxableIncomeWithoutChild', 'This parent taxable income without child elections'], ['otherParentTaxableIncomeWithoutChild', 'Other parent taxable income without child elections']] as const).map(([key, label]) => <CurrencyField key={key} label={label} value={entry[key] ?? ''} onChange={value => onChange({ [key]: value })} />)}
        {([['returnSourceReference', 'This parent comparison worksheet'], ['otherParentSourceReference', 'Other parent comparison worksheet']] as const).map(([key, label]) => <TextFact key={key} label={label} value={entry[key] ?? ''} onChange={value => onChange({ [key]: value })} />)}
        <BooleanFact label="Do both parent worksheets exclude all child election income?" value={entry.excludesElectedChildIncomeConfirmed} onChange={excludesElectedChildIncomeConfirmed => onChange({ excludesElectedChildIncomeConfirmed })} />
      </div></fieldset>}
    </fieldset>
    <details className="guided-expand"><summary className="guided-expand-trigger">Child tax-exempt interest and AMT sources</summary><div className="guided-expand-body">
      <p className="guided-hint">For positive child tax-exempt interest, include every actual statement and its specified private-activity amount. The statement totals must equal the child’s exempt interest.</p>
      {statements.map((row, rowIndex) => <div className="guided-w2-card" key={rowIndex}><div className="guided-form-grid">
        <TextFact label={`Child statement ${rowIndex + 1} reference`} value={row.sourceId ?? ''} onChange={sourceId => onChange({ amtStatements: statements.map((source, i) => i === rowIndex ? { ...source, sourceId } : source) })} />
        <Choice label={`Child statement ${rowIndex + 1} form`} value={row.form} options={[["1099-INT", "1099-INT"], ["1099-DIV", "1099-DIV"]]} onChange={form => onChange({ amtStatements: statements.map((source, i) => i === rowIndex ? { ...source, form } : source) })} />
        {([['taxExemptInterest', 'exempt interest'], ['specifiedPrivateActivityBondInterest', 'specified preference']] as const).map(([key, label]) => <CurrencyField key={key} label={`Child statement ${rowIndex + 1} ${label}`} value={row[key] ?? ''} onChange={value => onChange({ amtStatements: statements.map((source, i) => i === rowIndex ? { ...source, [key]: value } : source) })} />)}
      </div><button type="button" className="utility-button utility-button-small" onClick={() => onChange({ amtStatements: statements.filter((_, i) => i !== rowIndex) })}>Remove child statement {rowIndex + 1}</button></div>)}
      <button type="button" className="utility-button" onClick={() => onChange({ amtStatements: [...statements, {}] })}>Add child statement</button>
      <CurrencyField label="Child otherwise allowable preference deduction" value={entry.otherwiseAllowableDeduction ?? ''} onChange={otherwiseAllowableDeduction => onChange({ otherwiseAllowableDeduction })} />
      <TextFact label="Child deduction allowance worksheet reference" value={entry.deductionSourceReference ?? ''} onChange={deductionSourceReference => onChange({ deductionSourceReference })} />
      <BooleanFact label="Is the child deduction allowable and not already used?" value={entry.deductionAllowanceAndNoDuplicationConfirmed} onChange={deductionAllowanceAndNoDuplicationConfirmed => onChange({ deductionAllowanceAndNoDuplicationConfirmed })} />
      <BooleanFact label="Have you checked every child AMT statement?" value={entry.amtFactsConfirmed} onChange={amtFactsConfirmed => onChange({ amtFactsConfirmed })} />
    </div></details>
    <BooleanFact label="Have you reviewed all child election sources?" value={entry.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ sourceFactsConfirmed })} />
  </div>;
}
export function ChildElectionCards({ entries = [], onChange }: { entries?: ChildElectionData[]; onChange: (entries: ChildElectionData[]) => void }) {
  return <details className="guided-expand"><summary className="guided-expand-trigger">Report a child’s interest and dividends (Form 8814)</summary><div className="guided-expand-body">
    <p className="guided-hint">This election can change the tax compared with a separate child return. Enter an election only when you choose it and the actual eligibility conditions apply.</p>
    <div className="guided-w2-stack">{entries.map((entry, index) => <ChildCard key={index} entry={entry} index={index}
      onChange={patch => onChange(entries.map((row, i) => i === index ? updateChildElection(row, patch) : row))}
      onRemove={() => onChange(entries.filter((_, i) => i !== index))} />)}</div>
    <button type="button" className="utility-button" onClick={() => onChange([...entries, {}])}>Add child election</button>
  </div></details>;
}
