"use client";

import {
  emptySchedule1AData, emptyEmployeeTipDeduction, emptyBusinessTipDeduction,
  emptyOvertimeDeduction, emptyVehicleInterest,
  type Schedule1AData, type EmployeeTipDeductionData,
} from "@/lib/guided-schedule-1-a-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";
import { VehicleRefinancingDetails } from "./vehicle-refinancing-details";

type Source = { sourceId: string; kind: "w2" | "nec"; accountHolder?: string; name: string };
type ChoiceEntry = readonly [string, string];
function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: readonly ChoiceEntry[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{value && !choices.some(([id]) => id === value) && <option value={value}>Saved source needs reconciliation</option>}{choices.map(([id, text]) => <option value={id} key={id}>{text}</option>)}</select></label>;
}
const owners: ChoiceEntry[] = [["primary", "You"], ["spouse", "Spouse on joint return"]];
type Qualification = Pick<EmployeeTipDeductionData, "owner" | "occupationCode" | "eligibleOccupation" | "voluntaryCashTips" | "lawfulActivity" | "meetsSstbRuleOrTransition">;
function TipQualification({ label, data, onChange }: { label: string; data: Qualification; onChange: (patch: Partial<Qualification>) => void }) {
  return <>
    <Choice label={`${label}: Owner`} value={data.owner} choices={owners} onChange={owner => onChange({ owner: owner as Qualification["owner"] })} />
    <TextFact label={`${label}: Occupation code`} value={data.occupationCode} onChange={occupationCode => onChange({ occupationCode })} />
    {([["eligibleOccupation", "Listed tipped occupation"], ["voluntaryCashTips", "Voluntary cash or charge tips"], ["lawfulActivity", "Lawful activity"], ["meetsSstbRuleOrTransition", "Service-business rule or current-year transition met"]] as const).map(([field, text]) => <BooleanFact key={field} label={`${label}: ${text}`} value={data[field]} onChange={value => onChange({ [field]: value })} />)}
  </>;
}
export function Schedule1ASourceDetails({ data, compensationSources = [], businessOwner, businessName, onChange }: {
  data?: Schedule1AData; compensationSources?: Source[]; businessOwner?: string; businessName?: string;
  onChange: (data: Schedule1AData | undefined) => void;
}) {
  if (!data) return <section><h4>Additional deduction sources</h4><p className="guided-hint">Collect actual qualified tip, FLSA overtime premium, vehicle loan interest or senior eligibility records. A source amount alone does not establish a deduction.</p><button type="button" onClick={() => onChange({ ...emptySchedule1AData, employeeTips: [], businessTips: [], overtime: [], vehicleLoans: [], seniorOwners: [] })}>Add additional deduction worksheet</button></section>;
  const set = (patch: Partial<Schedule1AData>) => onChange({ ...data, ...patch, sourceFactsConfirmed: "sourceFactsConfirmed" in patch ? patch.sourceFactsConfirmed! : null });
  const sources = (owner: string, kind?: Source["kind"]) => compensationSources.filter(source => source.accountHolder === owner && (!kind || source.kind === kind)).map(source => [source.sourceId, `${source.name || "Unnamed source"} — ${source.sourceId}`] as const);
  return <section><h4>Additional deduction sources</h4><p className="guided-hint">Use original records for the selected tax year. Confirm identity and senior birth/death facts in About You. Keep source amounts separate from the deduction after eligibility, business income limits and phaseouts.</p>
    <div className="guided-form-grid">
      <TextFact label="Additional deductions: Source tax year" value={data.sourceTaxYear} onChange={sourceTaxYear => set({ sourceTaxYear })} />
      <TextFact label="Additional deductions: Source reference" value={data.sourceReference} onChange={sourceReference => set({ sourceReference })} />
      <CurrencyField label="Additional deductions: Excluded Puerto Rico income" value={data.excludedPuertoRicoIncome} onChange={excludedPuertoRicoIncome => set({ excludedPuertoRicoIncome })} />
      <CurrencyField label="Additional deductions: Form 4563 exclusion" value={data.form4563Exclusion} onChange={form4563Exclusion => set({ form4563Exclusion })} />
    </div>
    <p className="guided-hint">Qualified tips are voluntary customer-determined cash or charge tips in a listed occupation. Mandatory service charges are not qualified tips. Use the actual Treasury occupation code and check the applicable service-business rule or transition.</p>
    {data.employeeTips.map((entry, index) => {
      const label = `Employee tips ${index + 1}`;
      const update = (patch: Partial<typeof entry>) => set({ employeeTips: data.employeeTips.map((row, position) => position === index ? { ...row, ...patch } : row) });
      return <fieldset key={index}><legend>{label}</legend><div className="guided-form-grid">
        <TipQualification label={label} data={entry} onChange={update} />
        <TextFact label={`${label}: Employer`} value={entry.employer} onChange={employer => update({ employer })} />
        <Choice label={`${label}: Reporting method`} value={entry.reportingMethod} choices={[["w2", "Original W-2 report"], ["employer_statement", "2025 employer statement"], ["form4070", "2025 monthly Form 4070 reports"], ["form4137", "Direct Form 4137 report"]]} onChange={value => update({ reportingMethod: value as typeof entry.reportingMethod })} />
        <TextFact label={`${label}: Reporting reference`} value={entry.reportingSourceReference} onChange={reportingSourceReference => update({ reportingSourceReference })} />
        {["form4070", "employer_statement"].includes(entry.reportingMethod) && <CurrencyField label={`${label}: Employer-reported total on statement`} hint="Original annual total from actual records; wages after payroll exclusions are not a substitute." value={entry.reportedEmployerTips} onChange={reportedEmployerTips => update({ reportedEmployerTips })} />}
        <CurrencyField label={`${label}: Qualified employer-reported tips`} value={entry.qualifiedW2Tips} onChange={qualifiedW2Tips => update({ qualifiedW2Tips })} />
        <TextFact label={`${label}: Form 4137 employer source label`} value={entry.form4137EmployerSourceId} onChange={form4137EmployerSourceId => update({ form4137EmployerSourceId })} />
        <CurrencyField label={`${label}: Qualified total Form 4137 column 1(c)`} hint="Use this employer's qualified total tips, not just unreported tips on line4. If no Form4137 amount applies, confirm an actual zero." value={entry.qualifiedForm4137Tips} onChange={qualifiedForm4137Tips => update({ qualifiedForm4137Tips })} />
      </div>
      {entry.w2SourceIds.map((id, position) => <div key={position}><Choice label={`${label}: W-2 source ${position + 1}`} value={id} choices={sources(entry.owner, "w2")} onChange={value => update({ w2SourceIds: entry.w2SourceIds.map((source, offset) => offset === position ? value : source) })} /><button type="button" onClick={() => update({ w2SourceIds: entry.w2SourceIds.filter((_, offset) => offset !== position) })}>{label}: Remove W-2 source {position + 1}</button></div>)}
      <button type="button" onClick={() => update({ w2SourceIds: [...entry.w2SourceIds, ""] })}>{label}: Add W-2 source</button>
      <button type="button" onClick={() => set({ employeeTips: data.employeeTips.filter((_, position) => position !== index) })}>{label}: Remove employee tips</button></fieldset>;
    })}
    <button type="button" onClick={() => set({ employeeTips: [...data.employeeTips, { ...emptyEmployeeTipDeduction, w2SourceIds: [] }] })}>Add employee tip deduction</button>
    {data.businessTips.map((entry, index) => {
      const label = `Business tips ${index + 1}`;
      const update = (patch: Partial<typeof entry>) => set({ businessTips: data.businessTips.map((row, position) => position === index ? { ...row, ...patch } : row) });
      return <fieldset key={index}><legend>{label}</legend><p className="guided-hint">Link tips already included in this business's actual NEC receipts. Business profit and attributable deductions come from the completed return. Other information-return receipt arrangements require their reconciliation worksheet.</p><div className="guided-form-grid"><TipQualification label={label} data={entry} onChange={update} /><Choice label={`${label}: Business`} value={entry.businessSourceId} choices={businessOwner === entry.owner ? [["scheduleC", businessName || "Your Schedule C business"]] : []} onChange={businessSourceId => update({ businessSourceId })} /></div>
        {entry.reportedTipSources.map((source, position) => <div key={position} className="guided-form-grid"><Choice label={`${label}: Reported source ${position + 1}`} value={source.sourceId} choices={sources(entry.owner, "nec")} onChange={sourceId => update({ reportedTipSources: entry.reportedTipSources.map((row, offset) => offset === position ? { ...row, sourceId } : row) })} /><CurrencyField label={`${label}: Qualified tips in source ${position + 1}`} value={source.qualifiedTips} onChange={qualifiedTips => update({ reportedTipSources: entry.reportedTipSources.map((row, offset) => offset === position ? { ...row, qualifiedTips } : row) })} /><button type="button" onClick={() => update({ reportedTipSources: entry.reportedTipSources.filter((_, offset) => offset !== position) })}>{label}: Remove reported source {position + 1}</button></div>)}
        <button type="button" onClick={() => update({ reportedTipSources: [...entry.reportedTipSources, { sourceId: "", qualifiedTips: "" }] })}>{label}: Add reported tip source</button>
        <button type="button" onClick={() => set({ businessTips: data.businessTips.filter((_, position) => position !== index) })}>{label}: Remove business tips</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => set({ businessTips: [...data.businessTips, { ...emptyBusinessTipDeduction, reportedTipSources: [] }] })}>Add business tip deduction</button>
    {data.overtime.map((entry, index) => {
      const label = `Overtime ${index + 1}`;
      const update = (patch: Partial<typeof entry>) => set({ overtime: data.overtime.map((row, position) => position === index ? { ...row, ...patch } : row) });
      return <fieldset key={index}><legend>{label}</legend><p className="guided-hint">Enter only the premium above the regular pay rate that the FLSA requires. State-law, contract or voluntary overtime alone does not establish federal eligibility. Use actual reported overtime amounts and the employer's calculation.</p><div className="guided-form-grid">
        <Choice label={`${label}: Owner`} value={entry.owner} choices={owners} onChange={owner => update({ owner: owner as typeof entry.owner })} />
        <Choice label={`${label}: Compensation source`} value={entry.compensationSourceId} choices={sources(entry.owner)} onChange={compensationSourceId => update({ compensationSourceId })} />
        <CurrencyField label={`${label}: Qualified FLSA premium`} value={entry.qualifiedPremium} onChange={qualifiedPremium => update({ qualifiedPremium })} />
        {entry.compensationSourceId.startsWith("formW2:") && <CurrencyField label={`${label}: Payroll compensation excluded from Box 1`} hint="Actual compensation excluded from taxable wages, including a checked zero; never infer this from the proposed deduction." value={entry.compensationExcludedFromWages} onChange={compensationExcludedFromWages => update({ compensationExcludedFromWages })} />}
        <BooleanFact label={`${label}: Premium required by FLSA`} value={entry.requiredByFlsa} onChange={requiredByFlsa => update({ requiredByFlsa })} />
        <TextFact label={`${label}: Reporting reference`} value={entry.reportingSourceReference} onChange={reportingSourceReference => update({ reportingSourceReference })} />
      </div><button type="button" onClick={() => set({ overtime: data.overtime.filter((_, position) => position !== index) })}>{label}: Remove overtime</button></fieldset>;
    })}
    <button type="button" onClick={() => set({ overtime: [...data.overtime, { ...emptyOvertimeDeduction }] })}>Add overtime deduction</button>
    {data.vehicleLoans.map((entry, index) => {
      const label = `Vehicle loan ${index + 1}`;
      const update = (patch: Partial<typeof entry>) => set({ vehicleLoans: data.vehicleLoans.map((row, position) => position === index ? { ...row, ...patch } : row) });
      return <fieldset key={index}><legend>{label}</legend><p className="guided-hint">Confirm original borrower and loan records, qualifying new vehicle use and U.S. final assembly. A VIN alone does not establish eligibility. Keep business and other nonqualifying interest separate. Refinancing needs its original-loan worksheet.</p><div className="guided-form-grid">
        <Choice label={`${label}: Owner`} value={entry.owner} choices={owners} onChange={owner => update({ owner: owner as typeof entry.owner })} />
        {([["lenderName", "Lender"], ["loanAccountReference", "Loan account reference"], ["sourceTaxYear", "Source tax year"], ["sourceReference", "Source reference"], ["vin", "VIN"], ["grossVehicleWeightRating", "Gross vehicle weight rating in pounds"]] as const).map(([field, text]) => <TextFact key={field} label={`${label}: ${text}`} value={entry[field]} onChange={value => update({ [field]: value })} />)}
        {([["acquiredDate", "Acquired date"], ["loanOriginationDate", "Loan origination date"]] as const).map(([field, text]) => <TextFact key={field} label={`${label}: ${text}`} type="date" value={entry[field]} onChange={value => update({ [field]: value })} />)}
        {([["interestPaid", "Interest paid"], ["businessInterestDeducted", "Interest already deducted elsewhere"], ["nonqualifyingInterest", "Nonqualifying interest"]] as const).map(([field, text]) => <CurrencyField key={field} label={`${label}: ${text}`} value={entry[field]} onChange={value => update({ [field]: value })} />)}
        <Choice label={`${label}: Vehicle type`} value={entry.vehicleType} choices={[["car", "Car"], ["minivan", "Minivan"], ["van", "Van"], ["sport_utility_vehicle", "SUV"], ["pickup_truck", "Pickup truck"], ["motorcycle", "Motorcycle"]]} onChange={vehicleType => update({ vehicleType: vehicleType as typeof entry.vehicleType })} />
        {([["borrowerQualificationConfirmed", "Borrower qualification confirmed"], ["firstLien", "First lien"], ["originalUse", "Original use begins with borrower"], ["finalAssemblyUnitedStates", "Final assembly in the United States"], ["personalUse", "Purchased for personal use"], ["relatedParty", "Related-party loan"], ["lease", "Lease"], ["fleet", "Fleet purchase"], ["salvageOrScrap", "Salvage or scrap"], ["refinanced", "Refinanced loan"]] as const).map(([field, text]) => <BooleanFact key={field} label={`${label}: ${text}`} value={entry[field]} onChange={value => update({ [field]: value })} />)}
      </div>{(entry.refinanced === true || entry.refinancingSources !== undefined) && <VehicleRefinancingDetails label={`${label} refinancing`} data={entry.refinancingSources} onChange={refinancingSources => update({ refinancingSources })} />}<button type="button" onClick={() => set({ vehicleLoans: data.vehicleLoans.filter((_, position) => position !== index) })}>{label}: Remove vehicle loan</button></fieldset>;
    })}
    <button type="button" onClick={() => set({ vehicleLoans: [...data.vehicleLoans, { ...emptyVehicleInterest }] })}>Add vehicle loan interest</button>
    <p className="guided-hint">Senior eligibility uses actual birth, death and SSN facts from About You, with the deduction computed after the income limit.</p>
    {data.seniorOwners.map((owner, index) => <div key={index}><Choice label={`Senior deduction ${index + 1}: Owner`} value={owner} choices={owners} onChange={value => set({ seniorOwners: data.seniorOwners.map((entry, position) => position === index ? value as typeof owner : entry) })} /><button type="button" onClick={() => set({ seniorOwners: data.seniorOwners.filter((_, position) => position !== index) })}>Senior deduction {index + 1}: Remove owner</button></div>)}
    <button type="button" onClick={() => set({ seniorOwners: [...data.seniorOwners, ""] })}>Add senior deduction owner</button>
    <BooleanFact label="Additional deductions: All claimed sources are included" value={data.allSourcesIncluded} onChange={allSourcesIncluded => set({ allSourcesIncluded })} />
    <BooleanFact label="Additional deductions: Sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => set({ sourceFactsConfirmed })} />
    <button type="button" onClick={() => onChange(undefined)}>Remove additional deduction worksheet</button>
  </section>;
}
