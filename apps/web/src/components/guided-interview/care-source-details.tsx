"use client";

import type { CareProviderData, CareQualifyingPersonData, DependentCareData } from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";

function Fact({ label, value, onChange }: { label: string; value?: boolean | null; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span>
    <select className="guided-input" value={value == null ? "" : String(value)} onChange={event => onChange(event.target.value === "" ? null : event.target.value === "true")}>
      <option value="">Confirm from your records</option><option value="true">Yes</option><option value="false">No</option>
    </select></label>;
}
function Text({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" value={value ?? ""} onChange={event => onChange(event.target.value)} /></label>;
}

export function CareSourceDetails({ data, onChange }: { data: DependentCareData; onChange: (data: DependentCareData) => void }) {
  const providers = data.providers ?? [];
  const persons = data.qualifyingPersons ?? [];
  const change = (patch: Partial<DependentCareData>) => onChange({ ...data, ...patch, sourceFactsConfirmed: false });
  const providerChange = (index: number, patch: Partial<CareProviderData>) => change({ providers: providers.map((provider, i) => i === index ? { ...provider, ...patch } : provider) });
  const personChange = (index: number, patch: Partial<CareQualifyingPersonData>) => change({ qualifyingPersons: persons.map((person, i) => i === index ? { ...person, ...patch } : person) });
  return <div className="guided-w2-stack">
    <CurrencyField label="Prior-year care expense worksheet credit" value={data.priorYearExpenseCredit ?? ""} hint="Enter the completed Form 2441 Worksheet A credit for earlier-year expenses paid this year. Enter 0 only if none applies." onChange={value => change({ priorYearExpenseCredit: value })} />
    <Fact label="Did you receive dependent-care benefits, including employer-provided care?" value={data.receivedBenefits} onChange={value => change({ receivedBenefits: value })} />
    <Fact label="Does either earned-income amount include student or incapacity deemed income?" value={data.usesDeemedIncome} onChange={value => change({ usesDeemedIncome: value })} />
    <h4>Care providers</h4>
    <p className="guided-hint">Use Form W-10 or the provider's actual records. Payments include employer-paid amounts and are not reduced by reimbursements.</p>
    {providers.map((provider, index) => <fieldset className="guided-w2-card" key={index}>
      <legend>Care provider {index + 1}</legend>
      <Text label={`Provider ${index + 1} name`} value={provider.name} onChange={name => providerChange(index, { name })} />
      <Text label={`Provider ${index + 1} address`} value={provider.address} onChange={address => providerChange(index, { address })} />
      <label className="guided-field"><span className="guided-field-label">Provider {index + 1} identification status</span>
        <select className="guided-input" value={provider.identifierType} onChange={event => providerChange(index, { identifierType: event.target.value as CareProviderData["identifierType"] })}>
          <option value="">Choose from actual records</option><option value="tin">SSN, ITIN or EIN</option><option value="tax_exempt">Tax-exempt organization</option><option value="foreign_no_us_tin">Foreign provider without a required US tax ID</option><option value="employer_furnished">Employer furnished the care (See W-2)</option><option value="withheld">Provider withheld information; documented due diligence</option>
        </select></label>
      {provider.identifierType === "tin" && <Text label={`Provider ${index + 1} tax ID`} value={provider.taxId} onChange={taxId => providerChange(index, { taxId })} />}
      {provider.identifierType === "withheld" && <Text label={`Provider ${index + 1} documented efforts to obtain information`} value={provider.dueDiligenceStatement} onChange={dueDiligenceStatement => providerChange(index, { dueDiligenceStatement })} />}
      <Fact label={`Was provider ${index + 1} your household employee?`} value={provider.householdEmployee} onChange={householdEmployee => providerChange(index, { householdEmployee })} />
      <CurrencyField label={`Amount paid to provider ${index + 1}`} value={provider.amountPaid} onChange={amountPaid => providerChange(index, { amountPaid })} />
      <button className="guided-button" type="button" onClick={() => change({ providers: providers.filter((_, i) => i !== index) })}>Remove provider {index + 1}</button>
    </fieldset>)}
    <button className="guided-button" type="button" disabled={providers.length >= 50} onClick={() => change({ providers: [...providers, { name: "", address: "", identifierType: "", amountPaid: "" }] })}>Add care provider</button>
    <h4>Qualifying persons</h4>
    <p className="guided-hint">List each qualifying person, including a person with zero expenses. Allocate expenses incurred and paid this year after excluded benefits; omit prior-year expenses and prepaid future care.</p>
    {persons.map((person, index) => <fieldset className="guided-w2-card" key={index}>
      <legend>Qualifying person {index + 1}</legend>
      <Text label={`Qualifying person ${index + 1} first name`} value={person.firstName} onChange={firstName => personChange(index, { firstName })} />
      <Text label={`Qualifying person ${index + 1} last name`} value={person.lastName} onChange={lastName => personChange(index, { lastName })} />
      <label className="guided-field"><span className="guided-field-label">Qualifying person {index + 1} identification status</span>
        <select className="guided-input" value={person.identifierType} onChange={event => personChange(index, { identifierType: event.target.value as CareQualifyingPersonData["identifierType"] })}>
          <option value="">Choose from actual records</option><option value="tax_id">SSN, ITIN or ATIN</option><option value="died">Born and died this year without a tax ID</option>
        </select></label>
      {person.identifierType === "tax_id" && <Text label={`Qualifying person ${index + 1} tax ID`} value={person.taxId} onChange={taxId => personChange(index, { taxId })} />}
      {person.identifierType === "died" && <p className="guided-hint">The required birth/death or hospital evidence must accompany any future filing.</p>}
      <Fact label={`Was person ${index + 1} over age 12 and incapable of self-care when care was provided?`} value={person.over12Disabled} onChange={over12Disabled => personChange(index, { over12Disabled })} />
      <Fact label={`Does person ${index + 1} meet the Form 2441 qualifying-person, residence and dependency requirements?`} value={person.qualifyingPersonConfirmed} onChange={qualifyingPersonConfirmed => personChange(index, { qualifyingPersonConfirmed })} />
      <CurrencyField label={`Qualified expenses for person ${index + 1}`} value={person.qualifiedExpenses} onChange={qualifiedExpenses => personChange(index, { qualifiedExpenses })} />
      <button className="guided-button" type="button" onClick={() => change({ qualifyingPersons: persons.filter((_, i) => i !== index) })}>Remove qualifying person {index + 1}</button>
    </fieldset>)}
    <button className="guided-button" type="button" disabled={persons.length >= 20} onClick={() => change({ qualifyingPersons: [...persons, { firstName: "", lastName: "", identifierType: "", qualifiedExpenses: "" }] })}>Add qualifying person</button>
    <Fact label="Have you checked these provider and qualifying-person details against your actual records?" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />
  </div>;
}
