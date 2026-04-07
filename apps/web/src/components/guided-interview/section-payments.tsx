"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type PaymentData,
  type EstimatedPaymentEntry,
  emptyEstimatedPayment,
  emptyPaymentData,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";

function EstimatedPaymentCard({
  index,
  entry,
  onUpdate,
  onRemove,
  removable,
}: {
  index: number;
  entry: EstimatedPaymentEntry;
  onUpdate: (field: keyof EstimatedPaymentEntry, value: string) => void;
  onRemove: () => void;
  removable: boolean;
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
            onChange={(e) => onUpdate("date", e.target.value)}
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
          onChange={(v) => onUpdate("amount", v)}
          required
        />
      </div>
    </div>
  );
}

export function SectionPayments({
  data,
  onDataChange,
}: {
  data: PaymentData | undefined;
  onDataChange: (data: PaymentData) => void;
}) {
  const current = data ?? emptyPaymentData;
  const payments = current.estimatedPayments;

  function updatePayment(index: number, field: keyof EstimatedPaymentEntry, value: string) {
    const next = payments.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry
    );
    onDataChange({ ...current, estimatedPayments: next });
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

  const totalEstimated = payments.reduce((sum, entry) => {
    const num = Number(entry.amount?.replace(/,/g, "") ?? "0");
    return sum + (Number.isNaN(num) ? 0 : num);
  }, 0);

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
                onUpdate={(field, value) => updatePayment(index, field, value)}
                onRemove={() => removePayment(index)}
                removable={true}
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
            <CurrencyField
              label="Other payments"
              hint="Extension payments, excess Social Security withheld, or other credits applied."
              value={current.otherPayments}
              onChange={(v) => onDataChange({ ...current, otherPayments: v })}
            />
          </div>
        </details>

        {totalEstimated > 0 && (
          <div className="guided-ticker-grid" style={{ marginTop: "16px" }} role="status" aria-live="polite">
            <div className="guided-ticker-item">
              <span className="guided-ticker-label">Total Estimated Payments</span>
              <strong className="guided-ticker-value">
                ${totalEstimated.toLocaleString("en-US", { minimumFractionDigits: 0 })}
              </strong>
            </div>
          </div>
        )}
      </div>
    </RetroShell>
  );
}
