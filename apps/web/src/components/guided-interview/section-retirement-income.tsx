"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type RetirementEntryData,
  emptyRetirementEntry,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";

const distributionCodeOptions = [
  { value: "1", label: "1 — Early distribution (before age 59½)", hint: "May be subject to 10% penalty" },
  { value: "2", label: "2 — Early distribution, exception applies" },
  { value: "3", label: "3 — Disability" },
  { value: "4", label: "4 — Death" },
  { value: "7", label: "7 — Normal distribution (age 59½ or older)", hint: "Most common for retirees" },
  { value: "G", label: "G — Direct rollover to qualified plan or IRA" },
];

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
          hint="Copy Box 2a, including an explicit zero. If blank or not determined, leave it blank for review; calculation waits for the taxable amount."
          value={entry.taxableAmount}
          onChange={(v) => onUpdate("taxableAmount", v)}
          required
        />
        <CurrencyField
          label="Federal tax withheld (Box 4)"
          value={entry.federalWithheld}
          onChange={(v) => onUpdate("federalWithheld", v)}
        />

        <label className="guided-field">
          <span className="guided-field-label">Distribution code (Box 7)</span>
          <select
            className="guided-input"
            value={entry.distributionCode}
            onChange={(e) => onUpdate("distributionCode", e.target.value)}
            aria-describedby={`retirement-${index}-dist-hint`}
          >
            <option value="">Choose the code printed on your form</option>
            {distributionCodeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="guided-field-hint" id={`retirement-${index}-dist-hint`}>
            Use the code printed in Box 7; do not select one based on age alone.
          </span>
        </label>

        <label className="guided-field guided-checkbox-field">
          <input
            type="checkbox"
            checked={entry.isIraSepSimple}
            onChange={(e) => onUpdate("isIraSepSimple", e.target.checked)}
            className="guided-option-checkbox"
          />
          <span className="guided-field-label">IRA / SEP / SIMPLE (Box 7 checkbox)</span>
        </label>
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
      i === index ? { ...entry, [field]: value } : entry
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
          pensions, and annuities. You&apos;ll find all the info you need on your 1099-R form.
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
              Box 1 shows the total distribution amount. Box 2a shows how much is taxable — for most
              traditional IRA and 401(k) distributions, this equals Box 1. For Roth distributions,
              Box 2a may be $0 if it&apos;s a qualified distribution.
            </p>
            <p>
              The distribution code in Box 7 tells the IRS (and us) whether this was a normal
              distribution, early withdrawal, rollover, or something else. Code 7 is the most
              common for retirees. Code 1 means early distribution with a potential 10% penalty.
              Code G means it was a direct rollover and isn&apos;t taxable.
            </p>
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
