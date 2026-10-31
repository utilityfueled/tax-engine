"use client";

import { RetroShell } from "@/components/retro-shell";
import { type UnemploymentData, emptyUnemploymentData } from "@/lib/guided-interview-flow";
import { emptyUnemploymentEntry, unemploymentEntries, withUnemploymentEntries, type UnemploymentEntryData } from "@/lib/guided-unemployment-facts";
import { GovernmentPaymentSourceFields } from "./government-payment-source-fields";
import { TaxRefundSourceDetails } from "./tax-refund-source-details";

export function SectionUnemployment({ data, onDataChange }: { data: UnemploymentData | undefined; onDataChange: (data: UnemploymentData) => void }) {
  const current = data ?? emptyUnemploymentData;
  const savedEntries = unemploymentEntries(current);
  const entries = savedEntries.length ? savedEntries : [{ ...emptyUnemploymentEntry }];
  const updateEntry = (index: number, change: Partial<UnemploymentEntryData>) => onDataChange(withUnemploymentEntries(current, entries.map((entry, position) => position === index ? { ...entry, sourceFactsConfirmed: null, ...change } : entry)));
  return <RetroShell title="Government Payments" eyebrow="INCOME"><div className="guided-question">
    <p className="guided-prompt">Enter each actual unemployment or government-payment statement.</p>
    <p className="guided-hint">Ordinary government unemployment generally goes to Schedule 1, line 7. Other programs, refunds, contribution history and repayments can change the tax treatment. Preserve their original facts separately.</p>
    <div className="guided-w2-stack">{entries.map((entry, index) => <div className="guided-w2-card" key={index}>
      <div className="guided-w2-card-header"><h3 className="guided-w2-card-title">Government statement #{index + 1}</h3>{entries.length > 1 && <button type="button" className="utility-button utility-button-small" aria-label={`Remove government statement ${index + 1}`} onClick={() => onDataChange(withUnemploymentEntries(current, entries.filter((_, position) => position !== index)))}>Remove</button>}</div>
      <div className="guided-form-grid"><GovernmentPaymentSourceFields entry={entry} onChange={change => updateEntry(index, change)} /></div>
    </div>)}</div>
    <button type="button" className="utility-button" onClick={() => onDataChange(withUnemploymentEntries(current, [...entries, { ...emptyUnemploymentEntry }]))}>Add government statement</button>
    <TaxRefundSourceDetails data={current.taxRefund} entries={entries} onChange={taxRefund => onDataChange({ ...current, taxRefund })} />
    <p className="guided-hint">Missing source amounts stay unknown; enter zero only when confirmed. Repayments and contribution balances need matching source records. Income-tax refunds use the historical worksheet. Earlier-year repayments need the earlier return figures. Farm payments, medical leave and private programs need their separate worksheets. State withholding belongs to the source state, which may differ from your address.</p>
  </div></RetroShell>;
}
