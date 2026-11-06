"use client";
import { paRentalAmountFields, paRentalWorksheetQuestions, type PARentalIncomeExpensesData } from "@/lib/guided-pa-rental-facts";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

export function PARentalExpenseDetails({ value, onChange }: { value?: PARentalIncomeExpensesData; onChange: (patch: PARentalIncomeExpensesData) => void }) {
  return <fieldset className="guided-expand-body">
    <legend className="guided-field-label">Pennsylvania income and expenses</legend>
    <p className="guided-hint">Use the actual PA worksheet for this property. Enter the rental-use amounts before ownership allocation, including checked zeros. PA depreciation, prepaid interest and travel deductions can differ from federal amounts. Exclude personal costs, your own labor, capital improvements and income taxes.</p>
    <div className="guided-form-grid">
      <TextFact label="PA worksheet tax year" value={value?.taxYear ?? ""} onChange={taxYear => onChange({ taxYear })} />
      <TextFact label="PA income and expense source reference" value={value?.sourceReference ?? ""} onChange={sourceReference => onChange({ sourceReference })} />
      {paRentalAmountFields.map(([field, label]) => <CurrencyField key={field} label={label} value={value?.[field] ?? ""} onChange={amount => onChange({ [field]: amount })} />)}
      <TextFact label="PA depreciation worksheet reference" value={value?.depreciationSourceReference ?? ""} onChange={depreciationSourceReference => onChange({ depreciationSourceReference })} />
      <TextFact label="PA rental and personal-use allocation reference" value={value?.allocationSourceReference ?? ""} onChange={allocationSourceReference => onChange({ allocationSourceReference })} />
      <TextFact label="Itemized other PA rental expenses" value={value?.otherExpenseDescription ?? ""} onChange={otherExpenseDescription => onChange({ otherExpenseDescription })} />
    </div>
    <p className="guided-hint">PA depreciation excludes federal bonus depreciation. Assets with different PA and federal bases require straight-line depreciation. Supply the completed PA worksheet for a positive amount.</p>
    {paRentalWorksheetQuestions.map(([field, label]) => <BooleanFact key={field} label={label} value={value?.[field]} onChange={answer => onChange({ [field]: answer })} />)}
    <BooleanFact label="Have you checked the PA income and expense worksheet after the latest edits?" value={value?.factsConfirmed} onChange={factsConfirmed => onChange({ factsConfirmed })} />
  </fieldset>;
}
