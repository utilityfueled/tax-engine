"use client";

import type { CareProviderData, FilingStatus } from "@/lib/guided-interview-flow";
import { careBenefitsFactErrors, type CareBenefitsData, type CareBenefitSource } from "@/lib/guided-dependent-care-benefits";
import { CurrencyField } from "./currency-field";
import { CareProviderSourceDetails } from "./care-source-details";

function Fact({ label, value, onChange }: { label: string; value?: boolean | null; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={event => onChange(event.target.value === "" ? null : event.target.value === "true")}>
    <option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option>
  </select></label>;
}
function Source({ label, value, sources, onChange }: { label: string; value?: string; sources: CareBenefitSource[]; onChange: (source?: CareBenefitSource) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ""} onChange={event => onChange(sources.find(source => source.sourceId === event.target.value))}>
    <option value="">Choose the actual source</option>{value && !sources.some(source => source.sourceId === value) && <option value={value}>Source no longer available: {value}</option>}{sources.map(source => <option value={source.sourceId} key={source.sourceId}>{source.label}</option>)}
  </select></label>;
}
function Owner({ value, label, onChange }: { label: string; value?: string; onChange: (value: "primary" | "spouse" | "") => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ""} onChange={event => onChange(event.target.value as "primary" | "spouse" | "")}>
    <option value="">Choose the actual recipient</option><option value="primary">You</option><option value="spouse">Your spouse</option>
  </select></label>;
}
const employeeFields = [["benefitsReported", "Reported W-2 Box 10 benefits"], ["alreadyIncludedInWages", "Benefits already included in W-2 Box 1 wages"], ["priorYearCarryoverUsed", "Prior-year grace-period benefits actually used this year"], ["forfeited", "Current-year benefits actually forfeited"], ["carriedForward", "Current-year benefits actually carried into the next grace period"]] as const;
const businessFields = [["benefitsReceived", "Current-year self-employed plan benefits"], ["priorYearCarryoverUsed", "Prior-year business plan benefits actually used this year"], ["alreadyDeducted", "Care benefits already deducted in this activity's expenses"]] as const;

export function CareBenefitsDetails({ data, taxYear, filingStatus, sources = [], careProviders, onChange }: {
  data?: CareBenefitsData; taxYear?: number | null; filingStatus?: FilingStatus | null; sources?: CareBenefitSource[]; careProviders?: CareProviderData[];
  onChange: (data: CareBenefitsData | undefined) => void;
}) {
  if (!data) return <div className="guided-w2-card"><h3>Dependent-care benefits (Form 2441 Part III)</h3><p className="guided-hint">Complete this if an employer or self-employed plan provided care benefits, including benefits that become taxable. Your W-2 Box 10 entries must reconcile here even when you cannot claim a care credit.</p><button className="guided-button" type="button" onClick={() => onChange({})}>Add dependent-care benefits</button></div>;
  const employees = data.employeeBenefits ?? [];
  const businesses = data.selfEmployedBenefits ?? [];
  const allocations = data.deductionAllocations ?? [];
  const change = (patch: Partial<CareBenefitsData>) => onChange({ ...data, ...patch, sourceFactsConfirmed: null, earnedIncomeWorksheetConfirmed: null, creditExpenseCoordinationConfirmed: null });
  const errors = careBenefitsFactErrors(data, taxYear, filingStatus, sources);
  const employeeSources = sources.filter(source => source.kind === "employee");
  const businessSources = sources.filter(source => source.kind === "business" && source.schedule === "schedule-c");
  return <fieldset className="guided-w2-card">
    <legend>Dependent-care benefits (Form 2441 Part III)</legend>
    <p className="guided-hint">Use the actual plan, care records and completed earned-income worksheets. Blank answers stay unknown. Enter zero only when your records establish zero. Source amounts retain cents; form lines use whole dollars.</p>
    <h4>Employee benefit statements</h4>
    {employees.map((entry, index) => <fieldset key={index}><legend>Employee benefit source {index + 1}</legend>
      <Source label={`Employee benefit source ${index + 1}`} value={entry.sourceId} sources={employeeSources} onChange={source => change({ employeeBenefits: employees.map((item, i) => i === index ? { ...item, sourceId: source?.sourceId, owner: source?.owner } : item) })} />
      <Owner label={`Employee benefit recipient ${index + 1}`} value={entry.owner} onChange={owner => change({ employeeBenefits: employees.map((item, i) => i === index ? { ...item, owner } : item) })} />
      {employeeFields.map(([field, label]) => <CurrencyField key={field} label={`${label} — source ${index + 1}`} value={entry[field] ?? ""} onChange={value => change({ employeeBenefits: employees.map((item, i) => i === index ? { ...item, [field]: value } : item) })} />)}
      <button type="button" className="guided-button" onClick={() => change({ employeeBenefits: employees.filter((_, i) => i !== index) })}>Remove employee benefit source {index + 1}</button>
    </fieldset>)}
    <button type="button" className="guided-button" onClick={() => change({ employeeBenefits: [...employees, {}] })}>Add employee benefit source</button>
    {!employees.length && <button type="button" className="guided-button" onClick={() => change({ employeeBenefits: [] })}>Confirm no employee benefits</button>}
    <h4>Business plan benefits</h4>
    <p className="guided-hint">Select the actual Schedule C activity entered in the business section. Enter its reported employee-benefit program expense there first. Other business schedules need their source-specific worksheets before this guided branch can calculate.</p>
    {businesses.map((entry, index) => <fieldset key={index}><legend>Business benefit source {index + 1}</legend>
      <Source label={`Business benefit source ${index + 1}`} value={entry.sourceId} sources={businessSources} onChange={source => change({ selfEmployedBenefits: businesses.map((item, i) => i === index ? { ...item, sourceId: source?.sourceId, owner: source?.owner, schedule: source?.schedule } : item) })} />
      <Owner label={`Business benefit recipient ${index + 1}`} value={entry.owner} onChange={owner => change({ selfEmployedBenefits: businesses.map((item, i) => i === index ? { ...item, owner } : item) })} />
      {businessFields.map(([field, label]) => <CurrencyField key={field} label={`${label} — activity ${index + 1}`} value={entry[field] ?? ""} onChange={value => change({ selfEmployedBenefits: businesses.map((item, i) => i === index ? { ...item, [field]: value } : item) })} />)}
      <button type="button" className="guided-button" onClick={() => change({ selfEmployedBenefits: businesses.filter((_, i) => i !== index) })}>Remove business benefit source {index + 1}</button>
    </fieldset>)}
    <button type="button" className="guided-button" onClick={() => change({ selfEmployedBenefits: [...businesses, {}] })}>Add business benefit source</button>
    {!businesses.length && <button type="button" className="guided-button" onClick={() => change({ selfEmployedBenefits: [] })}>Confirm no business plan benefits</button>}
    <h4>Actual plan and care expenses</h4>
    <Fact label="Do the dependent-care benefit exclusion eligibility requirements apply?" value={data.exclusionEligibilityConfirmed} onChange={exclusionEligibilityConfirmed => change({ exclusionEligibilityConfirmed })} />
    <CurrencyField label="Actual plan exclusion limit" value={data.planExclusionLimit ?? ""} hint="Use the employer or self-employed plan limit. The statutory annual cap is applied separately." onChange={planExclusionLimit => change({ planExclusionLimit })} />
    <CurrencyField label="Qualified care expenses incurred during the tax year" value={data.qualifiedExpensesIncurred ?? ""} hint="Part III line 16 uses expenses incurred during this year, even if paid in a different year." onChange={qualifiedExpensesIncurred => change({ qualifiedExpensesIncurred })} />
    <CurrencyField label="Your actual Part III earned income" value={data.primaryEarnedIncome ?? ""} allowNegative hint="Use the completed line 18 worksheet, including actual self-employment adjustments, exclusions and any substantiated deemed income. Exclude the benefits on line 12." onChange={primaryEarnedIncome => change({ primaryEarnedIncome })} />
    {(filingStatus === "mfj" || filingStatus === "mfs") && <CurrencyField label="Spouse's actual Part III earned income" value={data.spouseEarnedIncome ?? ""} allowNegative onChange={spouseEarnedIncome => change({ spouseEarnedIncome })} />}
    <Fact label="Do the Part III earned-income worksheets use student or incapacity deemed income?" value={data.usesDeemedIncome} onChange={usesDeemedIncome => change({ usesDeemedIncome })} />
    {filingStatus === "mfs" && <>
      <Fact label="Did your spouse live apart from you throughout the last six months of the year?" value={data.spouseLivedApartLast6Months} onChange={spouseLivedApartLast6Months => change({ spouseLivedApartLast6Months })} />
      <Fact label="Did you pay over half the cost of keeping up your home?" value={data.paidOverHalfHomeCost} onChange={paidOverHalfHomeCost => change({ paidOverHalfHomeCost })} />
      <Fact label="Was your home the qualifying person's main home for over half the year?" value={data.qualifyingPersonMainHomeOverHalfYear} onChange={qualifyingPersonMainHomeOverHalfYear => change({ qualifyingPersonMainHomeOverHalfYear })} />
    </>}
    {filingStatus === "mfj" && <><Fact label="Did your spouse die during this tax year?" value={data.spouseDiedDuringYear} onChange={spouseDiedDuringYear => change({ spouseDiedDuringYear })} />
      {data.spouseDiedDuringYear === true && <Fact label="Are you choosing to use the deceased spouse's earned income for the benefit limit?" value={data.useDeceasedSpouseEarnedIncome} onChange={useDeceasedSpouseEarnedIncome => change({ useDeceasedSpouseEarnedIncome })} />}</>}
    <h4>Business deduction allocation</h4>
    <p className="guided-hint">Allocate the allowed whole-dollar Part III line 24 deduction to the actual activity. Amounts must reconcile to the computed deduction. Explicitly confirm no allocations when the allowed business deduction is zero.</p>
    {allocations.map((entry, index) => <fieldset key={index}><legend>Business deduction allocation {index + 1}</legend>
      <Source label={`Deduction activity ${index + 1}`} value={entry.sourceId} sources={businessSources} onChange={source => change({ deductionAllocations: allocations.map((item, i) => i === index ? { ...item, sourceId: source?.sourceId, owner: source?.owner, schedule: source?.schedule } : item) })} />
      <CurrencyField label={`Allowed deduction allocated to activity ${index + 1}`} value={entry.amount ?? ""} onChange={amount => change({ deductionAllocations: allocations.map((item, i) => i === index ? { ...item, amount } : item) })} />
      <button type="button" className="guided-button" onClick={() => change({ deductionAllocations: allocations.filter((_, i) => i !== index) })}>Remove deduction allocation {index + 1}</button>
    </fieldset>)}
    <button type="button" className="guided-button" onClick={() => change({ deductionAllocations: [...allocations, {}] })}>Add business deduction allocation</button>
    {!allocations.length && <button type="button" className="guided-button" onClick={() => change({ deductionAllocations: [] })}>Confirm no business deduction allocations</button>}
    <h4>Remaining expenses for the care credit</h4>
    <label className="guided-field"><span className="guided-field-label">Actual number of qualifying people for Part III</span><input className="guided-input" inputMode="numeric" value={data.qualifyingIndividuals ?? ""} onChange={event => change({ qualifyingIndividuals: event.target.value })} /></label>
    <CurrencyField label="Actual net expenses paid for the current-year care credit" value={data.qualifiedExpensesPaidForCredit ?? ""} hint="Line 30: expenses incurred and paid this year after amounts used for the Part III exclusion or deduction. Exclude prior-year or prepaid future care. Do not reduce this net amount again." onChange={qualifiedExpensesPaidForCredit => change({ qualifiedExpensesPaidForCredit })} />
    <fieldset><legend>Providers for dependent-care benefits</legend>
      {careProviders?.length ? <button type="button" className="guided-button" onClick={() => change({ providers: careProviders.map(provider => ({ ...provider })) })}>Use the care providers entered in the credit section</button> : null}
      <CareProviderSourceDetails providers={data.providers ?? []} onChange={providers => change({ providers })} />
      {!data.providers?.length && <button type="button" className="guided-button" onClick={() => change({ providers: [] })}>Confirm no care providers or incurred expenses</button>}
    </fieldset>
    <Fact label="Have you checked both actual earned-income worksheets after the last edit?" value={data.earnedIncomeWorksheetConfirmed} onChange={earnedIncomeWorksheetConfirmed => onChange({ ...data, earnedIncomeWorksheetConfirmed, sourceFactsConfirmed: null })} />
    <Fact label="Have you reconciled expenses and benefits without using the same expense twice?" value={data.creditExpenseCoordinationConfirmed} onChange={creditExpenseCoordinationConfirmed => onChange({ ...data, creditExpenseCoordinationConfirmed, sourceFactsConfirmed: null })} />
    <Fact label="Have you checked all benefit source and provider facts after the last edit?" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />
    {Object.keys(errors).length > 0 && <div className="guided-hint" aria-live="polite"><p>Complete these records before calculating:</p><ul>{Object.entries(errors).map(([key, message]) => <li key={key}>{message}</li>)}</ul></div>}
    <button type="button" className="guided-button" onClick={() => onChange(undefined)}>Remove dependent-care benefit details</button>
  </fieldset>;
}
