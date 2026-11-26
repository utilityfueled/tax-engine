"use client";

import { filingStatusOptions, type FilingStatus } from "@/lib/guided-interview-flow";
import type { GuidedReitPtpLossSource } from "@/lib/guided-reit-ptp-loss";
import { CurrencyField } from "./currency-field";

export function ReitPtpLossDetails({ data, taxYear, onChange, onClearSelection }: {
  data?: GuidedReitPtpLossSource;
  taxYear?: number | null;
  onChange: (value: GuidedReitPtpLossSource | undefined) => void;
  onClearSelection?: () => void;
}) {
  if (!data) return <div className="panel-stack">
    <button type="button" className="utility-button" onClick={() => onChange({})}>Add prior-year REIT and PTP loss carryforward</button>
    {onClearSelection && <button type="button" className="utility-button" onClick={onClearSelection}>I don&apos;t have a prior-year REIT or PTP loss carryforward</button>}
  </div>;

  function update(patch: Partial<GuidedReitPtpLossSource>) {
    onChange({ ...data, ...patch });
  }

  const line = data.sourceForm === "form_8995" ? "Form 8995 line 17"
    : data.sourceForm === "form_8995_a" ? "Form 8995-A Part IV line 40" : "the carryforward line on the filed form";

  return <fieldset className="guided-w2-card">
    <legend>Prior-year REIT and PTP loss carryforward</legend>
    <p className="guided-hint">Use the Form 8995 or 8995-A filed with your preceding return. For a joint return, use the filed form for the same two filers.</p>
    <div className="guided-form-grid">
      <label className="guided-field">
        <span className="guided-field-label">Filed REIT and PTP form</span>
        <select className="guided-input" value={data.sourceForm ?? ""}
          onChange={event => update({ sourceForm: (event.target.value || undefined) as GuidedReitPtpLossSource["sourceForm"] })}>
          <option value="">Choose the filed form</option>
          <option value="form_8995">Form 8995</option>
          <option value="form_8995_a">Form 8995-A</option>
        </select>
      </label>
      <label className="guided-field">
        <span className="guided-field-label">Tax year shown on the filed form</span>
        <input className="guided-input" inputMode="numeric" maxLength={4} value={data.sourceTaxYear ?? ""}
          onChange={event => update({ sourceTaxYear: event.target.value })} />
        {taxYear != null && <span className="guided-field-hint">Use the {taxYear - 1} form for your {taxYear} return.</span>}
      </label>
      <label className="guided-field">
        <span className="guided-field-label">Filed form reference</span>
        <input className="guided-input" value={data.sourceReference ?? ""}
          onChange={event => update({ sourceReference: event.target.value })} />
        <span className="guided-field-hint">Use a document label or reference you recognize.</span>
      </label>
      <CurrencyField label="Filed carryforward amount" value={data.amount ?? ""} required
        hint={`Enter the amount from ${line}. Omit the parentheses and enter 0 only if the form shows zero.`}
        onChange={amount => update({ amount })} />
      <label className="guided-field">
        <span className="guided-field-label">Filing status on the prior return</span>
        <select className="guided-input" value={data.priorFilingStatus ?? ""} onChange={event => {
          const priorFilingStatus = (event.target.value || undefined) as FilingStatus | undefined;
          update(priorFilingStatus === "mfj" ? { priorFilingStatus } : {
            priorFilingStatus, spouseName: undefined, spouseTaxIdLast4: undefined, sameJointFilersConfirmed: undefined,
          });
        }}>
          <option value="">Choose the prior filing status</option>
          {filingStatusOptions.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
      </label>
      <label className="guided-field">
        <span className="guided-field-label">Primary filer's first and last name on the prior return</span>
        <input className="guided-input" value={data.primaryName ?? ""} onChange={event => update({ primaryName: event.target.value })} />
      </label>
      <label className="guided-field">
        <span className="guided-field-label">Primary filer's tax ID last four digits</span>
        <input className="guided-input" inputMode="numeric" maxLength={4} value={data.primaryTaxIdLast4 ?? ""}
          onChange={event => update({ primaryTaxIdLast4: event.target.value })} />
      </label>
      {data.priorFilingStatus === "mfj" && <>
        <label className="guided-field">
          <span className="guided-field-label">Spouse's first and last name on the prior return</span>
          <input className="guided-input" value={data.spouseName ?? ""} onChange={event => update({ spouseName: event.target.value })} />
        </label>
        <label className="guided-field">
          <span className="guided-field-label">Spouse's tax ID last four digits</span>
          <input className="guided-input" inputMode="numeric" maxLength={4} value={data.spouseTaxIdLast4 ?? ""}
            onChange={event => update({ spouseTaxIdLast4: event.target.value })} />
        </label>
        <label className="guided-field">
          <span className="guided-field-label">The same two people filed jointly on both returns</span>
          <input type="checkbox" checked={data.sameJointFilersConfirmed === true} onChange={event => update({ sameJointFilersConfirmed: event.target.checked })} />
        </label>
      </>}
      <label className="guided-field">
        <span className="guided-field-label">I checked these entries against my filed form</span>
        <input type="checkbox" checked={data.sourceFactsConfirmed === true} onChange={event => update({ sourceFactsConfirmed: event.target.checked })} />
      </label>
    </div>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove prior-year REIT and PTP loss source</button>
  </fieldset>;
}
