"use client";

import { emptyHouseholdEmployee, type OtherTaxesData } from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

export function HouseholdSourceDetails({ data, onChange }: { data: OtherTaxesData; onChange: (data: OtherTaxesData) => void }) {
  const employees = data.householdEmployees ?? [];
  const periods = data.futaStatePeriods ?? [];
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
        {employee.isParent && <BooleanFact label="Parent cares for your child under 18 or needing adult care for 4 continuous weeks, and you are widowed, divorced and unmarried, or living with a spouse unable to provide that care for 4 continuous weeks" value={employee.parentCareExceptionApplies} onChange={(parentCareExceptionApplies) => update({ parentCareExceptionApplies })} />}
        <BooleanFact label="Employee is under 18 and household work is not their principal occupation" value={employee.isUnder18NonPrincipal} onChange={(isUnder18NonPrincipal) => update({ isUnder18NonPrincipal })} />
        <button type="button" className="utility-button" onClick={() => onChange({ ...data, householdEmployees: employees.filter((_, i) => i !== index) })}>Remove employee #{index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => onChange({ ...data, householdEmployees: [...employees, { ...emptyHouseholdEmployee }] })}>Add household employee</button>
    {employees.length > 0 && <>
      <BooleanFact label="Qualifying household wages reached $1,000 in a calendar quarter of this or the preceding year (FUTA applies)" value={data.futaApplies} onChange={(futaApplies) => onChange({ ...data, futaApplies })} />
      {data.futaApplies && <BooleanFact label="All wages were subject to unemployment tax in one state, paid timely, with no FUTA credit reduction" value={data.futaSectionA} onChange={(futaSectionA) => onChange({ ...data, futaSectionA })} />}
      {data.futaApplies && data.futaSectionA === false && <>
        {data.stateUnemploymentContributions?.trim() && <CurrencyField label="Saved state contributions total to reconcile" value={data.stateUnemploymentContributions} onChange={(stateUnemploymentContributions) => onChange({ ...data, stateUnemploymentContributions })} />}
        {periods.map((period, index) => {
          const updatePeriod = (change: Partial<typeof period>) => onChange({ ...data, futaStatePeriods: periods.map((item, i) => i === index ? { ...item, ...change } : item) });
          return <fieldset key={index} className="guided-fieldset"><legend>State unemployment rate period #{index + 1}</legend>
            <TextFact label="State abbreviation" value={period.state} onChange={(state) => updatePeriod({ state: state.toUpperCase() })} />
            <TextFact label="Rate period starts" type="date" value={period.periodStart} onChange={(periodStart) => updatePeriod({ periodStart })} />
            <TextFact label="Rate period ends" type="date" value={period.periodEnd} onChange={(periodEnd) => updatePeriod({ periodEnd })} />
            <CurrencyField label="Wages taxable by this state's unemployment fund" value={period.taxableWages} onChange={(taxableWages) => updatePeriod({ taxableWages })} required />
            <BooleanFact label="The state assigned an experience rate for this period" value={period.hasAssignedExperienceRate} onChange={(hasAssignedExperienceRate) => updatePeriod({ hasAssignedExperienceRate })} />
            {period.hasAssignedExperienceRate && <TextFact label="State experience rate (%)" value={period.experienceRatePercent} onChange={(experienceRatePercent) => updatePeriod({ experienceRatePercent })} />}
            <CurrencyField label="Eligible state contributions paid by the original return due date" value={period.contributionsPaidTimely} onChange={(contributionsPaidTimely) => updatePeriod({ contributionsPaidTimely })} required />
            <button type="button" className="utility-button" onClick={() => onChange({ ...data, futaStatePeriods: periods.filter((_, i) => i !== index) })}>Remove rate period #{index + 1}</button>
          </fieldset>;
        })}
        <button type="button" className="utility-button" onClick={() => onChange({ ...data, futaStatePeriods: [...periods, { state: "", periodStart: "", periodEnd: "", taxableWages: "", hasAssignedExperienceRate: null, experienceRatePercent: "", contributionsPaidTimely: "" }] })}>Add state unemployment rate period</button>
        <CurrencyField label="Eligible state contributions paid after the original return due date" value={data.stateUnemploymentContributionsPaidLate ?? ""} onChange={(stateUnemploymentContributionsPaidLate) => onChange({ ...data, stateUnemploymentContributionsPaidLate })} required />
        <CurrencyField label="FUTA credit reduction from the applicable worksheet" value={data.futaCreditReduction ?? ""} onChange={(futaCreditReduction) => onChange({ ...data, futaCreditReduction })} required />
      </>}
    </>}
  </>;
}
