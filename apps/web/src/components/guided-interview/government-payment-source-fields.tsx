"use client";

import { parseGuidedCurrency } from "@/lib/guided-currency";
import { governmentOtherAmounts, type UnemploymentEntryData } from "@/lib/guided-unemployment-facts";
import { CurrencyField } from "./currency-field";

const parseGuidedCurrencySafe = (value?: string) => { try { return parseGuidedCurrency(value).gt(0); } catch { return false; } };
function Fact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={event => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}
function Text({ label, value, onChange }: { label: string; value: string | undefined; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" value={value ?? ""} onChange={event => onChange(event.target.value)} /></label>;
}
export function GovernmentPaymentSourceFields({ entry, onChange }: { entry: UnemploymentEntryData; onChange: (change: Partial<UnemploymentEntryData>) => void }) {
  return <>
    <Text label="Actual government payer" value={entry.payer} onChange={payer => onChange({ payer })} />
    <Text label="Government payer TIN" value={entry.payerTin} onChange={payerTin => onChange({ payerTin })} />
    <Text label="Government statement reference (local label or last four account digits)" value={entry.accountReference} onChange={accountReference => onChange({ accountReference })} />
    <Text label="Government statement calendar year" value={entry.sourceTaxYear} onChange={sourceTaxYear => onChange({ sourceTaxYear })} />
    <label className="guided-field"><span className="guided-field-label">Actual Form 1099-G revision</span><select className="guided-input" value={entry.sourceFormRevision ?? ""} onChange={event => onChange({ sourceFormRevision: event.target.value })}><option value="">Check the source form revision</option><option value="2024-03">March 2024 continuous-use form</option><option value="2026-12">December 2026 form</option></select><span className="guided-field-hint">The revision is separate from the calendar year. Use the actual form; statement collection does not establish final-year filing availability.</span></label>
    <label className="guided-field"><span className="guided-field-label">Actual government-payment recipient</span><select className="guided-input" value={entry.accountHolder ?? ""} onChange={event => onChange({ accountHolder: event.target.value as UnemploymentEntryData["accountHolder"] })}><option value="">Choose actual recipient</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on this joint return</option></select></label>
    <Text label="Last four digits of the government-payment recipient ID" value={entry.recipientTaxIdLast4} onChange={recipientTaxIdLast4 => onChange({ recipientTaxIdLast4 })} />
    <label className="guided-field"><span className="guided-field-label">Actual payment program</span><select className="guided-input" value={entry.programType ?? ""} onChange={event => onChange({ programType: event.target.value as UnemploymentEntryData["programType"] })}><option value="">Choose from actual program records</option><option value="government-unemployment">Government unemployment compensation</option><option value="employer-supplemental">Employer supplemental benefits</option><option value="private-or-union">Private or union program</option><option value="other-government">Other government payments</option></select></label>
    <Fact label="Do these payments actually belong to this recipient?" value={entry.actualReceiptConfirmed} onChange={actualReceiptConfirmed => onChange({ actualReceiptConfirmed })} />
    <CurrencyField label="Unemployment compensation (1099-G Box 1)" hint="Copy the original gross source amount before withholding; keep repayments separately below." value={entry.compensation} onChange={compensation => onChange({ compensation })} required />
    <CurrencyField label="Federal tax withheld (1099-G Box 4)" hint="Blank is unknown. Enter zero only when the source establishes no withholding." value={entry.federalWithheld} onChange={federalWithheld => onChange({ federalWithheld })} required />
    {governmentOtherAmounts.map(([field, label]) => <CurrencyField key={field} label={label} value={entry[field] ?? ""} onChange={value => onChange({ [field]: value })} required />)}
    <details className="guided-w2-details"><summary>Repayment and contribution records</summary><div className="guided-form-grid">
      <p className="guided-hint">Complete these from actual payment and program records when benefits were repaid or the program has unrecovered nondeductible contributions. Use the same program reference and opening balance on linked statements; include all payments for that program.</p>
      <CurrencyField label="Actual benefits received before this year's repayment" value={entry.unemploymentReceivedBeforeRepayment ?? ""} onChange={unemploymentReceivedBeforeRepayment => onChange({ unemploymentReceivedBeforeRepayment })} />
      <Fact label="Does Box 1 include the benefits you repaid this year?" value={entry.box1IncludesCurrentYearRepayment} onChange={box1IncludesCurrentYearRepayment => onChange({ box1IncludesCurrentYearRepayment })} />
      <Text label="Actual current-year repayment source reference" value={entry.repaymentSourceReference} onChange={repaymentSourceReference => onChange({ repaymentSourceReference })} />
      {parseGuidedCurrencySafe(entry.priorYearRepaid) && <>
        <p className="guided-hint">When total earlier-year repayments on this return are over $3,000, the return uses a Schedule A deduction or a credit, whichever gives less tax. A total of $3,000 or less is not deductible. Enter the same two tax figures on each statement repaying income from the same earlier return.</p>
        <Text label="Earlier year that included the repaid income" value={entry.priorRepaymentOriginalYear} onChange={priorRepaymentOriginalYear => onChange({ priorRepaymentOriginalYear, priorRepaymentConfirmed: null })} />
        <CurrencyField label="Tax shown on that earlier return" value={entry.priorRepaymentEarlierTax ?? ""} onChange={priorRepaymentEarlierTax => onChange({ priorRepaymentEarlierTax, priorRepaymentConfirmed: null })} />
        <Fact label="This person filed a separate return for that year" value={entry.priorRepaymentSeparateReturn} onChange={priorRepaymentSeparateReturn => onChange({ priorRepaymentSeparateReturn, priorRepaymentConfirmed: null })} />
        <CurrencyField label="That earlier tax refigured without all income repaid from that return" value={entry.priorRepaymentRefiguredTax ?? ""} onChange={priorRepaymentRefiguredTax => onChange({ priorRepaymentRefiguredTax, priorRepaymentConfirmed: null })} />
        <Text label="Earlier return record reference" value={entry.priorRepaymentReference} onChange={priorRepaymentReference => onChange({ priorRepaymentReference, priorRepaymentConfirmed: null })} />
        <Fact label="Earlier return figures checked after the last edit" value={entry.priorRepaymentConfirmed} onChange={priorRepaymentConfirmed => onChange({ priorRepaymentConfirmed })} />
      </>}
      <Text label="Actual unemployment contribution program reference" value={entry.contributionProgramId} onChange={contributionProgramId => onChange({ contributionProgramId })} />
      <Text label="Actual contribution history source reference" value={entry.contributionHistoryReference} onChange={contributionHistoryReference => onChange({ contributionHistoryReference })} />
      <Fact label="Has the available nondeductible contribution balance been reconciled?" value={entry.contributionBalanceReconciled} onChange={contributionBalanceReconciled => onChange({ contributionBalanceReconciled })} />
      <Fact label="Are all this recipient's payments from this contribution program included?" value={entry.allProgramPaymentsIncluded} onChange={allProgramPaymentsIncluded => onChange({ allProgramPaymentsIncluded })} />
    </div></details>
    <label className="guided-field"><span className="guided-field-label">Actual taxable grant classification</span><select className="guided-input" value={entry.grantIncomeCategory ?? ""} onChange={event => onChange({ grantIncomeCategory: event.target.value as UnemploymentEntryData["grantIncomeCategory"] })}><option value="">Choose if a taxable grant is reported</option><option value="nonbusiness">Nonbusiness taxable grant</option><option value="business">Business grant — separate worksheet</option><option value="farm">Farm grant — separate worksheet</option></select></label>
    <Text label="Actual tax year of the Box 2 refund, when any" value={entry.refundTaxYear} onChange={refundTaxYear => onChange({ refundTaxYear })} />
    <Text label="Actual year refunded taxes were paid and deducted" value={entry.refundExpenseTaxYear} onChange={refundExpenseTaxYear => onChange({ refundExpenseTaxYear })} />
    <Fact label="Is Box 8 checked for a trade or business refund?" value={entry.tradeOrBusinessRefund} onChange={tradeOrBusinessRefund => onChange({ tradeOrBusinessRefund })} />
    {(entry.sourceTaxYear === "2026" || entry.sourceFormRevision === "2026-12" || entry.familyLeaveBenefits != null) && <>
      <CurrencyField label="Family leave benefits (2026 Box 10)" value={entry.familyLeaveBenefits ?? ""} onChange={familyLeaveBenefits => onChange({ familyLeaveBenefits })} required />
      <label className="guided-field"><span className="guided-field-label">Actual family-leave program classification</span><select className="guided-input" value={entry.familyLeaveProgramType ?? ""} onChange={event => onChange({ familyLeaveProgramType: event.target.value as UnemploymentEntryData["familyLeaveProgramType"] })}><option value="">Choose if benefits are reported</option><option value="state-pfml-family">State paid family leave</option><option value="state-pfml-medical">State medical leave — separate worksheet</option><option value="private-family-leave">Private family leave — separate worksheet</option></select></label>
    </>}
    <label className="guided-field"><span className="guided-field-label">Government source state reporting</span><select className="guided-input" value={entry.stateTaxReporting ?? ""} onChange={event => onChange({ stateTaxReporting: event.target.value as UnemploymentEntryData["stateTaxReporting"] })}><option value="">Check the actual source state section</option><option value="none">No state section reported</option><option value="single">One state reported</option><option value="multiple">Multiple states reported</option></select></label>
    {(entry.stateTaxReporting === "single" || entry.state || entry.stateWithheld || entry.statePayerId) && <>
      <Text label="Actual state on the government statement" value={entry.state} onChange={state => onChange({ state })} />
      <Text label="State payer identification number, when reported" value={entry.statePayerId} onChange={statePayerId => onChange({ statePayerId })} />
      <CurrencyField label={`Government source state withholding (${entry.sourceFormRevision === "2026-12" ? "Box 12" : "Box 11"})`} value={entry.stateWithheld ?? ""} onChange={stateWithheld => onChange({ stateWithheld })} required />
    </>}
    <Fact label="Is another government-payment taxability or repayment worksheet still needed?" value={entry.additionalWorksheetRequired} onChange={additionalWorksheetRequired => onChange({ additionalWorksheetRequired })} />
    <Fact label="Have you checked this government-payment source after the last edit?" value={entry.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ sourceFactsConfirmed })} />
  </>;
}
