"use client";
import type { DividendEntryData, InterestEntryData } from "@/lib/guided-interview-flow";
import { dividendSourceAmounts, interestSourceAmounts, type InvestmentSourceData } from "@/lib/guided-investment-facts";
import { CurrencyField } from "./currency-field";
import { TextFact } from "./fact-fields";

export function InvestmentSourceIdentity({ data, onChange }: { data: InvestmentSourceData; onChange: (data: Partial<InvestmentSourceData>) => void }) {
  return <fieldset className="guided-fieldset"><legend>Actual source identity and state</legend>
    <label className="guided-field"><span className="guided-field-label">Investment income owner</span><select className="guided-input" value={data.accountHolder ?? ""} onChange={event => onChange({ accountHolder: event.target.value as InvestmentSourceData["accountHolder"] })}><option value="">Not answered</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on a joint return</option><option value="joint">Joint account requiring allocation</option></select></label>
    <TextFact label="Actual payer or broker TIN, if available" value={data.payerTin ?? ""} onChange={payerTin => onChange({ payerTin })} />
    <TextFact label="Actual investment account reference, if available" value={data.accountReference ?? ""} onChange={accountReference => onChange({ accountReference })} />
    <label className="guided-field"><span className="guided-field-label">State reporting on this investment form</span><select className="guided-input" value={data.stateTaxReporting ?? ""} onChange={event => onChange({ stateTaxReporting: event.target.value as InvestmentSourceData["stateTaxReporting"] })}><option value="">Not answered</option><option value="none">No state section reported</option><option value="single">One state reported</option><option value="multiple">Multiple states reported</option></select></label>
    <TextFact label="Actual source state" value={data.state ?? ""} onChange={state => onChange({ state: state.toUpperCase() })} />
    <CurrencyField label="State income tax withheld on this form" value={data.stateWithheld ?? ""} onChange={stateWithheld => onChange({ stateWithheld })} hint="Do not enter this amount again as additional state withholding. Joint accounts and multiple states need actual separate allocations before calculation." />
  </fieldset>;
}

export function InterestSourceDetails({ data, onChange }: { data: InterestEntryData; onChange: (field: keyof InterestEntryData, value: string) => void }) {
  return <details className="guided-expand"><summary className="guided-expand-trigger">Remaining actual 1099-INT boxes</summary><div className="guided-expand-body">
    <p className="guided-hint">Check every box and enter 0 only when your actual form confirms no amount. Unknown stays unanswered. Complete the preference worksheet for positive Box 9. Bond premiums and market discount still need separate recipient worksheets.</p>
    {interestSourceAmounts.filter(([field]) => field !== "interestIncome" && field !== "federalWithheld").map(([field, label]) => <CurrencyField key={field} label={label} value={data[field] ?? ""} onChange={value => onChange(field, value)} />)}
    <TextFact label="Box 7 foreign country or territory" value={data.foreignCountry ?? ""} onChange={value => onChange("foreignCountry", value)} />
    <PrivateActivitySourceDetails data={data} onChange={onChange} />
  </div></details>;
}

export function DividendSourceDetails({ data, onChange }: { data: DividendEntryData; onChange: (field: keyof DividendEntryData, value: string) => void }) {
  const existing = new Set(["ordinaryDividends", "qualifiedDividends", "capitalGainDistributions", "federalWithheld", "section199ADividends", "foreignTaxPaid"]);
  return <details className="guided-expand"><summary className="guided-expand-trigger">Remaining actual 1099-DIV boxes</summary><div className="guided-expand-body">
    <p className="guided-hint">Review included capital-gain categories and exempt dividends separately. Enter actual zero for empty source amounts. Complete the preference worksheet for positive Box 13. Return-of-capital basis and section 1202/897 distributions still need separate worksheets.</p>
    {dividendSourceAmounts.filter(([field]) => !existing.has(field)).map(([field, label]) => <CurrencyField key={field} label={label} value={data[field] ?? ""} onChange={value => onChange(field, value)} />)}
    <TextFact label="Box 8 foreign country or territory" value={data.foreignCountry ?? ""} onChange={value => onChange("foreignCountry", value)} />
    <PrivateActivitySourceDetails data={data} onChange={onChange} />
  </div></details>;
}

function PrivateActivitySourceDetails({ data, onChange }: { data: InvestmentSourceData; onChange: (field: keyof InvestmentSourceData, value: string) => void }) {
  return <details className="guided-expand"><summary className="guided-expand-trigger">Private activity bond preference worksheet</summary><div className="guided-expand-body">
    <p className="guided-hint">Use the recipient amounts from the actual statement. Box 9 is already included in INT Box 8; DIV Box 13 is already included in Box 12 and is net of fund expenses. Enter an allowable deduction only from its completed worksheet. Do not deduct premiums or expenses already netted from these amounts.</p>
    <TextFact label="Bond preference source tax year" value={data.pabSourceTaxYear ?? ""} onChange={value => onChange("pabSourceTaxYear", value)} />
    <TextFact label="Bond preference source record ID" value={data.pabSourceId ?? ""} onChange={value => onChange("pabSourceId", value)} />
    <CurrencyField label="Otherwise allowable bond preference deduction" value={data.pabOtherwiseAllowableDeduction ?? ""} onChange={value => onChange("pabOtherwiseAllowableDeduction", value)} hint="Enter 0 when your actual source worksheet establishes no allowable deduction." />
    <TextFact label="Bond deduction worksheet reference" value={data.pabDeductionSourceReference ?? ""} onChange={value => onChange("pabDeductionSourceReference", value)} />
    {([['pabDeductionAllowanceAndNoDuplicationConfirmed', 'Bond deduction is allowable and has not been deducted twice'], ['pabRecipientAmountsConfirmed', 'Bond recipient amounts checked after the last edit']] as const).map(([field, label]) => <label className="guided-field" key={field}><span className="guided-field-label">{label}</span><select className="guided-input" value={data[field] ?? ""} onChange={event => onChange(field, event.target.value)}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>)}
  </div></details>;
}
