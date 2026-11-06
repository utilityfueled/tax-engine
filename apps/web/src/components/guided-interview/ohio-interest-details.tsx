"use client";

import { emptyOhioInterestAllocation, ohioInterestAmounts, type OhioInterestAllocation } from "@/lib/guided-ohio-interest-facts";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

export function OhioInterestDetails({ data, onChange }: {
  data: OhioInterestAllocation | undefined;
  onChange: (data: OhioInterestAllocation | undefined) => void;
}) {
  function update(field: keyof OhioInterestAllocation, value: string | boolean | null) {
    onChange({ ...(data ?? emptyOhioInterestAllocation), [field]: value,
      ...(field !== "sourceFactsConfirmed" ? { sourceFactsConfirmed: null } : {}) });
  }
  return <div className="guided-card">
    <h3 className="guided-card-title">Ohio tax-exempt interest allocation</h3>
    <p className="guided-hint">If your source records contain federal tax-exempt interest, use the actual issuer allocation statements to classify it for Ohio. Include exempt dividends and net exempt OID. Enter each category, including actual zero amounts; use source totals before whole-dollar rounding. Already federally taxable Treasury interest belongs in the income records.</p>
    {data ? <>
      <TextFact label="Ohio interest source tax year" value={data.taxYear} onChange={value => update("taxYear", value)} />
      <TextFact label="Ohio issuer allocation source reference" value={data.sourceReference} onChange={value => update("sourceReference", value)} />
      {ohioInterestAmounts.map(([field, label]) => <CurrencyField key={field} label={label} value={data[field]} onChange={value => update(field, value)} />)}
      <BooleanFact label="Ohio issuer classifications checked after the last source edit" value={data.sourceFactsConfirmed} onChange={value => update("sourceFactsConfirmed", value)} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove Ohio interest allocation</button>
    </> : <button type="button" className="utility-button" onClick={() => onChange({ ...emptyOhioInterestAllocation })}>Add Ohio interest allocation</button>}
  </div>;
}
