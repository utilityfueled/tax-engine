"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type CreditsData,
  type DependentCareData,
  type FilingStatus,
  emptyCreditsData,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { EnergySourceDetails } from "./energy-source-details";
import { VehicleSourceDetails } from "./vehicle-source-details";
import { AdoptionSourceDetails } from "./adoption-source-details";
import { EducationSourceDetails } from "./education-source-details";
import { EducationDistributionDetails } from "./education-distribution-details";
import { CareBenefitsDetails } from "./care-benefits-details";
import type { CareBenefitSource } from "@/lib/guided-dependent-care-benefits";
import { CareSourceDetails } from "./care-source-details";

function EligibilityFact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}

function DependentCareSection({
  data,
  filingStatus,
  onChange,
  hasBenefitFacts,
}: {
  data: DependentCareData;
  hasBenefitFacts?: boolean;
  filingStatus?: FilingStatus | null;
  onChange: (data: DependentCareData) => void;
}) {
  const needsQualifyingIndividuals = data.expenses.trim() !== "" && data.qualifyingIndividuals === "";

  return (
    <div className="guided-w2-card" style={{ padding: "12px" }}>
      <div className="guided-w2-card-header">
        <h3 className="guided-w2-card-title">
          Child and Dependent Care Credit (Form 2441)
        </h3>
      </div>
      <p className="guided-hint" style={{ marginTop: "4px" }}>
        If you paid someone to care for a child under 13 or a disabled dependent
        so you could work or look for work, you may qualify.
      </p>
      <div className="guided-form-grid">
        <CurrencyField
          label="Total care expenses paid"
          hint="Daycare, babysitter, after-school care, summer camp, etc."
          value={data.expenses}
          onChange={(v) => onChange({ ...data, sourceFactsConfirmed: false, expenses: v })}
        />
        <label className="guided-field">
          <span className="guided-field-label">Qualifying individuals</span>
          <input
            type="number"
            min="1"
            max="20"
            step="1"
            className="guided-input guided-input-narrow"
            value={data.qualifyingIndividuals}
            onChange={(e) => onChange({ ...data, sourceFactsConfirmed: false, qualifyingIndividuals: e.target.value })}
            aria-describedby="qualifying-individuals-hint"
          />
          <span className="guided-field-hint" id="qualifying-individuals-hint">
            Children under 13, or a disabled spouse/dependent who lived with you.
          </span>
          {needsQualifyingIndividuals ? (
            <span className="guided-field-hint">
              Choose how many qualifying people received care before we estimate this credit.
            </span>
          ) : null}
        </label>
      </div>
      <EligibilityFact label="Do the qualifying-person, work-related care and eligible-provider requirements in Form 2441 apply?" value={data.eligibilityConfirmed} onChange={(value) => onChange({ ...data, sourceFactsConfirmed: false, eligibilityConfirmed: value })} />
      <CurrencyField label="Your earned income for Form 2441 line 4" allowNegative hint="Use the worksheet amount after applicable self-employment adjustments, exclusions and substantiated student/incapacity rules." value={data.primaryEarnedIncome ?? ""} onChange={(value) => onChange({ ...data, sourceFactsConfirmed: false, primaryEarnedIncome: value })} />
      {filingStatus === "mfj" && <CurrencyField label="Spouse's earned income for Form 2441 line 5" allowNegative hint="Use your spouse's own worksheet amount, including substantiated deemed income where applicable. Enter 0 only when zero is established." value={data.spouseEarnedIncome ?? ""} onChange={(value) => onChange({ ...data, sourceFactsConfirmed: false, spouseEarnedIncome: value })} />}
      <CurrencyField label="Excluded dependent-care benefits from Form 2441 Part III" hint={hasBenefitFacts ? "Leave blank to use the validated Part III line 28 amount. If supplied, this amount must match it exactly." : "Confirm 0 when no benefits were received. Otherwise complete the actual dependent-care benefit details above."} value={data.excludedDependentCareBenefits ?? ""} onChange={(value) => onChange({ ...data, sourceFactsConfirmed: false, excludedDependentCareBenefits: value })} />
      <CareSourceDetails data={data} onChange={onChange} />
    </div>
  );
}

export function SectionCredits({
  data,
  hasDependents,
  filingStatus,
  taxYear,
  onDataChange,
  careBenefitSources,
}: {
  careBenefitSources?: CareBenefitSource[];
  data: CreditsData | undefined;
  hasDependents: boolean;
  taxYear?: number | null;
  filingStatus?: FilingStatus | null;
  onDataChange: (data: CreditsData) => void;
}) {
  const current = data ?? emptyCreditsData;

  return (
    <RetroShell title="Tax Credits" eyebrow="CREDITS">
      <div className="guided-question">
        <p className="guided-prompt">Credits reduce your tax dollar-for-dollar.</p>
        <p className="guided-hint">
          Unlike deductions (which reduce taxable income), credits directly reduce
          the tax you owe. Some credits are even refundable — meaning they can give
          you money back beyond what you paid in. Fill in only the sections that apply.
        </p>

        <p className="guided-hint" style={{ marginTop: "8px", fontStyle: "italic" }}>
          Note: The Child Tax Credit and Earned Income Credit are computed automatically
          from the dependents you entered in the Personal Info section.
          {hasDependents ? " Review the actual eligibility and identification answers there." : ""}
        </p>

        <div className="guided-w2-stack" style={{ marginTop: "16px" }}>
          <CareBenefitsDetails data={current.dependentCareBenefits} taxYear={taxYear} filingStatus={filingStatus} sources={careBenefitSources} careProviders={current.dependentCare.providers} onChange={dependentCareBenefits => onDataChange({ ...current, dependentCareBenefits })} />
          <DependentCareSection
            hasBenefitFacts={current.dependentCareBenefits !== undefined}
            data={current.dependentCare}
            filingStatus={filingStatus}
            onChange={(next) => onDataChange({ ...current, dependentCare: next })}
          />

          <EducationSourceDetails
            filingStatus={filingStatus}
            taxYear={taxYear}
            data={current.education}
            onChange={(next) => onDataChange({ ...current, education: next })}
          />

          <EducationDistributionDetails data={current.educationDistributions} onChange={educationDistributions => onDataChange({ ...current, educationDistributions })} />

          <EnergySourceDetails
            filingStatus={filingStatus}
            taxYear={taxYear}
            data={current.energy}
            onChange={(next) => onDataChange({ ...current, energy: next })}
          />
          <AdoptionSourceDetails data={current.adoption} onChange={(next) => onDataChange({ ...current, adoption: next })} />
          <VehicleSourceDetails data={current.vehicles} filingStatus={filingStatus} onChange={(next) => onDataChange({ ...current, vehicles: next })} />
        </div>
      </div>
    </RetroShell>
  );
}
