"use client";

import { RetroShell } from "@/components/retro-shell";
import type { GuidedPreviewMetrics, StatePreviewMetrics } from "@/lib/guided-interview-bridge";
import {
  type StateReturnData,
  type StateEstimatedPaymentEntry,
  emptyStateEstimatedPayment,
  emptyStateReturnData,
  emptyStateWithholdingEntry,
  type StateWithholdingEntry,
  supportedStates,
  type SupportedStateCode,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { formatGuidedCurrency, parseGuidedDisplayAmount } from "@/lib/guided-currency";
import { stateWithholdingDocumentTypes } from "@/lib/guided-state-facts";
import { TextFact } from "./fact-fields";

const formatCurrency = formatGuidedCurrency;

function PaymentState({ value, onChange }: { value: string | undefined; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">State shown in the payment or withholding record</span><select className="guided-input" value={value ?? ""} onChange={(event) => onChange(event.target.value)}><option value="">Confirm actual state</option>{supportedStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label>;
}

function StateEstimatedPaymentCard({
  index,
  entry,
  onUpdate,
  onRemove,
  removable,
}: {
  index: number;
  entry: StateEstimatedPaymentEntry;
  onUpdate: (field: keyof StateEstimatedPaymentEntry, value: string) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="guided-card">
      <div className="guided-card-header">
        <h3 className="guided-card-title">State Payment {index + 1}</h3>
        {removable && (
          <button
            type="button"
            className="guided-card-remove"
            onClick={onRemove}
            aria-label={`Remove state estimated payment ${index + 1}`}
          >
            Remove
          </button>
        )}
      </div>
      <div className="guided-form-grid">
        <PaymentState value={entry.state} onChange={(value) => onUpdate("state", value)} />
        <label className="guided-field">
          <span className="guided-field-label">Date paid</span>
          <input
            type="date"
            className="guided-input"
            value={entry.date}
            onChange={(e) => onUpdate("date", e.target.value)}
            aria-describedby={`state-payment-${index}-date-hint`}
          />
          <span className="guided-field-hint" id={`state-payment-${index}-date-hint`}>
            Enter the date you sent this payment to the state.
          </span>
        </label>
        <CurrencyField
          label="Amount"
          value={entry.amount}
          onChange={(v) => onUpdate("amount", v)}
          required
        />
      </div>
    </div>
  );
}

function StateSummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "positive" | "negative";
}) {
  const className = [
    "guided-ticker-breakdown-row",
    highlight === "positive" ? "guided-ticker-breakdown-refund" : "",
    highlight === "negative" ? "guided-ticker-breakdown-owed" : "",
    highlight ? "guided-ticker-breakdown-result" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <span className="guided-ticker-breakdown-label">{label}</span>
      <span className="guided-ticker-breakdown-value">{value}</span>
    </div>
  );
}

export function SectionStateReturn({
  stateCode,
  data,
  guidedPreview,
  onDataChange,
}: {
  stateCode: SupportedStateCode;
  data: StateReturnData | undefined;
  guidedPreview: GuidedPreviewMetrics | null;
  onDataChange: (data: StateReturnData) => void;
}) {
  const current = data ?? emptyStateReturnData;
  const stateName = supportedStates.find((s) => s.code === stateCode)?.name ?? stateCode;
  const stateMetrics: StatePreviewMetrics | null = guidedPreview?.state ?? null;

  const stateRefund = parseGuidedDisplayAmount(stateMetrics?.stateRefund);
  const stateOwed = parseGuidedDisplayAmount(stateMetrics?.stateAmountOwed);
  const withholdingEntries = current.additionalStateWithholdingEntries ?? [];

  function updateWithholding(index: number, field: keyof StateWithholdingEntry, value: string) {
    onDataChange({ ...current, additionalStateWithholdingEntries: withholdingEntries.map((entry, entryIndex) => entryIndex === index ? { ...entry, [field]: value } : entry) });
  }

  function handleAddPayment() {
    onDataChange({
      ...current,
      stateEstimatedPayments: [...current.stateEstimatedPayments, { ...emptyStateEstimatedPayment }],
    });
  }

  function handleRemovePayment(index: number) {
    const next = current.stateEstimatedPayments.filter((_, i) => i !== index);
    onDataChange({ ...current, stateEstimatedPayments: next });
  }

  function handleUpdatePayment(index: number, field: keyof StateEstimatedPaymentEntry, value: string) {
    const next = current.stateEstimatedPayments.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry
    );
    onDataChange({ ...current, stateEstimatedPayments: next });
  }

  return (
    <RetroShell title={`${stateName} State Return`} eyebrow="STATE">
      <div className="guided-question">
        <p className="guided-prompt">
          Let&apos;s wrap up your {stateName} state return.
        </p>
        <p className="guided-hint">
          The state preview is available when the required source facts are complete.
          Review the summary and enter your actual state estimated payments.
        </p>

        {stateMetrics ? (
          <div className="guided-ticker-breakdown" style={{ marginTop: "16px", marginBottom: "16px" }} role="status" aria-live="polite">
            <StateSummaryRow
              label={`${stateMetrics.stateName} (${stateMetrics.stateCode})`}
              value=""
            />
            <StateSummaryRow
              label="State Tax"
              value={formatCurrency(stateMetrics.stateTax)}
            />
            <StateSummaryRow
              label="State Payments"
              value={formatCurrency(stateMetrics.stateWithholding)}
            />
            <StateSummaryRow
              label={stateRefund.gt(0) ? "State Refund" : stateOwed.gt(0) ? "State Balance Due" : "State Result"}
              value={
                stateRefund.gt(0)
                  ? formatCurrency(stateMetrics.stateRefund)
                  : stateOwed.gt(0)
                    ? formatCurrency(stateMetrics.stateAmountOwed)
                    : "—"
              }
              highlight={stateRefund.gt(0) ? "positive" : stateOwed.gt(0) ? "negative" : undefined}
            />
          </div>
        ) : (
          <div className="guided-badge-row" style={{ marginTop: "16px", marginBottom: "16px" }}>
            <span className="guided-badge guided-badge-neutral">
              Enter more income data above to see your state estimate
            </span>
          </div>
        )}

        <h3 className="guided-section-subheading">Additional State Withholding</h3>
        <p className="guided-hint">
          If you had state tax withheld from sources other than your W-2
          (e.g., 1099 withholding, backup withholding), enter the total here.
          W-2 state withholding is already included automatically.
        </p>
        {withholdingEntries.map((entry, index) => <div className="guided-card" key={index}>
          <div className="guided-card-header"><h3 className="guided-card-title">Additional state withholding {index + 1}</h3><button type="button" className="utility-button" onClick={() => onDataChange({ ...current, additionalStateWithholdingEntries: withholdingEntries.filter((_, entryIndex) => entryIndex !== index) })}>Remove</button></div>
          <TextFact label="Payer from source form" value={entry.payer} onChange={(value) => updateWithholding(index, "payer", value)} />
          <label className="guided-field"><span className="guided-field-label">Source form</span><select className="guided-input" value={entry.documentType} onChange={(event) => updateWithholding(index, "documentType", event.target.value)}><option value="">Choose actual form</option>{stateWithholdingDocumentTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <PaymentState value={entry.state} onChange={(value) => updateWithholding(index, "state", value)} />
          <TextFact label="Source form tax year" value={entry.taxYear} onChange={(value) => updateWithholding(index, "taxYear", value)} />
          <CurrencyField label="State withholding on this form" hint="Exclude any amount already entered in another source form or in additional income taxes." value={entry.amount} onChange={(value) => updateWithholding(index, "amount", value)} />
        </div>)}
        <button type="button" className="utility-button" onClick={() => onDataChange({ ...current, additionalStateWithholdingEntries: [...withholdingEntries, { ...emptyStateWithholdingEntry }] })}>+ Add withholding source</button>
        {current.additionalStateWithholding.trim() && <div className="guided-form-grid">
          <CurrencyField
            label="Saved additional withholding total to reconcile"
            hint="Identify the actual source forms above; this total alone cannot establish the payment source."
            value={current.additionalStateWithholding}
            onChange={(v) => onDataChange({ ...current, additionalStateWithholding: v })}
          />
        </div>}

        <h3 className="guided-section-subheading" style={{ marginTop: "24px" }}>
          State Estimated Tax Payments
        </h3>
        <p className="guided-hint">
          Did you make estimated tax payments to {stateName} during the year?
          These are quarterly payments you sent directly to the state.
        </p>

        {current.stateEstimatedPayments.map((entry, index) => (
          <StateEstimatedPaymentCard
            key={index}
            index={index}
            entry={entry}
            onUpdate={(field, value) => handleUpdatePayment(index, field, value)}
            onRemove={() => handleRemovePayment(index)}
            removable={current.stateEstimatedPayments.length > 1}
          />
        ))}

        <button
          type="button"
          className="utility-button"
          onClick={handleAddPayment}
          style={{ marginTop: "12px" }}
          aria-label="Add another state estimated tax payment"
        >
          + Add State Estimated Payment
        </button>

        <details className="guided-expand" style={{ marginTop: "16px" }}>
          <summary className="guided-expand-trigger">About your {stateName} return</summary>
          <div className="guided-expand-body">
            <p>
              Your state return is computed from your federal adjusted gross income
              using {stateName}&apos;s tax rates, standard deduction, and personal exemptions.
              The engine applies state-specific brackets and credits automatically.
              Any state withholding from your W-2s and estimated payments is credited against
              your state tax to determine your refund or balance due. This feature is
              beta and experimental, is not comprehensive yet, and everything should
              be reviewed and verified by the tax preparer before filing.
            </p>
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
