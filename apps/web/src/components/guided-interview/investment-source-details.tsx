"use client";
import type { DividendEntryData, InterestEntryData } from "@/lib/guided-interview-flow";
import { dividendSourceAmounts, interestSourceAmounts, type InvestmentSourceData } from "@/lib/guided-investment-facts";
import { CurrencyField } from "./currency-field";
import { TextFact } from "./fact-fields";

export function InvestmentSourceIdentity({ data, onChange }: { data: InvestmentSourceData; onChange: (data: Partial<InvestmentSourceData>) => void }) {
  return <fieldset className="guided-fieldset"><legend>Actual source identity and state</legend>
    <label className="guided-field"><span className="guided-field-label">Investment income owner</span><select className="guided-input" value={data.accountHolder ?? ""} onChange={event => onChange({ accountHolder: event.target.value as InvestmentSourceData["accountHolder"] })}><option value="">Not answered</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on a joint return</option><option value="joint">Joint account requiring allocation</option></select></label>
    <TextFact label="Actual payer or broker TIN, if available" value={data.payerTin ?? ""} onChange={payerTin => onChange({ payerTin })} />
    <label className="guided-field"><span className="guided-field-label">State reporting on this investment form</span><select className="guided-input" value={data.stateTaxReporting ?? ""} onChange={event => onChange({ stateTaxReporting: event.target.value as InvestmentSourceData["stateTaxReporting"] })}><option value="">Not answered</option><option value="none">No state section reported</option><option value="single">One state reported</option><option value="multiple">Multiple states reported</option></select></label>
    <TextFact label="Actual source state" value={data.state ?? ""} onChange={state => onChange({ state: state.toUpperCase() })} />
    <CurrencyField label="State income tax withheld on this form" value={data.stateWithheld ?? ""} onChange={stateWithheld => onChange({ stateWithheld })} hint="Do not enter this amount again as additional state withholding. Joint accounts and multiple states need actual separate allocations before calculation." />
  </fieldset>;
}

export function InterestSourceDetails({ data, onChange }: { data: InterestEntryData; onChange: (field: keyof InterestEntryData, value: string) => void }) {
  return <details className="guided-expand"><summary className="guided-expand-trigger">Remaining actual 1099-INT boxes</summary><div className="guided-expand-body">
    <p className="guided-hint">Check every box and enter 0 only when your actual form confirms no amount. Unknown stays unanswered. Bond premiums, market discount and private-activity bond interest require additional worksheets that this guided calculation does not yet support.</p>
    {interestSourceAmounts.filter(([field]) => field !== "interestIncome" && field !== "federalWithheld").map(([field, label]) => <CurrencyField key={field} label={label} value={data[field] ?? ""} onChange={value => onChange(field, value)} />)}
    <TextFact label="Box 7 foreign country or territory" value={data.foreignCountry ?? ""} onChange={value => onChange("foreignCountry", value)} />
  </div></details>;
}

export function DividendSourceDetails({ data, onChange }: { data: DividendEntryData; onChange: (field: keyof DividendEntryData, value: string) => void }) {
  const existing = new Set(["ordinaryDividends", "qualifiedDividends", "capitalGainDistributions", "federalWithheld", "section199ADividends", "foreignTaxPaid"]);
  return <details className="guided-expand"><summary className="guided-expand-trigger">Remaining actual 1099-DIV boxes</summary><div className="guided-expand-body">
    <p className="guided-hint">Review included capital-gain categories and exempt dividends separately. Enter actual zero for empty source amounts. Return-of-capital basis, section 1202/897 distributions and private-activity bond dividends need additional worksheets before this guided calculation can proceed.</p>
    {dividendSourceAmounts.filter(([field]) => !existing.has(field)).map(([field, label]) => <CurrencyField key={field} label={label} value={data[field] ?? ""} onChange={value => onChange(field, value)} />)}
    <TextFact label="Box 8 foreign country or territory" value={data.foreignCountry ?? ""} onChange={value => onChange("foreignCountry", value)} />
  </div></details>;
}
