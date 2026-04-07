"use client";

import { useCallback, useEffect } from "react";
import { RetroShell } from "@/components/retro-shell";
import {
  type DependentEntryData,
  type DependentRelationship,
  type PersonalInfoData,
  type FilingStatus,
  dependentRelationshipOptions,
  emptyDependentEntry,
  emptyPersonalInfo,
  filingStatusOptions,
} from "@/lib/guided-interview-flow";

function DependentCard({
  index,
  entry,
  onChange,
  onRemove,
}: {
  index: number;
  entry: DependentEntryData;
  onChange: (updated: DependentEntryData) => void;
  onRemove: () => void;
}) {
  return (
    <div className="guided-card">
      <div className="guided-card-header">
        <h3 className="guided-card-title">Dependent {index + 1}</h3>
        <button
          type="button"
          className="guided-card-remove"
          onClick={onRemove}
          aria-label={`Remove dependent ${index + 1}`}
        >
          Remove
        </button>
      </div>

      <div className="guided-form-grid">
        <label className="guided-field">
          <span className="guided-field-label">First name</span>
          <input
            type="text"
            className="guided-input"
            value={entry.firstName}
            onChange={(e) => onChange({ ...entry, firstName: e.target.value })}
            placeholder="First name"
            aria-required="true"
          />
        </label>
        <label className="guided-field">
          <span className="guided-field-label">Last name</span>
          <input
            type="text"
            className="guided-input"
            value={entry.lastName}
            onChange={(e) => onChange({ ...entry, lastName: e.target.value })}
            placeholder="Last name"
            aria-required="true"
          />
        </label>
      </div>

      <label className="guided-field">
        <span className="guided-field-label">SSN</span>
        <input
          type="text"
          className="guided-input guided-input-narrow"
          value={entry.ssn}
          onChange={(e) => onChange({ ...entry, ssn: e.target.value })}
          placeholder="000-00-0000"
          inputMode="numeric"
          maxLength={11}
          autoComplete="off"
          aria-required="true"
        />
      </label>

      <div className="guided-form-grid">
        <label className="guided-field">
          <span className="guided-field-label">Date of birth</span>
          <input
            type="date"
            className="guided-input"
            value={entry.dateOfBirth}
            onChange={(e) => onChange({ ...entry, dateOfBirth: e.target.value })}
            aria-describedby={`dep-${index}-dob-hint`}
          />
          <span className="guided-field-hint" id={`dep-${index}-dob-hint`}>
            Used to determine child tax credit eligibility (under 17)
          </span>
        </label>
        <label className="guided-field">
          <span className="guided-field-label">Relationship</span>
          <select
            className="guided-input"
            value={entry.relationship}
            onChange={(e) => onChange({ ...entry, relationship: e.target.value as DependentRelationship })}
          >
            {dependentRelationshipOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="guided-field">
        <span className="guided-field-label">Months lived with you</span>
        <input
          type="number"
          className="guided-input guided-input-narrow"
          value={entry.monthsLivedWithYou}
          onChange={(e) => onChange({ ...entry, monthsLivedWithYou: e.target.value })}
          min="0"
          max="12"
          aria-required="true"
        />
      </label>

      <fieldset className="guided-badge-row guided-fieldset">
        <legend className="guided-fieldset-legend">Credit eligibility</legend>
        <label className="guided-checkbox-field">
          <input
            type="checkbox"
            checked={entry.qualifiesForCTC}
            onChange={(e) => onChange({ ...entry, qualifiesForCTC: e.target.checked })}
          />
          <span>Child tax credit (CTC)</span>
        </label>
        <label className="guided-checkbox-field">
          <input
            type="checkbox"
            checked={entry.qualifiesForODC}
            onChange={(e) => onChange({ ...entry, qualifiesForODC: e.target.checked })}
          />
          <span>Other dependent credit (ODC)</span>
        </label>
        <label className="guided-checkbox-field">
          <input
            type="checkbox"
            checked={entry.qualifiesForEIC}
            onChange={(e) => onChange({ ...entry, qualifiesForEIC: e.target.checked })}
          />
          <span>Earned income credit (EIC)</span>
        </label>
      </fieldset>

      <details className="guided-expand">
        <summary className="guided-expand-trigger">Help with credit eligibility</summary>
        <div className="guided-expand-body">
          <p>
            <strong>Child Tax Credit (CTC):</strong> Your child must be under 17 at the end of the year,
            be a U.S. citizen, and have lived with you for more than half the year.
          </p>
          <p>
            <strong>Other Dependent Credit (ODC):</strong> For dependents who don&apos;t qualify for the CTC,
            such as older children (17+), parents, or other qualifying relatives.
          </p>
          <p>
            <strong>Earned Income Credit (EIC):</strong> Your qualifying child must meet age, residency,
            and relationship requirements. Check CTC <em>and</em> EIC for children under 17 who
            lived with you for more than half the year.
          </p>
        </div>
      </details>
    </div>
  );
}

export function SectionPersonalInfo({
  data,
  filingStatus,
  onDataChange,
}: {
  data: PersonalInfoData | undefined;
  filingStatus: FilingStatus | null;
  onDataChange: (data: PersonalInfoData) => void;
}) {
  const current = data ?? emptyPersonalInfo;
  const depCount = Number(current.dependentCount) || 0;
  const dependents = current.dependents ?? [];

  function update(field: keyof PersonalInfoData, value: string) {
    onDataChange({ ...current, [field]: value });
  }

  // Sync dependents array length when dependentCount changes
  const syncDependents = useCallback((nextCount: number, currentDeps: DependentEntryData[]) => {
    if (nextCount <= 0) return [];
    if (nextCount === currentDeps.length) return currentDeps;
    if (nextCount < currentDeps.length) return currentDeps.slice(0, nextCount);
    const toAdd = nextCount - currentDeps.length;
    return [...currentDeps, ...Array.from({ length: toAdd }, () => ({ ...emptyDependentEntry }))];
  }, []);

  useEffect(() => {
    const synced = syncDependents(depCount, dependents);
    if (synced.length !== dependents.length) {
      onDataChange({ ...current, dependents: synced });
    }
  }, [depCount]);

  function handleDependentCountChange(value: string) {
    const nextCount = Number(value) || 0;
    const synced = syncDependents(nextCount, dependents);
    onDataChange({ ...current, dependentCount: value, dependents: synced });
  }

  function handleDependentChange(index: number, updated: DependentEntryData) {
    const next = [...dependents];
    next[index] = updated;
    onDataChange({ ...current, dependents: next });
  }

  function handleRemoveDependent(index: number) {
    const next = dependents.filter((_, i) => i !== index);
    onDataChange({ ...current, dependentCount: String(next.length), dependents: next });
  }

  const filingLabel = filingStatus
    ? filingStatusOptions.find((o) => o.value === filingStatus)?.label ?? filingStatus
    : "Not selected";

  return (
    <RetroShell title="About You" eyebrow="PERSONAL INFO">
      <div className="guided-question">
        <p className="guided-prompt">Let&apos;s start with the basics.</p>
        <p className="guided-hint">
          Your name and address as they&apos;ll appear on the return. We pre-filled your filing
          status from the earlier step.
        </p>

        <div className="guided-field-row">
          <span className="guided-field-label">Filing status</span>
          <span className="guided-field-badge">{filingLabel}</span>
        </div>

        <div className="guided-form-grid guided-form-grid-3">
          <label className="guided-field">
            <span className="guided-field-label">First name</span>
            <input
              type="text"
              className="guided-input"
              value={current.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              placeholder="Jane"
              autoComplete="given-name"
              aria-required="true"
            />
          </label>
          <label className="guided-field">
            <span className="guided-field-label">Middle name or initial</span>
            <input
              type="text"
              className="guided-input"
              value={current.middleName ?? ""}
              onChange={(e) => update("middleName", e.target.value)}
              placeholder="Taylor or T"
              autoComplete="additional-name"
            />
          </label>
          <label className="guided-field">
            <span className="guided-field-label">Last name</span>
            <input
              type="text"
              className="guided-input"
              value={current.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              placeholder="Doe"
              autoComplete="family-name"
              aria-required="true"
            />
          </label>
        </div>

        <label className="guided-field">
          <span className="guided-field-label">Social Security number</span>
          <input
            type="text"
            className="guided-input guided-input-narrow"
            value={current.ssn}
            onChange={(e) => update("ssn", e.target.value)}
            placeholder="000-00-0000"
            inputMode="numeric"
            maxLength={11}
            autoComplete="off"
            aria-required="true"
            aria-describedby="ssn-hint"
          />
          <span className="guided-field-hint" id="ssn-hint">This stays in your browser and is never sent to any server.</span>
        </label>

        <label className="guided-field">
          <span className="guided-field-label">Address line 1</span>
          <input
            type="text"
            className="guided-input"
            value={current.addressLine1}
            onChange={(e) => update("addressLine1", e.target.value)}
            placeholder="123 Main St"
            autoComplete="address-line1"
            aria-required="true"
          />
        </label>

        <label className="guided-field">
          <span className="guided-field-label">Address line 2 (optional)</span>
          <input
            type="text"
            className="guided-input"
            value={current.addressLine2}
            onChange={(e) => update("addressLine2", e.target.value)}
            placeholder="Apt 4B"
            autoComplete="address-line2"
          />
        </label>

        <div className="guided-form-grid guided-form-grid-3">
          <label className="guided-field">
            <span className="guided-field-label">City</span>
            <input
              type="text"
              className="guided-input"
              value={current.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Springfield"
              autoComplete="address-level2"
              aria-required="true"
            />
          </label>
          <label className="guided-field">
            <span className="guided-field-label">State</span>
            <input
              type="text"
              className="guided-input"
              value={current.state}
              onChange={(e) => update("state", e.target.value)}
              placeholder="IL"
              maxLength={2}
              autoComplete="address-level1"
              aria-required="true"
            />
          </label>
          <label className="guided-field">
            <span className="guided-field-label">ZIP</span>
            <input
              type="text"
              className="guided-input"
              value={current.zip}
              onChange={(e) => update("zip", e.target.value)}
              placeholder="62704"
              inputMode="numeric"
              maxLength={10}
              autoComplete="postal-code"
              aria-required="true"
            />
          </label>
        </div>

        <label className="guided-field">
          <span className="guided-field-label">Number of dependents</span>
          <input
            type="number"
            className="guided-input guided-input-narrow"
            value={current.dependentCount}
            onChange={(e) => handleDependentCountChange(e.target.value)}
            min="0"
            max="20"
            aria-describedby="dependent-count-hint"
          />
          <span className="guided-field-hint" id="dependent-count-hint">
            We&apos;ll use this to estimate child tax credit and dependent deductions.
          </span>
        </label>

        {depCount > 0 && (
          <div className="guided-w2-stack">
            <h3 className="guided-section-subheading">
              Tell us about your {depCount === 1 ? "dependent" : `${depCount} dependents`}
            </h3>
            <p className="guided-hint">
              We need a few details for each dependent to calculate credits accurately.
              The child tax credit is up to $2,000 per qualifying child under 17.
            </p>
            {dependents.map((dep, i) => (
              <DependentCard
                key={i}
                index={i}
                entry={dep}
                onChange={(updated) => handleDependentChange(i, updated)}
                onRemove={() => handleRemoveDependent(i)}
              />
            ))}
          </div>
        )}
      </div>
    </RetroShell>
  );
}
