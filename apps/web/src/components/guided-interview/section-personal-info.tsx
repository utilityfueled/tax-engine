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
  emptySpouseInfo,
  filingStatusOptions,
} from "@/lib/guided-interview-flow";
import { BooleanFact } from "./fact-fields";
import { StandardDeductionSourceDetails } from "./standard-deduction-source-details";
import { EicClaimantSourceDetails } from "./eic-claimant-source-details";
import { EicSeparatedSpouseDetails } from "./eic-separated-spouse-details";
import { EicDisallowanceHistoryDetails } from "./eic-disallowance-history-details";
import { hasRecordedEicChild } from "@/lib/guided-eic-separated-spouse";
import { CurrencyField } from "./currency-field";

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
            <option value="">Choose relationship</option>
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

      <fieldset className="guided-fieldset">
        <legend className="guided-fieldset-legend">Credit eligibility</legend>
        {([ ["qualifiesForCTC", "Child tax credit (CTC)"], ["qualifiesForODC", "Other dependent credit (ODC)"], ["qualifiesForEIC", "Earned income credit (EIC)"] ] as const).map(([field, label]) => (
          <label className="guided-field" key={field}>
            <span className="guided-field-label">{label}</span>
            <select className="guided-input" value={entry[field] == null ? "" : String(entry[field])}
              onChange={(event) => onChange({ ...entry, [field]: event.target.value === "" ? null : event.target.value === "true" })} aria-required="true">
              <option value="">Needs review</option>
              <option value="true">Yes — requirements reviewed</option>
              <option value="false">No</option>
            </select>
          </label>
        ))}
        {entry.qualifiesForCTC && <BooleanFact label="Does this child meet the timely employment-valid SSN requirement (or documented born-and-died exception)?" value={entry.ctcSsnEligible} onChange={(value) => onChange({ ...entry, ctcSsnEligible: value })} />}
        {entry.qualifiesForODC && <BooleanFact label="Does this dependent meet the timely taxpayer ID requirement for ODC?" value={entry.odcTinEligible} onChange={(value) => onChange({ ...entry, odcTinEligible: value })} />}
      </fieldset>

      <details className="guided-expand">
        <summary className="guided-expand-trigger">Help with credit eligibility</summary>
        <div className="guided-expand-body">
          <p>Review the applicable year's requirements before answering. Age and residency alone do not establish eligibility. The child credit also has taxpayer and child identification requirements.</p>
          <p><a href="https://www.irs.gov/instructions/i1040s8" target="_blank" rel="noreferrer">IRS Schedule 8812 instructions</a> and <a href="https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit" target="_blank" rel="noreferrer">IRS earned income credit requirements</a>.</p>

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
  const claimsDependentCredit = dependents.some((entry) => entry.qualifiesForCTC || entry.qualifiesForODC);

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
          <span className="guided-field-hint" id="ssn-hint">Your taxpayer ID is sensitive. Review downloads omit it; complete filing exports are not yet available.</span>
        </label>

        <fieldset className="guided-fieldset"><legend className="guided-fieldset-legend">Your credit identification requirements</legend>
          <BooleanFact label="Was your employment-valid SSN issued by the return due date, including extensions?" value={current.employmentValidSsnIssuedByDueDate} onChange={(value) => onDataChange({ ...current, employmentValidSsnIssuedByDueDate: value })} />
          {claimsDependentCredit && <BooleanFact label="Was your SSN or ITIN issued by the return due date, including extensions?" value={current.tinIssuedByDueDate} onChange={(value) => onDataChange({ ...current, tinIssuedByDueDate: value })} />}
          <p className="guided-hint">Review the actual identification requirements and issuance date. A timely employment-valid SSN establishes the timely taxpayer ID requirement.</p>
        </fieldset>

        <div className="guided-form-grid">
          <label className="guided-field"><span className="guided-field-label">Your date of birth</span>
            <input type="date" className="guided-input" value={current.dateOfBirth ?? ""} onChange={(event) => update("dateOfBirth", event.target.value)} aria-required="true" autoComplete="bday" />
          </label>
          <label className="guided-field"><span className="guided-field-label">Months of U.S. residency</span>
            <input type="number" min="0" max="12" className="guided-input" value={current.usResidencyMonths ?? ""} onChange={(event) => update("usResidencyMonths", event.target.value)} aria-required="true" />
          </label>
          <label className="guided-field"><span className="guided-field-label">State residency</span>
            <select className="guided-input" value={current.stateResidency ?? ""} onChange={(event) => onDataChange({ ...current, stateResidency: (event.target.value || null) as PersonalInfoData["stateResidency"] })} aria-required="true">
              <option value="">Choose residency</option><option value="full-year">Full-year resident</option><option value="part-year">Part-year resident</option><option value="nonresident">Nonresident</option>
            </select>
          </label>
        </div>
        {(filingStatus === "mfj" || filingStatus === "mfs") && (
          <fieldset className="guided-fieldset">
            <legend className="guided-fieldset-legend">Spouse details</legend>
            {([ ["firstName", "Spouse first name", "text"], ["lastName", "Spouse last name", "text"], ["ssn", "Spouse taxpayer ID", "text"], ["dateOfBirth", "Spouse date of birth", "date"], ["usResidencyMonths", "Spouse months of U.S. residency", "number"] ] as const).map(([field, label, type]) => (
              <label className="guided-field" key={field}><span className="guided-field-label">{label}</span>
                <input type={type} className="guided-input" value={current.spouse?.[field] ?? ""} min={type === "number" ? 0 : undefined} max={type === "number" ? 12 : undefined} aria-required="true"
                  onChange={(event) => onDataChange({ ...current, spouse: { ...(current.spouse ?? emptySpouseInfo), [field]: event.target.value } })} />
              </label>
            ))}
              <BooleanFact label="Was your spouse's employment-valid SSN issued by the return due date, including extensions?" value={current.spouse?.employmentValidSsnIssuedByDueDate} onChange={(value) => onDataChange({ ...current, spouse: { ...(current.spouse ?? emptySpouseInfo), employmentValidSsnIssuedByDueDate: value } })} />
              {claimsDependentCredit && <BooleanFact label="Was your spouse's SSN or ITIN issued by the return due date, including extensions?" value={current.spouse?.tinIssuedByDueDate} onChange={(value) => onDataChange({ ...current, spouse: { ...(current.spouse ?? emptySpouseInfo), tinIssuedByDueDate: value } })} />}
            <label className="guided-field"><span className="guided-field-label">Did you live with your spouse at any time during the year?</span>
              <select className="guided-input" value={current.livedWithSpouseAtAnyTimeDuringYear == null ? "" : String(current.livedWithSpouseAtAnyTimeDuringYear)} onChange={(event) => onDataChange({ ...current, livedWithSpouseAtAnyTimeDuringYear: event.target.value === "" ? undefined : event.target.value === "true" })} aria-required="true">
                <option value="">Choose an answer</option><option value="true">Yes</option><option value="false">No</option>
              </select>
            </label>
          </fieldset>
        )}

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
            Enter details and review eligibility for each dependent. A count alone does not establish a credit.
          </span>
        </label>

        {depCount > 0 && (
          <div className="guided-w2-stack">
            <h3 className="guided-section-subheading">
              Tell us about your {depCount === 1 ? "dependent" : `${depCount} dependents`}
            </h3>
            <p className="guided-hint">
              We need a few details for each dependent to calculate credits accurately.
              Eligibility must be confirmed separately for each credit.
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
        <StandardDeductionSourceDetails data={current.standardDeductionFacts} filingStatus={filingStatus} onChange={standardDeductionFacts => onDataChange({ ...current, standardDeductionFacts })} />
        <EicClaimantSourceDetails data={current.eicClaimantEligibility} filingStatus={filingStatus} childless={!hasRecordedEicChild(current, filingStatus)} primaryDependent={current.standardDeductionFacts?.primaryCanBeClaimedAsDependent} spouseDependent={current.standardDeductionFacts?.spouseCanBeClaimedAsDependent} onChange={eicClaimantEligibility => onDataChange({ ...current, eicClaimantEligibility })} />
        <EicSeparatedSpouseDetails personal={current} filingStatus={filingStatus} onChange={eicSeparatedSpouseSources => onDataChange({ ...current, eicSeparatedSpouseSources })} />
        <EicDisallowanceHistoryDetails personal={current} filingStatus={filingStatus} onChange={eicDisallowanceHistory => onDataChange({ ...current, eicDisallowanceHistory })} />
        {claimsDependentCredit && <fieldset className="guided-fieldset"><legend className="guided-fieldset-legend">Dependent credit worksheet</legend>
          {dependents.some((entry) => entry.qualifiesForCTC) && <BooleanFact label="Were you a bona fide resident of Puerto Rico during the tax year?" value={current.childTaxCredit?.bonaFidePuertoRicoResident} onChange={(value) => onDataChange({ ...current, childTaxCredit: { ...current.childTaxCredit, bonaFidePuertoRicoResident: value } })} />}
          <CurrencyField label="Puerto Rico income excluded from federal income" hint="Schedule 8812 line 2a. Enter the actual exclusion, including zero." value={current.childTaxCredit?.puertoRicoExcludedIncome ?? ""} onChange={(value) => onDataChange({ ...current, childTaxCredit: { ...current.childTaxCredit, puertoRicoExcludedIncome: value } })} />
          <CurrencyField label="American Samoa income excluded on Form 4563" hint="Schedule 8812 line 2c. Enter the actual exclusion, including zero." value={current.childTaxCredit?.form4563ExcludedIncome ?? ""} onChange={(value) => onDataChange({ ...current, childTaxCredit: { ...current.childTaxCredit, form4563ExcludedIncome: value } })} />
          {current.childTaxCredit?.possessionIncomeExclusion && <CurrencyField label="Saved combined possession exclusion to reconcile" hint="Correct or clear this saved total using your records; the separate amounts must reconcile." value={current.childTaxCredit.possessionIncomeExclusion} onChange={(value) => onDataChange({ ...current, childTaxCredit: { ...current.childTaxCredit, possessionIncomeExclusion: value } })} />}
          <CurrencyField label="Nontaxable combat pay elected for the additional child credit" hint="Optional actual election amount; leave unanswered if no election is made." value={current.childTaxCredit?.nonTaxableCombatPayElection ?? ""} onChange={(value) => onDataChange({ ...current, childTaxCredit: { ...current.childTaxCredit, nonTaxableCombatPayElection: value } })} />
        </fieldset>}
      </div>
    </RetroShell>
  );
}
