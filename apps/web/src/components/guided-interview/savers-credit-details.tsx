"use client";

import type { FilingStatus } from "@/lib/guided-interview-flow";
import {
  emptyGuidedSaversCredit,
  type GuidedSaversCreditData,
  type GuidedSaversCreditDistribution,
} from "@/lib/guided-savers-credit";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

function AccountHolderFact({ label, value, onChange }: {
  label: string;
  value: GuidedSaversCreditDistribution["accountHolder"];
  onChange: (value: "" | "primary") => void;
}) {
  return <label className="guided-field">
    <span className="guided-field-label">{label}</span>
    <select className="guided-input" value={value} onChange={event => onChange(event.target.value === "primary" ? "primary" : "")}>
      <option value="">Choose from the account record</option>
      <option value="primary">Primary taxpayer</option>
      {value === "spouse" && <option value="spouse" disabled>Spouse (outside this worksheet)</option>}
    </select>
  </label>;
}

export function SaversCreditDetails({ data, taxYear, filingStatus, onChange }: {
  data?: GuidedSaversCreditData;
  taxYear?: number | null;
  filingStatus?: FilingStatus | null;
  onChange: (data: GuidedSaversCreditData | undefined) => void;
}) {
  const available = taxYear === 2026 && filingStatus === "single";
  if (!available && !data) return null;

  const remove = () => onChange(undefined);
  if (!available) {
    return <section aria-label="Saver’s credit">
      <h3>Saver’s credit (Form 8880)</h3>
      <p role="alert">These saved Form 8880 records require a 2026 Single return. You can remove them from this return here.</p>
      <button type="button" className="utility-button" onClick={remove}>Remove saver’s credit records</button>
    </section>;
  }

  if (!data) {
    return <section aria-label="Saver’s credit">
      <h3>Saver’s credit (Form 8880)</h3>
      <p className="guided-hint">Use your own regular Roth IRA contribution records and complete the IRA contribution worksheet in Adjustments.</p>
      <button type="button" className="utility-button" onClick={() => onChange(structuredClone(emptyGuidedSaversCredit))}>Add saver’s credit records</button>
    </section>;
  }

  const update = (next: Partial<Omit<GuidedSaversCreditData, "sourceFactsConfirmed">>) => onChange({ ...data, ...next, sourceFactsConfirmed: null });
  const updateContribution = (next: Partial<GuidedSaversCreditData["contribution"]>) => update({
    contribution: { ...data.contribution, ...next }, ordinaryScopeConfirmed: null,
  });
  const period = data.testingPeriod;
  const updatePeriod = (next: Partial<Pick<GuidedSaversCreditData["testingPeriod"], "dueDate" | "distributions">>) => update({
    testingPeriod: { ...period, ...next, distributionsConfirmed: null },
  });
  const updateDistribution = (index: number, next: Partial<GuidedSaversCreditDistribution>) => updatePeriod({
    distributions: period.distributions.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row),
  });
  const periodEntered = ["2027-04-15", "2027-10-15"].includes(period.dueDate)
    && period.distributions.every(row => row.accountHolder === "primary" && row.sourceReference.trim() && row.receivedDate && row.amount.trim());
  const canConfirm = data.taxYear === "2026" && data.contribution.accountHolder === "primary"
    && Boolean(data.contribution.sourceReference.trim()) && Boolean(data.contribution.amount.trim())
    && data.qualifyingStudentMonths !== "" && typeof data.dependentDeductionAllowedToAnotherTaxpayer === "boolean"
    && data.ordinaryScopeConfirmed === true && periodEntered && period.distributionsConfirmed === true;

  return <fieldset className="guided-fieldset">
    <legend>Saver’s credit (Form 8880)</legend>
    <div className="guided-form-grid">
      <TextFact label="Contribution tax year shown on the IRA record" value={data.taxYear} onChange={taxYear => update({ taxYear, ordinaryScopeConfirmed: null })} />
      <AccountHolderFact label="Roth IRA contribution account holder" value={data.contribution.accountHolder} onChange={accountHolder => updateContribution({ accountHolder })} />
      <TextFact label="Roth IRA contribution record reference" value={data.contribution.sourceReference} onChange={sourceReference => updateContribution({ sourceReference })} />
      <CurrencyField label="Regular Roth IRA contribution for 2026" value={data.contribution.amount} onChange={amount => updateContribution({ amount })} required />
      <label className="guided-field">
        <span className="guided-field-label">Calendar months you were a qualifying full-time student in 2026</span>
        <select className="guided-input" value={data.qualifyingStudentMonths} onChange={event => update({ qualifyingStudentMonths: event.target.value })}>
          <option value="">Confirm from actual records</option>
          {Array.from({ length: 13 }, (_, months) => <option key={months} value={months}>{months}</option>)}
        </select>
        <span className="guided-field-hint">Count each month of full-time enrollment at a qualifying school or qualifying full-time on-farm training, including partial months.</span>
      </label>
      <BooleanFact label="Could another taxpayer claim you as a dependent for 2026?" value={data.dependentDeductionAllowedToAnotherTaxpayer} onChange={dependentDeductionAllowedToAnotherTaxpayer => update({ dependentDeductionAllowedToAnotherTaxpayer })} />
    </div>
    <label className="guided-checkbox-field">
      <input type="checkbox" className="guided-option-checkbox" checked={data.ordinaryScopeConfirmed === true} onChange={event => update({ ordinaryScopeConfirmed: event.target.checked })} />
      <span>This timely contribution matches my IRA worksheet. I made no other qualifying retirement contributions, including through an employer or to an ABLE account. I claim no exclusions or deductions for foreign earned income or foreign housing and no income exclusions for Puerto Rico or American Samoa.</span>
    </label>
    <fieldset className="guided-fieldset">
      <legend>Testing-period distributions</legend>
      <p className="guided-hint">Review distributions received from January 1, 2024 through the day before your applicable return due date. Use the <a href="https://www.irs.gov/pub/irs-prior/f8880--2026.pdf" target="_blank" rel="noreferrer">2026 Form 8880 instructions</a> to determine which distributions to include on line 4. A 2026 distribution requires separate reconciliation with the retirement income on your return.</p>
      <label className="guided-field">
        <span className="guided-field-label">Applicable 2026 return due date</span>
        <select className="guided-input" value={period.dueDate} onChange={event => updatePeriod({ dueDate: event.target.value })}>
          <option value="">Choose the date that applies</option>
          <option value="2027-04-15">April 15, 2027 (ordinary due date)</option>
          <option value="2027-10-15">October 15, 2027 (extended due date)</option>
        </select>
      </label>
      {period.distributions.map((row, index) => <fieldset className="guided-fieldset" key={index}>
        <legend>Distribution {index + 1}</legend>
        <div className="guided-form-grid">
          <AccountHolderFact label="Distribution account holder" value={row.accountHolder} onChange={accountHolder => updateDistribution(index, { accountHolder })} />
          <TextFact label="Distribution record reference" value={row.sourceReference} onChange={sourceReference => updateDistribution(index, { sourceReference })} />
          <TextFact label="Date you received the distribution" type="date" value={row.receivedDate} onChange={receivedDate => updateDistribution(index, { receivedDate })} />
          <CurrencyField label="Distribution amount included on Form 8880" value={row.amount} onChange={amount => updateDistribution(index, { amount })} required />
        </div>
        <button type="button" className="utility-button" onClick={() => updatePeriod({ distributions: period.distributions.filter((_, rowIndex) => index !== rowIndex) })}>Remove distribution {index + 1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={() => updatePeriod({ distributions: [
        ...period.distributions, { sourceReference: "", accountHolder: "", receivedDate: "", amount: "" },
      ] })}>Add testing-period distribution</button>
      <label className="guided-checkbox-field">
        <input type="checkbox" className="guided-option-checkbox" checked={period.distributionsConfirmed === true} disabled={!periodEntered} onChange={event => update({ testingPeriod: { ...period, distributionsConfirmed: event.target.checked } })} />
        <span>I reviewed the full testing period. The list includes every distribution used on Form 8880 line 4. An empty list means I had none to include.</span>
      </label>
    </fieldset>
    <label className="guided-checkbox-field">
      <input type="checkbox" className="guided-option-checkbox" checked={data.sourceFactsConfirmed === true} disabled={!canConfirm} onChange={event => onChange({ ...data, sourceFactsConfirmed: event.target.checked })} />
      <span>I confirmed these Form 8880 facts against my original records and the IRA contribution, income, and personal information on this return.</span>
    </label>
    <button type="button" className="utility-button" onClick={remove}>Remove saver’s credit records</button>
  </fieldset>;
}
