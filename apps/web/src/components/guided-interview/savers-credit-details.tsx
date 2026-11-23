"use client";

import type { FilingStatus } from "@/lib/guided-interview-flow";
import { getForm8880HistoricalIraPaymentYear } from "@/models/form-8880-sources";
import {
  emptyGuidedSaversCredit,
  emptyGuidedSaversHistoricalProof,
  type GuidedSaversCreditData,
  type GuidedSaversCreditDistribution,
  type GuidedSaversHistoricalProof,
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

function LastFourFact({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="guided-field">
    <span className="guided-field-label">{label}</span>
    <input className="guided-input" inputMode="numeric" maxLength={4} value={value} onChange={event => onChange(event.target.value)} />
  </label>;
}

function HistoricalDistributionProof({ proof, onChange, onRemove }: {
  proof: GuidedSaversHistoricalProof;
  onChange: (proof: GuidedSaversHistoricalProof) => void;
  onRemove: () => void;
}) {
  const edit = (next: Partial<GuidedSaversHistoricalProof>) => onChange({ ...proof, ...next, sourceFactsConfirmed: null });
  return <fieldset className="guided-fieldset">
    <legend>Historical traditional IRA payment records</legend>
    <p className="guided-hint">Use the original Form 1099-R and a separate receipt from the IRA issuer. The distribution reference, date and amount above come from that receipt. Copy each issuer’s EIN only if it appears on that record. Use a distinct short label for each record. Enter only the requested last four digits for the recipient and account numbers.</p>
    <div className="guided-form-grid">
      <TextFact label="Year printed on Form 1099-R" value={proof.originalTaxYear} onChange={originalTaxYear => edit({ originalTaxYear })} />
      <TextFact label="Original Form 1099-R record reference" value={proof.originalReference} onChange={originalReference => edit({ originalReference })} />
      <TextFact label="Issuer EIN on Form 1099-R" value={proof.originalIssuerEin} onChange={originalIssuerEin => edit({ originalIssuerEin })} />
      <TextFact label="Issuer EIN on the payment receipt" value={proof.receiptIssuerEin} onChange={receiptIssuerEin => edit({ receiptIssuerEin })} />
      <LastFourFact label="Last four account digits on Form 1099-R" value={proof.originalAccountLast4} onChange={originalAccountLast4 => edit({ originalAccountLast4 })} />
      <LastFourFact label="Last four account digits on the payment receipt" value={proof.receiptAccountLast4} onChange={receiptAccountLast4 => edit({ receiptAccountLast4 })} />
      <LastFourFact label="Last four digits of the recipient tax ID on Form 1099-R" value={proof.recipientTaxIdLast4} onChange={recipientTaxIdLast4 => edit({ recipientTaxIdLast4 })} />
      <CurrencyField label="Form 1099-R gross distribution (Box 1)" value={proof.grossDistribution} onChange={grossDistribution => edit({ grossDistribution })} />
      <CurrencyField label="Form 1099-R taxable amount (Box 2a)" value={proof.taxableAmount} onChange={taxableAmount => edit({ taxableAmount })} />
      <TextFact label="Form 1099-R distribution code (Box 7)" value={proof.distributionCode} onChange={distributionCode => edit({ distributionCode })} />
      <BooleanFact label="Do both records show your traditional IRA?" value={proof.traditionalIraConfirmed} onChange={traditionalIraConfirmed => edit({ traditionalIraConfirmed })} />
      <BooleanFact label="Is the IRA/SEP/SIMPLE box checked on Form 1099-R?" value={proof.iraSepSimple} onChange={iraSepSimple => edit({ iraSepSimple })} />
      <BooleanFact label="Is ‘taxable amount not determined’ checked on Form 1099-R (Box 2b)?" value={proof.taxableAmountNotDetermined} onChange={taxableAmountNotDetermined => edit({ taxableAmountNotDetermined })} />
    </div>
    <label className="guided-checkbox-field">
      <input type="checkbox" className="guided-option-checkbox" checked={proof.sourceFactsConfirmed === true} onChange={event => onChange({ ...proof, sourceFactsConfirmed: event.target.checked })} />
      <span>I checked both records. They show the same issuer and account. The tax form reports only this payment and it was fully taxable. None of the Form 8880 line 4 exclusions apply to this payment.</span>
    </label>
    <button type="button" className="utility-button" onClick={onRemove}>Remove historical payment records</button>
  </fieldset>;
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
  const historicalPaymentYears = period.distributions.length <= 2
    ? period.distributions.map(row => getForm8880HistoricalIraPaymentYear(row.receivedDate)) : [];
  const updatePeriod = (next: Partial<Pick<GuidedSaversCreditData["testingPeriod"], "dueDate" | "distributions">>) => update({
    testingPeriod: { ...period, ...next, distributionsConfirmed: null },
  });
  const updateDistribution = (index: number, next: Partial<GuidedSaversCreditDistribution>) => updatePeriod({
    distributions: period.distributions.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row),
  });
  const periodEntered = ["2027-04-15", "2027-10-15"].includes(period.dueDate)
    && period.distributions.every(row => row.accountHolder === "primary" && row.sourceReference.trim() && row.receivedDate && row.amount.trim()
      && (row.historicalProof === undefined || row.historicalProof?.sourceFactsConfirmed === true));
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
        {row.historicalProof ? <HistoricalDistributionProof proof={row.historicalProof}
          onChange={historicalProof => updateDistribution(index, { historicalProof })}
          onRemove={() => updateDistribution(index, { historicalProof: undefined })} />
          : historicalPaymentYears[index] !== undefined && <button type="button" className="utility-button"
            onClick={() => updateDistribution(index, { historicalProof: { ...emptyGuidedSaversHistoricalProof } })}>Add {historicalPaymentYears[index]} Form 1099-R and payment receipt details</button>}
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
