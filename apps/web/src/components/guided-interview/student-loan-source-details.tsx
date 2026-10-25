"use client";

import { emptyStudentLoanFacts, emptyStudentLoanSource, hasSavedStudentLoanStatement, type StudentLoanData, type StudentLoanSourceData } from "@/lib/guided-student-loan-facts";
import type { EducationDistributionData } from "@/lib/guided-education-distributions";
import type { FilingStatus } from "@/lib/guided-interview-flow";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{choices.map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></label>;
}
const qualificationLabels = [
  ["paymentsInTaxYearConfirmed", "This interest was actually paid in the selected tax year"],
  ["legallyObligated", "This borrower is legally obligated to pay this loan"],
  ["solelyQualifiedEducationExpenses", "The loan was solely for qualified education expenses"],
  ["eligibleInstitutionAtOrigination", "The institution was eligible when the loan was made"],
  ["enrolledAtLeastHalfTime", "The student was enrolled at least half time"],
  ["pursuingCredential", "The student was pursuing a degree, certificate or recognized credential"],
  ["expensesWithinReasonablePeriod", "Expenses were paid within a reasonable period of borrowing"],
  ["relatedLender", "The loan was from a related person under the student-loan rules"],
  ["employerPlanLoan", "The loan was from a qualified employer plan"],
] as const;
const reductions = [
  ["employerAssistanceExcluded", "Interest paid by employer assistance excluded from income"],
  ["otherTaxFreeAssistance", "Interest paid by other tax-free loan assistance"],
  ["interestDeductibleElsewhere", "Interest deductible elsewhere on this return"],
  ["qtpTaxFreeEarningsUsedForInterest", "Tax-free 529 earnings used for this loan's interest"],
] as const;

export function StudentLoanSourceDetails({ data, filingStatus, educationDistributions, onChange }: { data?: StudentLoanData; filingStatus?: FilingStatus | null; educationDistributions?: EducationDistributionData; onChange: (data: StudentLoanData) => void }) {
  if (!data) return <section><h4>Student-loan interest sources</h4><p className="guided-hint">Use actual lender statements, payment records and the loan's original education facts. Eligibility and the return's income determine the deduction.</p><button type="button" onClick={() => onChange({ ...emptyStudentLoanFacts, loans: [] })}>Add student-loan worksheet</button></section>;
  const update = (patch: Partial<StudentLoanData>) => onChange({ ...data, ...patch, ...(Object.keys(patch).every(key => key === "sourceFactsConfirmed") ? {} : { sourceFactsConfirmed: null }) });
  const updateLoan = (index: number, patch: Partial<StudentLoanSourceData>) => update({ loans: (data.loans ?? []).map((loan, position) => position === index ? { ...loan, ...patch } : loan) });
  const borrowers = (educationDistributions?.loanBorrowers ?? []).filter(record => typeof record.id === "string").map((record, index) => [String(record.id), typeof record.name === "string" && record.name.trim() ? record.name : `Education borrower ${index + 1}`] as const);
  const expenses = (educationDistributions?.expenses ?? []).filter(record => record.category === "student_loan" && typeof record.id === "string");
  return <section>
    <h4>Student-loan interest sources</h4>
    <p className="guided-hint">Enter amounts actually paid during this tax year, including explicit zero where your records establish none. Leave unknown answers blank. Review original loan qualification in <a href="https://www.irs.gov/publications/p970" target="_blank" rel="noreferrer">IRS Publication 970, chapter 4</a>.</p>
    <div className="guided-form-grid">
      <TextFact label="Student-loan source tax year" value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <BooleanFact label="Someone actually claims you as a dependent for this tax year" value={data.primaryClaimedAsDependent} onChange={primaryClaimedAsDependent => update({ primaryClaimedAsDependent })} />
      {(filingStatus === "mfj" || typeof data.spouseClaimedAsDependent === "boolean") && <BooleanFact label="Someone actually claims your spouse as a dependent for this tax year" value={data.spouseClaimedAsDependent} onChange={spouseClaimedAsDependent => update({ spouseClaimedAsDependent })} />}
      <CurrencyField label="Puerto Rico income excluded for the student-loan MAGI worksheet" value={data.puertoRicoIncomeExclusion} onChange={puertoRicoIncomeExclusion => update({ puertoRicoIncomeExclusion })} />
      <CurrencyField label="American Samoa income excluded for the student-loan MAGI worksheet" value={data.americanSamoaIncomeExclusion} onChange={americanSamoaIncomeExclusion => update({ americanSamoaIncomeExclusion })} />
    </div>
    {(data.loans ?? []).map((loan, index) => {
      const prefix = `Loan ${index + 1}`;
      const linkedBorrower = borrowers.some(([id]) => id === loan.borrowerId);
      return <fieldset className="guided-expand-body" key={index}>
        <legend>{prefix}</legend>
        <div className="guided-form-grid">
          <TextFact label={`${prefix}: Loan or source label`} value={loan.sourceId} onChange={sourceId => updateLoan(index, { sourceId })} />
          {!linkedBorrower && <TextFact label={`${prefix}: Borrower label`} value={loan.borrowerId} onChange={borrowerId => updateLoan(index, { borrowerId })} />}
          {borrowers.length > 0 && <Choice label={`${prefix}: Link an existing education borrower`} value={linkedBorrower ? loan.borrowerId : ""} choices={borrowers} onChange={borrowerId => updateLoan(index, { borrowerId })} />}
          <Choice label={`${prefix}: Borrower on this return`} value={loan.accountHolder} choices={[["primary", "You"], ["spouse", "Spouse"]]} onChange={accountHolder => updateLoan(index, { accountHolder: accountHolder as StudentLoanSourceData["accountHolder"] })} />
          <TextFact label={`${prefix}: Lender or servicer name`} value={loan.lender} onChange={lender => updateLoan(index, { lender })} />
          <Choice label={`${prefix}: Actual interest source`} value={loan.sourceKind} choices={[["form1098e", "Form 1098-E"], ["lender_statement", "Other lender statement"], ["payment_records", "Payment records"]]} onChange={sourceKind => updateLoan(index, { sourceKind: sourceKind as StudentLoanSourceData["sourceKind"] })} />
          <TextFact label={`${prefix}: Original loan date`} type="date" value={loan.loanOriginationDate} onChange={loanOriginationDate => updateLoan(index, { loanOriginationDate })} />
          <CurrencyField label={`${prefix}: Actual paid interest allocated to this loan`} hint="Allocate original Box 1 if one statement covers several loans. Keep the statement total below unchanged." value={loan.interestPaid} onChange={interestPaid => updateLoan(index, { interestPaid })} />
        </div>
        {(loan.sourceKind === "form1098e" || hasSavedStudentLoanStatement(loan)) && <div className="guided-form-grid">
          <TextFact label={`${prefix}: Original Form 1098-E statement label`} value={loan.form1098ESourceId} onChange={form1098ESourceId => updateLoan(index, { form1098ESourceId })} />
          <TextFact label={`${prefix}: Original Form 1098-E tax year`} value={loan.form1098ETaxYear} onChange={form1098ETaxYear => updateLoan(index, { form1098ETaxYear })} />
          <CurrencyField label={`${prefix}: Original Form 1098-E Box 1 total`} value={loan.form1098EBox1} onChange={form1098EBox1 => updateLoan(index, { form1098EBox1 })} />
          <BooleanFact label={`${prefix}: Box 2 is checked because Box 1 excludes origination fees or capitalized interest`} value={loan.box2ExcludesOriginationFeesOrCapitalizedInterest} onChange={box2ExcludesOriginationFeesOrCapitalizedInterest => updateLoan(index, { box2ExcludesOriginationFeesOrCapitalizedInterest })} />
          <button type="button" onClick={() => updateLoan(index, { form1098ESourceId: "", form1098ETaxYear: "", form1098EBox1: "", box2ExcludesOriginationFeesOrCapitalizedInterest: null })}>{prefix}: Clear saved Form 1098-E details</button>
        </div>}
        <div className="guided-form-grid">
          <CurrencyField label={`${prefix}: Additional qualified interest outside the amount above`} hint="Include separately documented qualifying fees or capitalized interest actually paid. Exclude charges for lender services and amounts already reported above." value={loan.additionalInterestPaid} onChange={additionalInterestPaid => updateLoan(index, { additionalInterestPaid })} />
          <TextFact label={`${prefix}: Additional interest source reference`} value={loan.additionalInterestSourceReference} onChange={additionalInterestSourceReference => updateLoan(index, { additionalInterestSourceReference })} />
          <BooleanFact label={`${prefix}: Additional interest qualification and nonduplication checked`} value={loan.additionalInterestQualificationConfirmed} onChange={additionalInterestQualificationConfirmed => updateLoan(index, { additionalInterestQualificationConfirmed })} />
          <Choice label={`${prefix}: Student relationship to borrower when the loan was made`} value={loan.studentRelationshipAtOrigination} choices={[["self", "Borrower"], ["spouse", "Borrower's spouse"], ["dependent", "Dependent under Pub. 970's loan rules"], ["other", "Other person"]]} onChange={studentRelationshipAtOrigination => updateLoan(index, { studentRelationshipAtOrigination: studentRelationshipAtOrigination as StudentLoanSourceData["studentRelationshipAtOrigination"] })} />
          {qualificationLabels.map(([field, label]) => <BooleanFact key={field} label={`${prefix}: ${label}`} value={loan[field]} onChange={value => updateLoan(index, { [field]: value })} />)}
          {reductions.map(([field, label]) => <CurrencyField key={field} label={`${prefix}: ${label}`} value={loan[field]} onChange={value => updateLoan(index, { [field]: value })} />)}
          <BooleanFact label={`${prefix}: These benefit reductions are separate and do not overlap`} value={loan.reductionsDistinctConfirmed} onChange={reductionsDistinctConfirmed => updateLoan(index, { reductionsDistinctConfirmed })} />
        </div>
        <p className="guided-hint">For a 529 loan payment, enter its actual education distribution and expense records in Credits, then link that expense here. The calculated excluded earnings must reconcile with the amount above.</p>
        {expenses.map((expense, expenseIndex) => {
          const id = String(expense.id);
          return <label className="guided-field" key={id}><span className="guided-field-label">{prefix}: Link education loan-payment expense {expenseIndex + 1}</span><input type="checkbox" checked={(loan.educationExpenseIds ?? []).includes(id)} onChange={event => updateLoan(index, { educationExpenseIds: event.target.checked ? [...(loan.educationExpenseIds ?? []), id] : (loan.educationExpenseIds ?? []).filter(value => value !== id) })} /></label>;
        })}
        {(loan.educationExpenseIds ?? []).filter(id => !expenses.some(expense => expense.id === id)).map(id => <div key={id}><p className="guided-hint">A saved education expense link has no matching record. Restore the original expense or remove this link after checking the sources.</p><button type="button" onClick={() => updateLoan(index, { educationExpenseIds: (loan.educationExpenseIds ?? []).filter(value => value !== id) })}>{prefix}: Remove missing expense link</button></div>)}
        <button type="button" onClick={() => update({ loans: (data.loans ?? []).filter((_, position) => position !== index) })}>{prefix}: Remove loan</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => update({ loans: [...(data.loans ?? []), { ...emptyStudentLoanSource, educationExpenseIds: [] }] })}>Add student loan</button>
    <BooleanFact label="Student-loan sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
  </section>;
}
