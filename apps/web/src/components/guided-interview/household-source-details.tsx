"use client";

import { emptyHouseholdEmployee, type OtherTaxesData } from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

export function HouseholdSourceDetails({ data, onChange }: { data: OtherTaxesData; onChange: (data: OtherTaxesData) => void }) {
  const employees = data.householdEmployees ?? [];
  return <>
    {data.householdEmploymentWages.trim() && <CurrencyField label="Saved household wage total to reconcile" value={data.householdEmploymentWages} onChange={(householdEmploymentWages) => onChange({ ...data, householdEmploymentWages })} />}
    {employees.map((employee, index) => {
      const update = (change: Partial<typeof employee>) => onChange({ ...data, householdEmployees: employees.map((entry, i) => i === index ? { ...entry, ...change } : entry) });
      return <fieldset key={index} className="guided-fieldset"><legend>Household employee #{index + 1}</legend>
        <TextFact label="Actual employee name" value={employee.name} onChange={(name) => update({ name })} />
        <CurrencyField label="Employee cash wages" value={employee.cashWages} onChange={(cashWages) => update({ cashWages })} required />
        <CurrencyField label="Employee federal income tax withheld" value={employee.federalIncomeTaxWithheld} onChange={(federalIncomeTaxWithheld) => update({ federalIncomeTaxWithheld })} required />
        <BooleanFact label="Employee is your spouse" value={employee.isSpouse} onChange={(isSpouse) => update({ isSpouse })} />
        <BooleanFact label="Employee is your child under age 21" value={employee.isChildUnder21} onChange={(isChildUnder21) => update({ isChildUnder21 })} />
        <BooleanFact label="Employee is your parent" value={employee.isParent} onChange={(isParent) => update({ isParent })} />
        <BooleanFact label="Employee is under 18 and household work is not their principal occupation" value={employee.isUnder18NonPrincipal} onChange={(isUnder18NonPrincipal) => update({ isUnder18NonPrincipal })} />
        <button type="button" className="utility-button" onClick={() => onChange({ ...data, householdEmployees: employees.filter((_, i) => i !== index) })}>Remove employee #{index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => onChange({ ...data, householdEmployees: [...employees, { ...emptyHouseholdEmployee }] })}>Add household employee</button>
    {employees.length > 0 && <>
      <BooleanFact label="Qualifying household wages reached $1,000 in a calendar quarter of this or the preceding year (FUTA applies)" value={data.futaApplies} onChange={(futaApplies) => onChange({ ...data, futaApplies })} />
      {data.futaApplies && <BooleanFact label="All wages were subject to unemployment tax in one state, paid timely, with no FUTA credit reduction" value={data.futaSectionA} onChange={(futaSectionA) => onChange({ ...data, futaSectionA })} />}
      {data.futaApplies && data.futaSectionA === false && <>
        <CurrencyField label="State unemployment contributions actually paid" value={data.stateUnemploymentContributions ?? ""} onChange={(stateUnemploymentContributions) => onChange({ ...data, stateUnemploymentContributions })} required />
        <CurrencyField label="FUTA credit reduction from the applicable worksheet" value={data.futaCreditReduction ?? ""} onChange={(futaCreditReduction) => onChange({ ...data, futaCreditReduction })} required />
      </>}
    </>}
  </>;
}
