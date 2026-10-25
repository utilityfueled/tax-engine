"use client";
import { businessSourceAmounts, type BusinessSourceData } from "@/lib/guided-business-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

export function BusinessSourceDetails({ data = {}, onChange }: { data?: BusinessSourceData; onChange: (data: BusinessSourceData) => void }) {
  const patch = (next: Partial<BusinessSourceData>) => onChange({ ...data, ...next });
  return <fieldset className="guided-fieldset"><legend>Actual business and expense facts</legend>
    <p className="guided-hint">Keep each business and owner separate. This interview currently supports one business activity. Blank amounts are unknown; enter 0 only after checking the actual records.</p>
    <label className="guided-field"><span className="guided-field-label">Business owner</span><select className="guided-input" value={data.accountHolder ?? ""} onChange={event => patch({ accountHolder: event.target.value as BusinessSourceData["accountHolder"] })}><option value="">Not answered</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on a joint return</option><option value="joint">Joint ownership requiring separate calculations</option></select></label>
    <TextFact label="Actual business activity" value={data.activityDescription ?? ""} onChange={activityDescription => patch({ activityDescription })} />
    <TextFact label="Business name, if different from your name" value={data.businessName ?? ""} onChange={businessName => patch({ businessName })} />
    <TextFact label="Six-digit principal business activity code" value={data.businessCode ?? ""} onChange={businessCode => patch({ businessCode })} />
    <TextFact label="Business EIN, if issued" value={data.ein ?? ""} onChange={ein => patch({ ein })} />
    <label className="guided-field"><span className="guided-field-label">Actual accounting method</span><select className="guided-input" value={data.accountingMethod ?? ""} onChange={event => patch({ accountingMethod: event.target.value as BusinessSourceData["accountingMethod"] })}><option value="">Not answered</option><option value="cash">Cash</option><option value="accrual">Accrual</option></select></label>
    <BooleanFact label="Do all amounts in this section belong to this one business and owner?" value={data.singleBusinessConfirmed} onChange={singleBusinessConfirmed => patch({ singleBusinessConfirmed })} />
    {businessSourceAmounts.map(([field, label]) => <CurrencyField key={field} label={label} value={data[field] ?? ""} onChange={value => patch({ [field]: value, expensesReconciled: null, ...(field === "returnsAndAllowances" || field === "costOfGoodsSold" || field === "otherIncome" ? { incomeReconciled: null } : {}) })} />)}
    <TextFact label="Description of other deductible business expenses" value={data.otherExpenseDescription ?? ""} onChange={otherExpenseDescription => patch({ otherExpenseDescription, expensesReconciled: null })} />
    <BooleanFact label="Is this a specified service trade or business for section 199A?" value={data.isSST} onChange={isSST => patch({ isSST })} />
    <BooleanFact label="Is all your investment in this activity at risk under section 465?" value={data.allInvestmentAtRisk} onChange={allInvestmentAtRisk => patch({ allInvestmentAtRisk })} />
    <BooleanFact label="Does this activity require other unsupported worksheets, such as home-office, passive-loss, accounting-method-change or special income exclusions?" value={data.additionalWorksheetRequired} onChange={additionalWorksheetRequired => patch({ additionalWorksheetRequired })} />
    <BooleanFact label="Are the meal amounts eligible business meals subject to the ordinary 50% limit?" value={data.mealsEligibilityConfirmed} onChange={mealsEligibilityConfirmed => patch({ mealsEligibilityConfirmed })} />
    <BooleanFact label="Does the car and truck amount come from your actual deductible vehicle worksheet?" value={data.carExpenseWorksheetConfirmed} onChange={carExpenseWorksheetConfirmed => patch({ carExpenseWorksheetConfirmed })} />
    <BooleanFact label="Does the depreciation amount come from your actual depreciation and section 179 worksheet?" value={data.depreciationWorksheetConfirmed} onChange={depreciationWorksheetConfirmed => patch({ depreciationWorksheetConfirmed })} />
    <BooleanFact label="Have you reconciled receipts with all source forms and excluded duplicate income from the manual total?" value={data.incomeReconciled} onChange={incomeReconciled => patch({ incomeReconciled })} />
    <BooleanFact label="Have you checked every expense amount, business use and deduction qualification against the records?" value={data.expensesReconciled} onChange={expensesReconciled => patch({ expensesReconciled })} />
    <p className="guided-hint">Meal amounts are the full eligible cost before the 50% limit. Vehicle and depreciation amounts are the completed deductible worksheet amounts. Personal, reimbursed and capital costs cannot be treated as ordinary expenses. Known unsupported facts stay saved for review.</p>
  </fieldset>;
}
