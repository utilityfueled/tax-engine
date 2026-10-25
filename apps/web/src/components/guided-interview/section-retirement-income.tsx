"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type RetirementEntryData,
  emptyRetirementEntry,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { RetirementSourceFields } from "./retirement-source-fields";

function RetirementCard({
  index,
  entry,
  onUpdate,
  onRemove,
  removable,
}: {
  index: number;
  entry: RetirementEntryData;
  onUpdate: <K extends keyof RetirementEntryData>(field: K, value: RetirementEntryData[K]) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="guided-w2-card">
      <div className="guided-w2-card-header">
        <h3 className="guided-w2-card-title">
          1099-R #{index + 1}{entry.payer ? ` — ${entry.payer}` : ""}
        </h3>
        {removable && (
          <button
            type="button"
            className="utility-button utility-button-small utility-button-danger"
            onClick={onRemove}
            aria-label={`Remove 1099-R #${index + 1}${entry.payer ? ` — ${entry.payer}` : ""}`}
          >
            Remove
          </button>
        )}
      </div>

      <div className="guided-form-grid">
        <label className="guided-field" style={{ gridColumn: "1 / -1" }}>
          <span className="guided-field-label">Payer name (Box — top)</span>
          <input
            type="text"
            className="guided-input"
            value={entry.payer}
            onChange={(e) => onUpdate("payer", e.target.value)}
            placeholder="e.g. Fidelity Investments"
            aria-required="true"
          />
        </label>

        <CurrencyField
          label="Gross distribution (Box 1)"
          hint="Total amount distributed before taxes"
          value={entry.grossDistribution}
          onChange={(v) => onUpdate("grossDistribution", v)}
          required
        />
        <CurrencyField
          label="Taxable amount (Box 2a)"
          hint="Use the actual taxable amount established by the source and applicable basis worksheet. A blank Box 2a is unknown; do not copy the gross distribution or assume zero."
          value={entry.taxableAmount}
          onChange={(v) => onUpdate("taxableAmount", v)}
          required
        />
        <CurrencyField
          label="Federal tax withheld (Box 4)"
          value={entry.federalWithheld}
          onChange={(v) => onUpdate("federalWithheld", v)}
          required
        />

        <label className="guided-field">
          <span className="guided-field-label">Distribution code ({entry.sourceTaxYear === "2026" ? "Box 7a" : "Box 7"})</span>
          <input
            className="guided-input"
            value={entry.requiresCodeConfirmation ? "" : entry.distributionCode}
            onChange={(e) => onUpdate("distributionCode", e.target.value)}
            aria-describedby={`retirement-${index}-dist-hint`}
          />
          <span className="guided-field-hint" id={`retirement-${index}-dist-hint`}>
            Enter every code printed in Box 7 (2026 Box 7a); do not infer a code from age.
            {entry.requiresCodeConfirmation ? ` Saved code ${entry.distributionCode} needs confirmation because older versions prefilled it.` : ""}
          </span>
        </label>

        <RetirementSourceFields entry={entry} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

export function SectionRetirementIncome({
  entries,
  onEntriesChange,
}: {
  entries: RetirementEntryData[];
  onEntriesChange: (entries: RetirementEntryData[]) => void;
}) {
  function updateEntry<K extends keyof RetirementEntryData>(
    index: number,
    field: K,
    value: RetirementEntryData[K],
  ) {
    const next = entries.map((entry, i) =>
      i === index ? { ...entry, sourceFactsConfirmed: null, [field]: value, ...(field === "distributionCode" ? { requiresCodeConfirmation: false } : {}), ...(field === "isIraSepSimple" ? { requiresIraConfirmation: false } : {}) } : entry
    );
    onEntriesChange(next);
  }

  function addEntry() {
    onEntriesChange([...entries, { ...emptyRetirementEntry }]);
  }

  function removeEntry(index: number) {
    if (entries.length <= 1) return;
    onEntriesChange(entries.filter((_, i) => i !== index));
  }

  return (
    <RetroShell title="Retirement Income" eyebrow="INCOME">
      <div className="guided-question">
        <p className="guided-prompt">Let&apos;s enter your retirement distributions.</p>
        <p className="guided-hint">
          Enter each 1099-R you received. This covers IRA withdrawals, 401(k) distributions,
          pensions, and annuities. You may also need actual basis, rollover or other source records to establish taxability.
        </p>

        <div className="guided-w2-stack">
          {entries.map((entry, index) => (
            <RetirementCard
              key={index}
              index={index}
              entry={entry}
              onUpdate={(field, value) => updateEntry(index, field, value)}
              onRemove={() => removeEntry(index)}
              removable={entries.length > 1}
            />
          ))}
        </div>

        <button
          type="button"
          className="utility-button"
          onClick={addEntry}
          style={{ marginTop: "12px" }}
          aria-label="Add another 1099-R retirement distribution form"
        >
          + Add another 1099-R
        </button>

        <details className="guided-expand" style={{ marginTop: "16px" }}>
          <summary className="guided-expand-trigger">Learn more about 1099-R</summary>
          <div className="guided-expand-body">
            <p>
              Form 1099-R reports distributions from retirement plans, IRAs, pensions, and annuities.
              Box 1 shows the total distribution amount. A reported Box 2a does not establish that
              nondeductible basis, a rollover or another exclusion is absent. Confirm the actual
              taxable amount using the applicable source records and worksheets.
            </p>
            <p>
              The distribution code in Box 7 (2026 Box 7a) identifies the reported distribution.
              Code 1 may carry an additional tax. Code G identifies a direct rollover, but a
              rollover to a Roth account may be taxable. This ordinary route requires a confirmed
              nontaxable rollover; conversions need their actual source and basis worksheets.
            </p>
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
