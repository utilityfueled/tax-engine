"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type RentalPropertyEntryData,
  type RentalPropertyType,
  emptyRentalPropertyEntry,
  rentalPropertyTypeOptions,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";

function RentalPropertyCard({
  entry,
  index,
  onEntryChange,
  onRemove,
  canRemove,
}: {
  entry: RentalPropertyEntryData;
  index: number;
  onEntryChange: (updated: RentalPropertyEntryData) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  function update(field: keyof RentalPropertyEntryData, value: string) {
    onEntryChange({ ...entry, [field]: value });
  }

  return (
    <div className="guided-w2-card">
      <div className="guided-w2-card-header">
        <h3 className="guided-w2-card-title">
          {entry.description || `Property #${index + 1}`}
        </h3>
        {canRemove && (
          <button
            className="utility-button utility-button-small"
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${entry.description || `property #${index + 1}`}`}
          >
            Remove
          </button>
        )}
      </div>

      <div className="guided-form-grid">
        <label className="guided-field" style={{ gridColumn: "1 / -1" }}>
          <span className="guided-field-label">
            Property description
          </span>
          <input
            type="text"
            className="guided-input"
            value={entry.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="123 Main St, Apt 2"
            aria-required="true"
            aria-describedby={`rental-${index}-desc-hint`}
          />
          <span className="guided-field-hint" id={`rental-${index}-desc-hint`}>Address or short name (e.g. &quot;123 Oak St, Unit B&quot;)</span>
        </label>

        <label className="guided-field">
          <span className="guided-field-label">Property type</span>
          <select
            className="guided-input"
            value={entry.propertyType}
            onChange={(e) =>
              onEntryChange({ ...entry, propertyType: e.target.value as RentalPropertyType })
            }
          >
            {rentalPropertyTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <CurrencyField
          label="Rental income received"
          hint="Total rents collected during the year"
          value={entry.rents}
          onChange={(v) => update("rents", v)}
          required
        />
      </div>

      <details className="guided-expand">
          <summary className="guided-expand-trigger">Rental expenses</summary>
          <div className="guided-expand-body guided-form-grid guided-form-grid-3">
            <CurrencyField
              label="Mortgage interest"
              value={entry.mortgageInterest}
              onChange={(v) => update("mortgageInterest", v)}
            />
            <CurrencyField
              label="Property taxes"
              value={entry.taxes}
              onChange={(v) => update("taxes", v)}
            />
            <CurrencyField
              label="Insurance"
              value={entry.insurance}
              onChange={(v) => update("insurance", v)}
            />
            <CurrencyField
              label="Repairs & maintenance"
              value={entry.repairs}
              onChange={(v) => update("repairs", v)}
            />
            <CurrencyField
              label="Utilities"
              value={entry.utilities}
              onChange={(v) => update("utilities", v)}
            />
            <CurrencyField
              label="Depreciation"
              hint="Annual building depreciation"
              value={entry.depreciation}
              onChange={(v) => update("depreciation", v)}
            />
            <CurrencyField
              label="Other expenses"
              hint="Management fees, advertising, etc."
              value={entry.otherExpenses}
              onChange={(v) => update("otherExpenses", v)}
            />
          </div>
      </details>
    </div>
  );
}

export function SectionRentalIncome({
  entries,
  onEntriesChange,
}: {
  entries: RentalPropertyEntryData[];
  onEntriesChange: (next: RentalPropertyEntryData[]) => void;
}) {
  function handleEntryChange(index: number, updated: RentalPropertyEntryData) {
    const next = [...entries];
    next[index] = updated;
    onEntriesChange(next);
  }

  function handleRemove(index: number) {
    onEntriesChange(entries.filter((_, i) => i !== index));
  }

  function handleAdd() {
    onEntriesChange([...entries, emptyRentalPropertyEntry]);
  }

  return (
    <RetroShell title="Rental Income" eyebrow="INCOME // SCHEDULE E">
      <div className="guided-question">
        <p className="guided-prompt">Tell us about your rental properties.</p>
        <p className="guided-hint">
          Enter each property separately. We&apos;ll use this for Schedule E of your return.
          Click &quot;Rental expenses&quot; to enter deductible costs for each property.
        </p>
      </div>

      <div className="guided-w2-stack">
        {entries.map((entry, index) => (
          <RentalPropertyCard
            key={index}
            entry={entry}
            index={index}
            onEntryChange={(updated) => handleEntryChange(index, updated)}
            onRemove={() => handleRemove(index)}
            canRemove={entries.length > 1}
          />
        ))}
      </div>

      <button className="utility-button" type="button" onClick={handleAdd} aria-label="Add another rental property">
        + Add another property
      </button>
    </RetroShell>
  );
}
