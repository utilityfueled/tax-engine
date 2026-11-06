"use client";

import type { HsaDistributionEvent, HsaDistributionSource, HsaMedicalEligibility } from "@/lib/guided-hsa-distribution-facts";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

const medicalLabels = [
  ["qualifiedExpense", "The cost is a qualified HSA medical expense"],
  ["beneficiaryEligible", "The expense was for an eligible HSA beneficiary"],
  ["incurredAfterHsaEstablished", "The expense was incurred after the HSA was established"],
  ["notReimbursedElsewhere", "The expense was not reimbursed elsewhere"],
  ["notDeductedOnScheduleA", "The expense was not deducted on Schedule A"],
] as const;

export function HsaDistributionDetails({ records, labelPrefix, onChange }: { records: HsaDistributionSource[]; labelPrefix: string; onChange: (records: HsaDistributionSource[]) => void }) {
  const update = (index: number, patch: Partial<HsaDistributionSource>) => onChange(records.map((record, position) => position === index ? { ...record, sourceFactsConfirmed: null, ...patch } : record));
  return <section aria-label={`${labelPrefix}: Actual HSA distributions`}>
    <p className="guided-hint">Use each actual Form 1099-SA once, then reconcile it to dated account activity. Medical costs and rollovers must use separate dollars. A source amount alone does not establish tax-free treatment.</p>
    {records.map((record, index) => {
      const prefix = `${labelPrefix}, source ${index + 1}`;
      const label = (text: string) => `${prefix}: ${text}`;
      const updateEvent = (eventIndex: number, patch: Partial<HsaDistributionEvent>) => update(index, { events: record.events.map((event, position) => position === eventIndex ? { ...event, ...patch } : event) });
      return <fieldset key={record.id} className="guided-expand-body"><legend>Form 1099-SA source {index + 1}</legend>
        <div className="guided-form-grid">
          <TextFact label={label("Actual statement tax year")} value={record.sourceTaxYear} onChange={sourceTaxYear => update(index, { sourceTaxYear })} />
          <label className="guided-field"><span className="guided-field-label">{label("Actual recipient")}</span><select className="guided-select" value={record.accountOwner} onChange={event => update(index, { accountOwner: event.target.value as HsaDistributionSource["accountOwner"] })}><option value="">Unknown</option><option value="primary">Taxpayer</option><option value="spouse">Spouse</option></select></label>
          <TextFact label={label("Payer name")} value={record.payer} onChange={payer => update(index, { payer })} />
          <TextFact label={label("Payer TIN")} value={record.payerTin} onChange={payerTin => update(index, { payerTin })} />
          <TextFact label={label("Account reference")} value={record.accountReference} onChange={accountReference => update(index, { accountReference })} />
          <label className="guided-field"><span className="guided-field-label">{label("Box 5 account type")}</span><select className="guided-select" value={record.accountType} onChange={event => update(index, { accountType: event.target.value as HsaDistributionSource["accountType"] })}><option value="">Unknown</option><option value="hsa">HSA</option><option value="archer_msa">Archer MSA</option><option value="ma_msa">Medicare Advantage MSA</option></select></label>
          <label className="guided-field"><span className="guided-field-label">{label("Box 3 distribution code")}</span><select className="guided-select" value={record.distributionCode} onChange={event => update(index, { distributionCode: event.target.value as HsaDistributionSource["distributionCode"] })}><option value="">Unknown</option><option value="1">1 — Normal distribution</option><option value="2">2 — Excess contributions</option><option value="3">3 — Disability</option><option value="4">4 — Death distribution</option><option value="5">5 — Prohibited transaction</option><option value="6">6 — Death distribution after year of death</option></select></label>
          <CurrencyField label={label("Box 1 gross distribution")} value={record.grossDistribution} onChange={grossDistribution => update(index, { grossDistribution })} required />
          <CurrencyField label={label("Box 2 excess-contribution earnings")} hint="Box 2 earnings are already included in Box 1. Enter actual zero only when known." value={record.earningsOnExcessContributions} onChange={earningsOnExcessContributions => update(index, { earningsOnExcessContributions })} required />
          <BooleanFact label={label("This was a trustee-to-trustee transfer")} value={record.trusteeToTrusteeTransfer} onChange={trusteeToTrusteeTransfer => update(index, { trusteeToTrusteeTransfer })} />
        </div>
        <p className="guided-hint">A masked account reference is enough to distinguish actual statements. Direct trustee transfers are not Form 1099-SA distributions. Correction, death, prohibited-transaction and MSA sources stay saved while their separate worksheets are completed.</p>
        {record.events.map((event, eventIndex) => {
          const eventLabel = (text: string) => `${prefix}, distribution ${eventIndex + 1}: ${text}`;
          const updateMedical = (field: keyof HsaMedicalEligibility, value: boolean | null) => updateEvent(eventIndex, { medicalEligibility: { qualifiedExpense: null, beneficiaryEligible: null, incurredAfterHsaEstablished: null, notReimbursedElsewhere: null, notDeductedOnScheduleA: null, ...event.medicalEligibility, [field]: value } });
          return <fieldset key={event.id} className="guided-expand-body"><legend>Dated distribution {eventIndex + 1}</legend><div className="guided-form-grid">
            <TextFact label={eventLabel("Actual distribution date")} type="date" value={event.distributionDate} onChange={distributionDate => updateEvent(eventIndex, { distributionDate })} />
            <CurrencyField label={eventLabel("Gross amount")} value={event.grossDistribution} onChange={grossDistribution => updateEvent(eventIndex, { grossDistribution })} required />
            <CurrencyField label={eventLabel("Medical costs assigned to this distribution")} hint="Use actual expenses paid or reimbursed with these dollars. Do not repeat expenses assigned to another distribution or account." value={event.medicalExpenses} onChange={medicalExpenses => updateEvent(eventIndex, { medicalExpenses })} required />
            {medicalLabels.map(([field, text]) => <BooleanFact key={field} label={eventLabel(text)} value={event.medicalEligibility?.[field]} onChange={value => updateMedical(field, value)} />)}
            <CurrencyField label={eventLabel("Amount rolled into another HSA")} value={event.rolloverAmount} onChange={rolloverAmount => updateEvent(eventIndex, { rolloverAmount })} required />
            <TextFact label={eventLabel("Actual receiving HSA deposit date")} type="date" value={event.rolloverReceivedDate ?? ""} onChange={rolloverReceivedDate => updateEvent(eventIndex, { rolloverReceivedDate })} />
            <BooleanFact label={eventLabel("The receiving HSA has the same owner")} value={event.rolloverToSameOwnerHsa} onChange={rolloverToSameOwnerHsa => updateEvent(eventIndex, { rolloverToSameOwnerHsa })} />
            <BooleanFact label={eventLabel("No other HSA rollover in the preceding twelve months")} value={event.noOtherRolloverInPrior12Months} onChange={noOtherRolloverInPrior12Months => updateEvent(eventIndex, { noOtherRolloverInPrior12Months })} />
          </div><button type="button" className="utility-button" onClick={() => update(index, { events: record.events.filter((_, position) => position !== eventIndex) })}>{eventLabel("Remove dated distribution")}</button></fieldset>;
        })}
        <button type="button" className="utility-button" onClick={() => update(index, { events: [...record.events, { id: crypto.randomUUID(), distributionDate: "", grossDistribution: "", medicalExpenses: "", rolloverAmount: "" }] })}>{label("Add dated distribution")}</button>
        <BooleanFact label={label("Source and allocations checked after the last edit")} value={record.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update(index, { sourceFactsConfirmed })} />
        <button type="button" className="utility-button" onClick={() => onChange(records.filter((_, position) => position !== index))}>{label("Remove source")}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => onChange([...records, { id: crypto.randomUUID(), sourceTaxYear: "", accountOwner: "", payer: "", payerTin: "", accountReference: "", accountType: "", distributionCode: "", grossDistribution: "", earningsOnExcessContributions: "", trusteeToTrusteeTransfer: null, sourceFactsConfirmed: null, events: [] }])}>{labelPrefix}: Add Form 1099-SA source</button>
  </section>;
}
