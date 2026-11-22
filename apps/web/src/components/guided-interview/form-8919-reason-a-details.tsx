"use client";

import type { GuidedForm8919ReasonA } from "@/lib/guided-form-8919-reason-a";
import { CurrencyField } from "./currency-field";
import { TextFact } from "./fact-fields";

function sourceText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function Form8919ReasonADetails({ data, taxYear, onChange }: {
  data?: GuidedForm8919ReasonA;
  taxYear: number | null | undefined;
  onChange: (next: GuidedForm8919ReasonA | undefined) => void;
}) {
  if (taxYear !== 2026 && !data) return null;

  if (taxYear !== 2026) {
    return <section aria-label="Form 8919 wages">
      <p role="alert">These saved Form 8919 wage records require a 2026 return. Select 2026 to review them or remove them from this return.</p>
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove Form 8919 wages</button>
    </section>;
  }

  if (!data) {
    return <section aria-label="Form 8919 wages">
      <h4>Form 8919 wages</h4>
      <p className="guided-hint">Enter one firm for the primary filer on a federal-only, non-joint return. Use the IRS employee determination you received after filing Form SS-8.</p>
      <button type="button" className="utility-button" onClick={() => onChange({
        taxYear: "", firmName: "", employerEin: "", determinationDate: "", wages: "", confirmed: false,
      })}>Add Form 8919 wages</button>
    </section>;
  }

  const update = (patch: Partial<Omit<GuidedForm8919ReasonA, "confirmed">>) => onChange({ ...data, ...patch, confirmed: false });
  const canConfirm = data.taxYear === "2026"
    && [data.firmName, data.employerEin, data.determinationDate, data.wages].every(value => sourceText(value).trim().length > 0);

  return <fieldset className="guided-fieldset">
    <legend>Form 8919 wages</legend>
    <div className="guided-form-grid">
      <TextFact label="Tax year of the Form 8919 wages" value={sourceText(data.taxYear)} onChange={taxYear => update({ taxYear })} />
      <TextFact label="Firm name on the IRS determination" value={sourceText(data.firmName)} onChange={firmName => update({ firmName })} />
      <TextFact label="Form 8919 employer EIN" value={sourceText(data.employerEin)} onChange={employerEin => update({ employerEin })} />
      <TextFact label="IRS determination date" type="date" value={sourceText(data.determinationDate)} onChange={determinationDate => update({ determinationDate })} />
      <CurrencyField label="Form 8919 wages outside Form W-2" value={sourceText(data.wages)} onChange={wages => update({ wages })} />
    </div>
    <label className="guided-checkbox-field">
      <input
        type="checkbox"
        className="guided-option-checkbox"
        checked={data.confirmed === true}
        disabled={!canConfirm}
        onChange={event => onChange({ ...data, confirmed: event.target.checked })}
      />
      <span>I filed Form SS-8 and received the IRS determination that I was this firm&apos;s employee. I received no Form 1099 from this firm. These wages are absent from my Forms W-2 and the rest of this return, and the firm withheld neither Social Security nor Medicare tax on them.</span>
    </label>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove Form 8919 wages</button>
  </fieldset>;
}
