"use client";

import { emptyEducatorSource, emptyEducatorSchool, emptyEducatorExpense, type EducatorSourceData, type EducatorSchoolData, type EducatorExpenseData } from "@/lib/guided-educator-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

function Choice({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></label>;
}

const reductionLabels = [
  ["reimbursementsNotInWages", "Reimbursements outside W-2 wages for these expenses"],
  ["excludedSavingsBondInterest", "Excludable savings-bond interest from Form 8815"],
  ["nontaxableQualifiedTuitionProgramAmount", "Nontaxable QTP amount from the educator worksheet"],
  ["nontaxableCoverdellEarnings", "Nontaxable Coverdell earnings"],
] as const;

export function EducatorSourceDetails({ sources = [], taxYear, onChange }: { sources?: EducatorSourceData[]; taxYear?: number | null; onChange: (sources: EducatorSourceData[]) => void }) {
  const update = (index: number, patch: Partial<EducatorSourceData>) => onChange(sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, ...patch, ...(Object.keys(patch).every(key => key === "sourceFactsConfirmed") ? {} : { sourceFactsConfirmed: null }) } : source));
  return <section>
    <h4>Educator expense sources</h4>
    <p className="guided-hint">Enter each educator's actual school-year work and calendar-year paid expenses. The income adjustment is limited to {taxYear === 2026 ? "$350" : taxYear === 2025 ? "$300" : "the selected year's limit"} per eligible educator. A joint return uses each person's separate limit.</p>
    <p className="guided-hint">Use the actual educator worksheet amounts for education exclusions. Do not copy a gross Form 1099-Q distribution or assume missing reimbursements are zero. These sources establish the income adjustment; the separate 2026 itemized educator deduction needs its own qualification.</p>
    {sources.map((source, index) => {
      const prefix = `Educator ${index + 1}`;
      const updateSchool = (schoolIndex: number, patch: Partial<EducatorSchoolData>) => update(index, { schools: source.schools.map((school, position) => position === schoolIndex ? { ...school, ...patch } : school) });
      const updateExpense = (expenseIndex: number, patch: Partial<EducatorExpenseData>) => update(index, { expenses: source.expenses.map((expense, position) => position === expenseIndex ? { ...expense, ...patch } : expense) });
      return <fieldset className="guided-expand-body" key={index}>
        <legend>{prefix}</legend>
        <div className="guided-form-grid">
          <Choice label={`${prefix}: Actual educator`} value={source.accountHolder} options={[["primary", "Taxpayer"], ["spouse", "Spouse"]]} onChange={accountHolder => update(index, { accountHolder: accountHolder as EducatorSourceData["accountHolder"] })} />
          <TextFact label={`${prefix}: Tax year of paid expenses`} value={source.taxYear} onChange={taxYear => update(index, { taxYear })} />
          <TextFact label={`${prefix}: Actual school year (YYYY-YYYY)`} value={source.schoolYear} onChange={schoolYear => update(index, { schoolYear })} />
        </div>
        <p className="guided-hint">Count nonoverlapping hours for the same school year. The income adjustment covers K-12 teachers, instructors, counselors, principals and aides who worked at least 900 hours at eligible schools. Home schooling does not qualify.</p>
        {(source.schools ?? []).map((school, schoolIndex) => {
          const label = `${prefix}, school ${schoolIndex + 1}`;
          return <div key={schoolIndex} className="guided-form-grid">
            <TextFact label={`${label}: School name`} value={school.name} onChange={name => updateSchool(schoolIndex, { name })} />
            <Choice label={`${label}: Actual role`} value={school.role} options={[["teacher", "Teacher"], ["instructor", "Instructor"], ["counselor", "Counselor"], ["principal", "Principal"], ["aide", "Aide"], ["other", "Other role"]]} onChange={role => updateSchool(schoolIndex, { role: role as EducatorSchoolData["role"] })} />
            <BooleanFact label={`${label}: The school provides K-12 education under state law`} value={school.schoolEligible} onChange={schoolEligible => updateSchool(schoolIndex, { schoolEligible })} />
            <TextFact label={`${label}: Actual nonoverlapping hours in this school year`} value={school.hoursWorked} onChange={hoursWorked => updateSchool(schoolIndex, { hoursWorked })} />
            <button type="button" onClick={() => update(index, { schools: source.schools.filter((_, position) => position !== schoolIndex) })}>{label}: Remove school</button>
          </div>;
        })}
        <button type="button" onClick={() => update(index, { schools: [...source.schools, { ...emptyEducatorSchool }] })}>{prefix}: Add school</button>
        {(source.expenses ?? []).map((expense, expenseIndex) => {
          const label = `${prefix}, expense ${expenseIndex + 1}`;
          return <div key={expenseIndex} className="guided-form-grid">
            <TextFact label={`${label}: Receipt or source reference`} value={expense.sourceId} onChange={sourceId => updateExpense(expenseIndex, { sourceId })} />
            <TextFact label={`${label}: Actual payment date`} type="date" value={expense.datePaid} onChange={datePaid => updateExpense(expenseIndex, { datePaid })} />
            <TextFact label={`${label}: Expense description`} value={expense.description} onChange={description => updateExpense(expenseIndex, { description })} />
            <Choice label={`${label}: Expense category`} value={expense.category} options={[["classroom", "Classroom books, supplies or equipment"], ["professional_development", "Professional development course"], ["protective_supplies", "Coronavirus protective or disinfecting supplies"], ["other", "Other expense"]]} onChange={category => updateExpense(expenseIndex, { category: category as EducatorExpenseData["category"] })} />
            <CurrencyField label={`${label}: Actual paid cost`} value={expense.amount} onChange={amount => updateExpense(expenseIndex, { amount })} />
            <BooleanFact label={`${label}: Ordinary and necessary for this educator's work`} value={expense.ordinaryAndNecessary} onChange={ordinaryAndNecessary => updateExpense(expenseIndex, { ordinaryAndNecessary })} />
            <p className="guided-hint">Qualifying use means classroom use for materials, a course related to the curriculum or students taught for professional development, or supplies preventing coronavirus spread. Keep costs used for another deduction or credit separate.</p>
            <BooleanFact label={`${label}: The expense meets the stated qualifying use`} value={expense.qualifyingUse} onChange={qualifyingUse => updateExpense(expenseIndex, { qualifyingUse })} />
            <BooleanFact label={`${label}: These are supplies for health or physical education`} value={expense.healthOrPhysicalEducation} onChange={healthOrPhysicalEducation => updateExpense(expenseIndex, { healthOrPhysicalEducation })} />
            {expense.healthOrPhysicalEducation === true && <BooleanFact label={`${label}: These are athletic supplies`} value={expense.athleticSupplies} onChange={athleticSupplies => updateExpense(expenseIndex, { athleticSupplies })} />}
            <BooleanFact label={`${label}: This cost was deducted or used for another tax benefit`} value={expense.deductedElsewhere} onChange={deductedElsewhere => updateExpense(expenseIndex, { deductedElsewhere })} />
            <button type="button" onClick={() => update(index, { expenses: source.expenses.filter((_, position) => position !== expenseIndex) })}>{label}: Remove expense</button>
          </div>;
        })}
        <button type="button" onClick={() => update(index, { expenses: [...source.expenses, { ...emptyEducatorExpense }] })}>{prefix}: Add paid expense</button>
        <div className="guided-form-grid">
          {reductionLabels.map(([field, label]) => <CurrencyField key={field} label={`${prefix}: ${label}`} value={source[field]} onChange={value => update(index, { [field]: value })} />)}
          <BooleanFact label={`${prefix}: Sources checked after the last edit`} value={source.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update(index, { sourceFactsConfirmed })} />
        </div>
        <button type="button" onClick={() => onChange(sources.filter((_, position) => position !== index))}>{prefix}: Remove worksheet</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => onChange([...sources, { ...emptyEducatorSource, schools: [], expenses: [] }])}>Add educator worksheet</button>
  </section>;
}
