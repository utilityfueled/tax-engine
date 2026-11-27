"use client";

import type { GuidedForm8919OriginalNec, GuidedForm8919ReasonA } from "@/lib/guided-form-8919-reason-a";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

function sourceText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const emptyOriginalNec: GuidedForm8919OriginalNec = {
  statementReference: "", payerName: "", payerTin: "", recipientTin: "", nonemployeeCompensation: "",
  federalWithheld: "", qualifiedOvertimeCompensation: "", currentOriginalNoCorrectionsOrVoidsConfirmed: null,
  noDirectSalesOrParachutePaymentConfirmed: null, noTipsOrStateBoxesConfirmed: null, federalOnlyConfirmed: false,
};

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
  const original = data.originalNec;
  const canConfirmOriginal = !original || (
    [data.determinationReference, data.determinationReceivedDate, original.statementReference, original.payerName,
      original.payerTin, original.recipientTin, original.nonemployeeCompensation,
      original.qualifiedOvertimeCompensation, original.federalWithheld].every(value => sourceText(value).trim().length > 0)
    && original.currentOriginalNoCorrectionsOrVoidsConfirmed === true && original.noDirectSalesOrParachutePaymentConfirmed === true
    && original.noTipsOrStateBoxesConfirmed === true && original.federalOnlyConfirmed === true
  );
  const canConfirm = data.taxYear === "2026"
    && [data.firmName, data.employerEin, data.determinationDate, data.wages].every(value => sourceText(value).trim().length > 0)
    && canConfirmOriginal;

  return <fieldset className="guided-fieldset">
    <legend>Form 8919 wages</legend>
    <div className="guided-form-grid">
      <TextFact label="Tax year of the Form 8919 wages" value={sourceText(data.taxYear)} onChange={taxYear => update({ taxYear })} />
      <TextFact label="Firm name on the IRS determination" value={sourceText(data.firmName)} onChange={firmName => update({ firmName })} />
      <TextFact label="Form 8919 employer EIN" value={sourceText(data.employerEin)} onChange={employerEin => update({ employerEin })} />
      <TextFact label="IRS determination date" type="date" value={sourceText(data.determinationDate)} onChange={determinationDate => update({ determinationDate })} />
      <CurrencyField label="Form 8919 wages outside Form W-2" value={sourceText(data.wages)} onChange={wages => update({ wages })} />
    </div>
    {original ? <fieldset className="guided-fieldset">
      <legend>Original Form 1099-NEC received instead of Form W-2</legend>
      <div className="guided-form-grid">
        <TextFact label="IRS determination reference" value={sourceText(data.determinationReference)} onChange={determinationReference => update({ determinationReference })} />
        <TextFact label="Date you received the IRS determination" type="date" value={sourceText(data.determinationReceivedDate)} onChange={determinationReceivedDate => update({ determinationReceivedDate })} />
        <TextFact label="Original 1099-NEC statement reference" value={original.statementReference} onChange={statementReference => update({ originalNec: { ...original, statementReference } })} />
        <TextFact label="1099-NEC payer name" value={original.payerName} onChange={payerName => update({ originalNec: { ...original, payerName } })} />
        <TextFact label="1099-NEC payer EIN" value={original.payerTin} onChange={payerTin => update({ originalNec: { ...original, payerTin } })} />
        <TextFact label="1099-NEC recipient TIN" value={original.recipientTin} onChange={recipientTin => update({ originalNec: { ...original, recipientTin } })} />
        <CurrencyField label="1099-NEC Box 1a compensation" value={original.nonemployeeCompensation} onChange={nonemployeeCompensation => update({ originalNec: { ...original, nonemployeeCompensation } })} />
        <CurrencyField label="1099-NEC Box 1d qualified overtime" value={original.qualifiedOvertimeCompensation} onChange={qualifiedOvertimeCompensation => update({ originalNec: { ...original, qualifiedOvertimeCompensation } })} />
        <CurrencyField label="1099-NEC Box 4 federal withholding" value={original.federalWithheld} onChange={federalWithheld => update({ originalNec: { ...original, federalWithheld } })} />
        <BooleanFact label="This is the current original, with no correction or void" value={original.currentOriginalNoCorrectionsOrVoidsConfirmed} onChange={currentOriginalNoCorrectionsOrVoidsConfirmed => update({ originalNec: { ...original, currentOriginalNoCorrectionsOrVoidsConfirmed } })} />
        <BooleanFact label="The original reports no direct sales or excess golden parachute payments" value={original.noDirectSalesOrParachutePaymentConfirmed} onChange={noDirectSalesOrParachutePaymentConfirmed => update({ originalNec: { ...original, noDirectSalesOrParachutePaymentConfirmed } })} />
        <BooleanFact label="The original reports no tips, tipped occupation code, or state amounts" value={original.noTipsOrStateBoxesConfirmed} onChange={noTipsOrStateBoxesConfirmed => update({ originalNec: { ...original, noTipsOrStateBoxesConfirmed } })} />
      </div>
      <label className="guided-checkbox-field">
        <input type="checkbox" className="guided-option-checkbox" checked={original.federalOnlyConfirmed === true}
          onChange={event => update({ originalNec: { ...original, federalOnlyConfirmed: event.target.checked } })} />
        <span>Prepare the federal return only. State filing is separate.</span>
      </label>
      <button type="button" className="utility-button" onClick={() => update({ originalNec: undefined, determinationReference: undefined, determinationReceivedDate: undefined })}>Remove original Form 1099-NEC</button>
    </fieldset> : <button type="button" className="utility-button" onClick={() => update({ originalNec: { ...emptyOriginalNec } })}>Add original Form 1099-NEC instead of Form W-2</button>}
    <label className="guided-checkbox-field">
      <input
        type="checkbox"
        className="guided-option-checkbox"
        checked={data.confirmed === true}
        disabled={!canConfirm}
        onChange={event => onChange({ ...data, confirmed: event.target.checked })}
      />
      <span>{original
        ? "I filed Form SS-8 and received the IRS determination that I was this firm's employee. I received this Form 1099-NEC instead of Form W-2. All of Box 1a is employee wages missing from my other records, and the firm withheld neither Social Security nor Medicare tax on them."
        : "I filed Form SS-8 and received the IRS determination that I was this firm's employee. I received no Form 1099 from this firm. These wages are absent from my Forms W-2 and the rest of this return, and the firm withheld neither Social Security nor Medicare tax on them."}</span>
    </label>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove Form 8919 wages</button>
  </fieldset>;
}
