"use client";

import { EstimatedTaxSourceDetails } from "./estimated-tax-source-details";
import { RetroShell } from "@/components/retro-shell";
import {
  type PaymentData,
  type EstimatedPaymentEntry,
  emptyEstimatedPayment,
  emptyPaymentData,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { BooleanFact } from "./fact-fields";
import { formatGuidedCurrency, sumGuidedDisplayAmounts } from "@/lib/guided-currency";
import { amountError, federalPaymentDateNeedsApplication, hasEnteredAmount, supportsFederalPaymentReceiptReferences, type FederalPaymentKind } from "@/lib/guided-required-facts";

function editPayment(entry: EstimatedPaymentEntry, field: "date" | "amount", value: string): EstimatedPaymentEntry {
  // CurrencyField adds grouping commas on blur without changing the reported amount.
  const unchanged = field === "amount"
    ? entry.amount.replaceAll(",", "") === value.replaceAll(",", "")
    : entry.date === value;
  return {
    ...entry,
    [field]: value,
    ...(entry.application && !unchanged ? { application: { ...entry.application, confirmed: null } } : {}),
  };
}

function PaymentApplicationFields({ label, entry, taxYear, kind, onChange }: {
  label: string;
  entry: EstimatedPaymentEntry;
  taxYear?: number | null;
  kind: FederalPaymentKind;
  onChange: (application: NonNullable<EstimatedPaymentEntry["application"]>) => void;
}) {
  if (entry.application === undefined && !federalPaymentDateNeedsApplication(entry.date, taxYear, kind)) return null;
  const application = entry.application ?? { taxYear: "", confirmed: null };
  return <>
    <label className="guided-field">
      <span className="guided-field-label">{label} IRS application tax year</span>
      <input
        className="guided-input guided-input-narrow"
        inputMode="numeric"
        maxLength={4}
        value={application.taxYear}
        onChange={(event) => {
          const taxYear = event.target.value;
          if (taxYear !== application.taxYear) onChange({ taxYear, confirmed: null });
        }}
      />
      <span className="guided-field-hint">Use the tax year on the IRS payment confirmation or account record.</span>
    </label>
    <BooleanFact label={`${label} applies to this return`} value={application.confirmed}
      onChange={confirmed => onChange({ ...application, confirmed })} />
  </>;
}

function PaymentReceiptReference({ label, entry, taxYear, kind, onUpdate }: {
  label: string;
  entry: EstimatedPaymentEntry;
  taxYear?: number | null;
  kind: FederalPaymentKind;
  onUpdate: (entry: EstimatedPaymentEntry) => void;
}) {
  if (!supportsFederalPaymentReceiptReferences(taxYear, kind)) return null;
  return <label className="guided-field">
    <span className="guided-field-label">{label} receipt reference</span>
    <input className="guided-input" value={entry.receiptReference ?? ""}
      onChange={event => onUpdate({ ...entry, receiptReference: event.target.value })} />
    <span className="guided-field-hint">Use one consistent reference from your records for each processed IRS payment. Payments with the same date and amount need separate references.</span>
  </label>;
}

function EstimatedPaymentCard({
  index,
  entry,
  onUpdate,
  onRemove,
  removable,
  taxYear,
}: {
  index: number;
  entry: EstimatedPaymentEntry;
  onUpdate: (entry: EstimatedPaymentEntry) => void;
  onRemove: () => void;
  removable: boolean;
  taxYear?: number | null;
}) {
  return (
    <div className="guided-w2-card" style={{ padding: "12px" }}>
      <div className="guided-w2-card-header">
        <h3 className="guided-w2-card-title">Payment #{index + 1}</h3>
        {removable && (
          <button
            type="button"
            className="utility-button utility-button-small utility-button-danger"
            onClick={onRemove}
            aria-label={`Remove estimated payment #${index + 1}`}
          >
            Remove
          </button>
        )}
      </div>

      <div className="guided-form-grid">
        <label className="guided-field">
          <span className="guided-field-label">Date paid</span>
          <input
            type="date"
            className="guided-input guided-input-narrow"
            value={entry.date}
            onChange={(e) => onUpdate(editPayment(entry, "date", e.target.value))}
            aria-describedby={`est-payment-${index}-date-hint`}
            aria-required="true"
          />
          <span className="guided-field-hint" id={`est-payment-${index}-date-hint`}>
            Common dates: 4/15, 6/15, 9/15, 1/15 of the next year.
          </span>
        </label>
        <CurrencyField
          label="Amount paid"
          value={entry.amount}
          onChange={(value) => onUpdate(editPayment(entry, "amount", value))}
          required
        />
        <PaymentReceiptReference label={`Estimated payment #${index + 1}`} entry={entry} taxYear={taxYear} kind="estimate" onUpdate={onUpdate} />
        <PaymentApplicationFields label={`Estimated payment #${index + 1}`} entry={entry} taxYear={taxYear} kind="estimate"
          onChange={application => onUpdate({ ...entry, application })} />
      </div>
    </div>
  );
}

export function SectionPayments({
  data,
  onDataChange,
  taxYear,
}: {
  data: PaymentData | undefined;
  taxYear?: number | null;
  onDataChange: (data: PaymentData) => void;
}) {
  const current = data ?? emptyPaymentData;
  const payments = current.estimatedPayments ?? [];
  const extensions = current.extensionPayments ?? [];
  const appliedRefunds = current.priorYearAppliedCredits ?? [];

  function updatePayment(category: "estimatedPayments" | "extensionPayments", index: number, updated: EstimatedPaymentEntry) {
    const rows = current[category] ?? [];
    onDataChange({ ...current, [category]: rows.map((entry, i) => i === index ? updated : entry) });
  }

  function addPayment() {
    onDataChange({
      ...current,
      estimatedPayments: [...payments, { ...emptyEstimatedPayment }],
    });
  }

  function removePayment(index: number) {
    onDataChange({
      ...current,
      estimatedPayments: payments.filter((_, i) => i !== index),
    });
  }

  const startedEstimates = payments.filter(entry => entry.date.trim() || hasEnteredAmount(entry.amount) || entry.receiptReference?.trim()
    || entry.application?.taxYear.trim() || entry.application?.confirmed != null);
  const amounts = startedEstimates.map(entry => entry.amount);
  const totalEstimated = amounts.every(amount => !amountError(amount, "payment amount"))
    ? sumGuidedDisplayAmounts(amounts)
    : null;

  return (
    <RetroShell title="Payments & Withholding" eyebrow="PAYMENTS">
      <div className="guided-question">
        <p className="guided-prompt">Tax you&apos;ve already paid this year.</p>
        <p className="guided-hint">
          Your W-2 withholding is already captured from your income section. Here, enter any
          additional estimated tax payments you made directly to the IRS (Form 1040-ES vouchers).
          If you didn&apos;t make any, just click Continue.
        </p>

        <h3 className="guided-w2-card-title" style={{ marginTop: "16px", marginBottom: "8px" }}>
          Estimated Tax Payments (Form 1040-ES)
        </h3>

        {payments.length > 0 && (
          <div className="guided-w2-stack">
            {payments.map((entry, index) => (
              <EstimatedPaymentCard
                key={index}
                index={index}
                entry={entry}
                onUpdate={updated => updatePayment("estimatedPayments", index, updated)}
                onRemove={() => removePayment(index)}
                removable={true}
                taxYear={taxYear}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          className="utility-button"
          onClick={addPayment}
          aria-label="Add another estimated tax payment"
        >
          + Add an estimated payment
        </button>

        <details className="guided-expand" style={{ marginTop: "16px" }}>
          <summary className="guided-expand-trigger">Other payments</summary>
          <div className="guided-expand-body">
            {current.otherPayments.trim() && <CurrencyField label="Saved other-payment total to classify" hint="Reconcile this saved total with the actual extension and applied-refund entries below. Excess Social Security withholding is computed from your W-2s." value={current.otherPayments} onChange={(otherPayments) => onDataChange({ ...current, otherPayments })} />}
            <h4>Federal extension payments</h4>
            {extensions.map((entry, index) => <div key={index} className="guided-w2-card">
              <label className="guided-field"><span className="guided-field-label">Extension payment #{index + 1} date</span><input className="guided-input" type="date" value={entry.date} onChange={(event) => updatePayment("extensionPayments", index, editPayment(entry, "date", event.target.value))} /></label>
              <CurrencyField label={`Extension payment #${index + 1} amount`} value={entry.amount} onChange={amount => updatePayment("extensionPayments", index, editPayment(entry, "amount", amount))} required />
              <PaymentReceiptReference label={`Extension payment #${index + 1}`} entry={entry} taxYear={taxYear} kind="extension"
                onUpdate={updated => updatePayment("extensionPayments", index, updated)} />
              <PaymentApplicationFields label={`Extension payment #${index + 1}`} entry={entry} taxYear={taxYear} kind="extension"
                onChange={application => updatePayment("extensionPayments", index, { ...entry, application })} />
              <button type="button" className="utility-button" onClick={() => onDataChange({ ...current, extensionPayments: extensions.filter((_, i) => i !== index) })}>Remove extension payment #{index + 1}</button>
            </div>)}
            <button type="button" className="utility-button" onClick={() => onDataChange({ ...current, extensionPayments: [...extensions, { ...emptyEstimatedPayment }] })}>Add extension payment</button>
            <h4>Prior-year federal refund applied to this return</h4>
            {appliedRefunds.map((entry, index) => <div key={index} className="guided-w2-card">
              <label className="guided-field"><span className="guided-field-label">Applied refund #{index + 1} source tax year</span><input className="guided-input" inputMode="numeric" value={entry.sourceTaxYear} onChange={(event) => onDataChange({ ...current, priorYearAppliedCredits: appliedRefunds.map((item, i) => i === index ? { ...item, sourceTaxYear: event.target.value } : item) })} /></label>
              <CurrencyField label={`Applied refund #${index + 1} amount`} value={entry.amount} onChange={(amount) => onDataChange({ ...current, priorYearAppliedCredits: appliedRefunds.map((item, i) => i === index ? { ...item, amount } : item) })} required />
              <button type="button" className="utility-button" onClick={() => onDataChange({ ...current, priorYearAppliedCredits: appliedRefunds.filter((_, i) => i !== index) })}>Remove applied refund #{index + 1}</button>
            </div>)}
            <button type="button" className="utility-button" onClick={() => onDataChange({ ...current, priorYearAppliedCredits: [...appliedRefunds, { sourceTaxYear: "", amount: "" }] })}>Add prior-year applied refund</button>
          </div>
        </details>

        <EstimatedTaxSourceDetails data={current.estimatedTaxFacts} appliedCredits={current.priorYearAppliedCredits} taxYear={taxYear} onChange={estimatedTaxFacts => onDataChange({ ...current, estimatedTaxFacts })} />

        {startedEstimates.length > 0 && (
          <div className="guided-ticker-grid" style={{ marginTop: "16px" }} role="status" aria-live="polite">
            <div className="guided-ticker-item">
              <span className="guided-ticker-label">Total Estimated Payments</span>
              <strong className="guided-ticker-value">
                {totalEstimated === null ? "Incomplete. Enter each payment amount." : formatGuidedCurrency(totalEstimated)}
              </strong>
            </div>
          </div>
        )}
      </div>
    </RetroShell>
  );
}
