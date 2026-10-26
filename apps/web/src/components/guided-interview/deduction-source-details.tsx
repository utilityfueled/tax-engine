"use client";

import { type DeductionData, type DonationEntryData, type MortgageEntryData, emptyDonationEntry, emptyMortgageEntry } from "@/lib/guided-interview-flow";
import { sumGuidedDisplayAmounts } from "@/lib/guided-currency";
import { CurrencyField } from "./currency-field";
import { MortgageSourceFields } from "./mortgage-source-fields";
import { MortgageWorksheetDetails } from "./mortgage-worksheet-details";
import { guidedSourceValuesChanged } from "@/lib/guided-source-confirmation";
import { amountError } from "@/lib/guided-required-facts";

function TextFact({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "date" }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input type={type} className="guided-input" value={value} onChange={(event) => onChange(event.target.value)} aria-required="true" /></label>;
}

function BooleanFact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from your records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}

export function DeductionSourceDetails({ data, onChange, includeMortgages = true, includeDonations = true }: { data: DeductionData; onChange: (data: DeductionData) => void; includeMortgages?: boolean; includeDonations?: boolean }) {
  // An old aggregate is preserved as the amount needing source details. No other
  // fact is inferred, and merely rendering does not rewrite the saved workspace.
  const mortgages = data.mortgageEntries ?? (data.mortgageInterest.trim() ? [{ ...emptyMortgageEntry, mortgageInterest: data.mortgageInterest }] : []);
  const donations = data.donationEntries ?? (data.charitableContributions.trim() ? [{ ...emptyDonationEntry, amount: data.charitableContributions }] : []);
  function setMortgages(entries: MortgageEntryData[]) {
    const known = entries.length > 0 && entries.every(entry => !amountError(entry.mortgageInterest, "mortgage interest"));
    const changed = guidedSourceValuesChanged(data.mortgageEntries, entries);
    onChange({ ...data, mortgageEntries: entries, mortgageInterest: known ? sumGuidedDisplayAmounts(entries.map(entry => entry.mortgageInterest)).toFixed() : "",
      ...(changed && data.mortgageWorksheet ? { mortgageWorksheet: { ...data.mortgageWorksheet, sourceFactsConfirmed: null } } : {}) });
  }
  function setDonations(entries: DonationEntryData[]) {
    const total = sumGuidedDisplayAmounts(entries.map((entry) => entry.amount));
    const changed = guidedSourceValuesChanged(data.donationEntries, entries);
    onChange({ ...data, donationEntries: entries, charitableContributions: total.isFinite() ? total.toFixed() : data.charitableContributions,
      ...(changed && data.charitableCarryoverSources ? { charitableCarryoverSources: { ...data.charitableCarryoverSources, sourceFactsConfirmed: null } } : {}) });
  }
  return <>
    {includeMortgages && <>
    <h4>Mortgage interest — Form 1098</h4>
    <p className="guided-hint">Copy each lender&apos;s actual amounts and origination date. Leave an unknown fact blank; it must be resolved before calculating.</p>
    <MortgageWorksheetDetails data={data.mortgageWorksheet} onChange={mortgageWorksheet => onChange({ ...data, mortgageWorksheet })} />
    {mortgages.map((entry, index) => {
      const update = (change: Partial<MortgageEntryData>) => setMortgages(mortgages.map((item, i) => i === index ? { ...item, sourceFactsConfirmed: null, ...change } : item));
      return <fieldset className="guided-fieldset" key={index}><legend>Mortgage #{index + 1}</legend><div className="guided-form-grid">
        <TextFact label="Mortgage lender" value={entry.lender} onChange={(lender) => update({ lender })} />
        <CurrencyField label="Home mortgage interest" value={entry.mortgageInterest} onChange={(mortgageInterest) => update({ mortgageInterest })} required />
        <CurrencyField label="Outstanding mortgage principal (Box 2)" value={entry.outstandingPrincipal} onChange={(outstandingPrincipal) => update({ outstandingPrincipal })} required />
        <TextFact label="Mortgage origination date (Box 3)" value={entry.originationDate} type="date" onChange={(originationDate) => update({ originationDate })} />
        <MortgageSourceFields entry={entry} onChange={update} />
      </div><button type="button" className="utility-button" onClick={() => setMortgages(mortgages.filter((_, i) => i !== index))}>Remove mortgage #{index + 1}</button></fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => setMortgages([...mortgages, { ...emptyMortgageEntry }])}>Add mortgage</button>
    </>}
    {includeDonations && <><h4>Charitable contributions</h4>
    {donations.map((entry, index) => {
      const update = (change: Partial<DonationEntryData>) => setDonations(donations.map((item, i) => i === index ? { ...item, ...change } : item));
      return <fieldset className="guided-fieldset" key={index}><legend>Donation #{index + 1}</legend><div className="guided-form-grid">
        <TextFact label="Donation recipient" value={entry.organization} onChange={(organization) => update({ organization })} />
        <label className="guided-field"><span className="guided-field-label">Donation type</span><select className="guided-input" value={entry.type} onChange={(event) => update({ type: event.target.value as DonationEntryData["type"] })}><option value="">Choose the actual type</option><option value="cash">Cash</option><option value="appreciated_stock">Appreciated stock</option><option value="property">Property</option><option value="other">Other noncash property</option></select></label>
        <CurrencyField label="Donation amount / fair market value" value={entry.amount} onChange={(amount) => update({ amount })} required />
        <TextFact label="Donation date" value={entry.date} type="date" onChange={(date) => update({ date })} />
        <label className="guided-field"><span className="guided-field-label">Recipient tax category</span><select className="guided-input"
          value={entry.recipientCategory === undefined && entry.isPrivateFoundation === false ? "legacy-public" : entry.recipientCategory ?? ""}
          onChange={(event) => update({ recipientCategory: event.target.value === "" ? null : event.target.value as DonationEntryData["recipientCategory"] })}>
          <option value="">Confirm from the recipient&apos;s records</option>
          {entry.recipientCategory === undefined && entry.isPrivateFoundation === false && <option value="legacy-public" disabled>Saved public / 50% limit classification</option>}
          <option value="fifty-percent">Public charity or qualifying 50% limit foundation</option>
          <option value="private-nonoperating">Private nonoperating foundation outside the 50% limit category</option>
          <option value="other-thirty-percent">Other qualified 30% limit organization</option>
        </select></label>
        {entry.isPrivateFoundation === true && entry.recipientCategory == null && <p className="guided-hint">The saved foundation / second-category answer is retained. Confirm the actual tax category; qualifying operating foundations can use the public-charity category.</p>}
        <BooleanFact label="Recipient qualifies for a charitable contribution deduction" value={entry.qualifiedOrganization} onChange={(qualifiedOrganization) => update({ qualifiedOrganization })} />
        <BooleanFact label="Recipient is a supporting organization" value={entry.supportingOrganization} onChange={(supportingOrganization) => update({ supportingOrganization })} />
        <BooleanFact label="Gift was to a donor-advised fund" value={entry.donorAdvisedFund} onChange={(donorAdvisedFund) => update({ donorAdvisedFund })} />
        {entry.type && entry.type !== "cash" && <>
          <CurrencyField label="Donated property's cost basis" value={entry.costBasis} onChange={(costBasis) => update({ costBasis })} required />
          <BooleanFact label="Long-term capital gain property" value={entry.isLongTermCapitalGain} onChange={(isLongTermCapitalGain) => update({ isLongTermCapitalGain })} />
          {entry.recipientCategory === "private-nonoperating" && entry.isLongTermCapitalGain && <BooleanFact label="Gift is qualified appreciated stock" value={entry.qualifiedAppreciatedStock} onChange={(qualifiedAppreciatedStock) => update({ qualifiedAppreciatedStock })} />}
        </>}
      </div><button type="button" className="utility-button" onClick={() => setDonations(donations.filter((_, i) => i !== index))}>Remove donation #{index + 1}</button></fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => setDonations([...donations, { ...emptyDonationEntry }])}>Add donation</button>
    </>}
  </>;
}
