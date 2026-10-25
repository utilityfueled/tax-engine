"use client";

import type { AdoptionChildData, AdoptionCreditData } from "@/lib/guided-adoption-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

export function AdoptionSourceDetails({ data, onChange }: { data: AdoptionCreditData | undefined; onChange: (data: AdoptionCreditData) => void }) {
  const current = data ?? { children: [] };
  const update = (values: Partial<AdoptionCreditData>) => onChange({ ...current, ...values });
  return <div className="guided-w2-card" style={{ padding: "12px" }}>
    <h3 className="guided-w2-card-title">Adoption Credit and Employer Benefits (Form 8839)</h3>
    <p className="guided-hint">Use actual child records, unreimbursed qualified expenses, employer benefits and prior returns. Expenses must exclude reimbursements, surrogate parenting and adoption of a spouse's child. Special needs require a qualifying state or tribal determination. <a href="https://www.irs.gov/instructions/i8839" target="_blank" rel="noreferrer">Review the IRS eligibility and expense timing rules.</a></p>
    {current.children.map((child, index) => {
      const change = (values: Partial<AdoptionChildData>) => update({ children: current.children.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) });
      return <fieldset className="guided-fieldset" key={index}><legend>Adopted child {index + 1}</legend>
        {([ ["childFirstName", "Child's actual first name"], ["childLastName", "Child's actual last name"], ["childBirthYear", "Child's actual birth year"], ["childIdentifyingNumber", "Child's SSN, ATIN or ITIN"] ] as const).map(([field, label]) => <TextFact key={field} label={label} value={child[field] ?? ""} onChange={(value) => change({ [field]: value })} />)}
        <BooleanFact label="Was the child physically or mentally incapable of self-care?" value={child.childPermanentlyDisabled} onChange={(value) => change({ childPermanentlyDisabled: value })} />
        <BooleanFact label="Is this a foreign adoption under the IRS rules?" value={child.isForeignAdoption} onChange={(value) => change({ isForeignAdoption: value })} />
        <BooleanFact label="Does the child have the required special-needs determination?" value={child.isSpecialNeeds} onChange={(value) => change({ isSpecialNeeds: value })} />
        <BooleanFact label="Was this adoption finalized by the end of this tax year?" value={child.adoptionFinalized} onChange={(value) => change({ adoptionFinalized: value })} />
        {(child.adoptionFinalized || child.adoptionFinalizedYear?.trim()) && <TextFact label="Actual year the adoption became final" value={child.adoptionFinalizedYear ?? ""} onChange={(value) => change({ adoptionFinalizedYear: value })} />}
        <p className="guided-hint">Enter one total for each actual year expenses were paid. The calculation applies domestic or foreign adoption timing rules. Confirm an empty history only when there were no qualified unreimbursed expenses.</p>
        {(child.expensesByYear ?? []).map((entry, expenseIndex) => <div className="guided-form-grid" key={expenseIndex}>
          <TextFact label={`Expense year ${expenseIndex + 1}`} value={entry.year} onChange={(value) => change({ expensesByYear: child.expensesByYear?.map((item, itemIndex) => itemIndex === expenseIndex ? { ...item, year: value } : item), expensesConfirmed: null })} />
          <CurrencyField label={`Qualified unreimbursed expenses ${expenseIndex + 1}`} value={entry.amount} onChange={(value) => change({ expensesByYear: child.expensesByYear?.map((item, itemIndex) => itemIndex === expenseIndex ? { ...item, amount: value } : item), expensesConfirmed: null })} />
          <button type="button" className="utility-button" onClick={() => change({ expensesByYear: child.expensesByYear?.filter((_, itemIndex) => itemIndex !== expenseIndex), expensesConfirmed: null })}>Remove expense year {expenseIndex + 1}</button>
        </div>)}
        <button type="button" className="utility-button" onClick={() => change({ expensesByYear: [...(child.expensesByYear ?? []), { year: "", amount: "" }], expensesConfirmed: null })}>Add expense year for child {index + 1}</button>
        <BooleanFact label="Is the complete unreimbursed expense history confirmed, including no expenses if applicable?" value={child.expensesConfirmed} onChange={(value) => change({ expensesConfirmed: value, expensesByYear: child.expensesByYear ?? [] })} />
        {([ ["employerBenefits", "Current-year employer adoption benefits for this child"], ["priorYearCreditsClaimed", "Prior adoption credit limit already used for this child"], ["priorYearExclusionsClaimed", "Prior employer-benefit exclusion limit already used for this child"] ] as const).map(([field, label]) => <CurrencyField key={field} label={label} value={child[field] ?? ""} onChange={(value) => change({ [field]: value })} />)}
        <BooleanFact label="Does the employer adoption assistance plan meet the IRS qualification requirements?" value={child.employerPlanQualified} onChange={(value) => change({ employerPlanQualified: value })} />
        {child.isForeignAdoption && <><CurrencyField label="Prior-year foreign-adoption employer benefits" value={child.priorYearForeignBenefits ?? ""} onChange={(value) => change({ priorYearForeignBenefits: value })} /><p className="guided-hint">Positive historical foreign-adoption benefits need a historical exclusion worksheet that is not yet supported.</p></>}
        <button type="button" className="utility-button" onClick={() => update({ children: current.children.filter((_, itemIndex) => itemIndex !== index) })}>Remove adopted child {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => update({ children: [...current.children, {}] })}>Add adopted child</button>
    {current.children.length > 0 && <fieldset className="guided-fieldset"><legend>Adoption worksheet and carryforward history</legend>
      <BooleanFact label="Do actual records establish taxpayer, child and expense eligibility under Form 8839?" value={current.eligibilityConfirmed} onChange={(value) => update({ eligibilityConfirmed: value })} />
      {([ ["foreignEarnedIncomeExclusion", "Adoption MAGI foreign earned income exclusion"], ["foreignHousingExclusion", "Adoption MAGI foreign housing exclusion"], ["possessionIncomeExclusion", "Adoption MAGI Puerto Rico / American Samoa exclusion"], ["exclusionMagi", "Employer-benefit exclusion MAGI from the actual worksheet"] ] as const).map(([field, label]) => <CurrencyField key={field} label={label} value={current[field] ?? ""} onChange={(value) => update({ [field]: value })} />)}
      <p className="guided-hint">Enter each unused credit by the year it originated. The employer-benefit exclusion MAGI is required when benefits or an eligible special-needs plan are present.</p>
      {(current.carryforwards ?? []).map((entry, index) => <div className="guided-form-grid" key={index}>
        <TextFact label={`Carryforward origin year ${index + 1}`} value={entry.originTaxYear} onChange={(value) => update({ carryforwards: current.carryforwards?.map((item, itemIndex) => itemIndex === index ? { ...item, originTaxYear: value } : item), carryforwardHistoryConfirmed: null })} />
        <CurrencyField label={`Unused adoption credit ${index + 1}`} value={entry.amount} onChange={(value) => update({ carryforwards: current.carryforwards?.map((item, itemIndex) => itemIndex === index ? { ...item, amount: value } : item), carryforwardHistoryConfirmed: null })} />
        <button type="button" className="utility-button" onClick={() => update({ carryforwards: current.carryforwards?.filter((_, itemIndex) => itemIndex !== index), carryforwardHistoryConfirmed: null })}>Remove adoption carryforward {index + 1}</button>
      </div>)}
      <button type="button" className="utility-button" onClick={() => update({ carryforwards: [...(current.carryforwards ?? []), { originTaxYear: "", amount: "" }], carryforwardHistoryConfirmed: null })}>Add adoption carryforward</button>
      <BooleanFact label="Have all prior adoption-credit carryforwards been reviewed, including none if applicable?" value={current.carryforwardHistoryConfirmed} onChange={(value) => update({ carryforwardHistoryConfirmed: value })} />
      {(current.carryforwards?.length ?? 0) > 0 && <BooleanFact label="Do carryforwards reconcile to the corrected 2025 refundable-credit worksheet?" value={current.carryforwardReconciled2025} onChange={(value) => update({ carryforwardReconciled2025: value })} />}
    </fieldset>}
  </div>;
}
