"use client";

import type { TaxYearInput } from "@/models/inputs";
import { ohioRetirementCreditOriginal, type OhioRetirementCreditDraft } from "@/lib/guided-ohio-retirement-credit";
import { guidedSourceValuesChanged } from "@/lib/guided-source-confirmation";
import { BooleanFact, TextFact } from "./fact-fields";

export function OhioRetirementCreditDetails({ data, originalInput, taxYear, onChange }: {
  data: OhioRetirementCreditDraft | undefined;
  originalInput: TaxYearInput | null | undefined;
  taxYear: number | null | undefined;
  onChange: (data: OhioRetirementCreditDraft | undefined) => void;
}) {
  const original = ohioRetirementCreditOriginal(originalInput);
  if (!original && !data) return null;
  const matches = original && data && !guidedSourceValuesChanged(original, data.original);

  return <div className="guided-card">
    <h3 className="guided-card-title">Ohio retirement income credit</h3>
    {data && matches ? <>
      <p className="guided-hint">Use the statement or plan records that explain why this distribution was paid. Ohio excludes an early withdrawal before retirement from this credit.</p>
      <TextFact label="Ohio retirement payment source reference" value={data.sourceReference}
        onChange={sourceReference => onChange({ ...data, sourceReference, sourceFactsConfirmed: null })} />
      <BooleanFact label="Was the entire distribution an early withdrawal before retirement?" value={data.withdrawnBeforeRetirement}
        onChange={withdrawnBeforeRetirement => onChange({ ...data, withdrawnBeforeRetirement, sourceFactsConfirmed: null })} />
      {data.withdrawnBeforeRetirement === false && <p className="guided-hint">This guided path covers documented early withdrawals before retirement only.</p>}
      {data.withdrawnBeforeRetirement === true && Boolean(data.sourceReference.trim()) &&
        <BooleanFact label="I checked the payment circumstances against the current Form 1099-R and my source records" value={data.sourceFactsConfirmed}
          onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />}
    </> : <>
      {data && <p className="guided-hint">{taxYear != null && taxYear !== data.original.taxYear
        ? "These saved payment facts apply to the 2025 Ohio return."
        : "The saved payment facts need the original Form 1099-R for this return."}</p>}
      {original && <button type="button" className="utility-button" onClick={() => onChange({
        original, sourceReference: "", withdrawnBeforeRetirement: null, sourceFactsConfirmed: null,
      })}>{data ? "Replace saved payment facts with the current Form 1099-R" : "Add Ohio retirement payment facts"}</button>}
    </>}
    {data && <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove Ohio retirement payment facts</button>}
  </div>;
}
