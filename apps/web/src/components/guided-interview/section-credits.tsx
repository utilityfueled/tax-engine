"use client";
import type { HealthInsuranceData } from "@/lib/guided-health-insurance-facts";

import { RetroShell } from "@/components/retro-shell";
import {
  type CreditsData,
  type DependentCareData,
  type FilingStatus,
  type PersonalInfoData,
  type InterestEntryData,
  emptyCreditsData,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { EnergySourceDetails } from "./energy-source-details";
import { VehicleSourceDetails } from "./vehicle-source-details";
import { AdoptionSourceDetails } from "./adoption-source-details";
import { EducationSourceDetails } from "./education-source-details";
import { EducationDistributionDetails } from "./education-distribution-details";
import { PremiumTaxCreditSourceDetails } from "./premium-tax-credit-source-details";
import { SavingsBondSourceDetails } from "./savings-bond-source-details";
import { CareBenefitsDetails } from "./care-benefits-details";
import type { CareBenefitSource } from "@/lib/guided-dependent-care-benefits";
import { supportsGuidedCarePartIILivingApart } from "@/lib/guided-credit-facts";
import { CareSourceDetails } from "./care-source-details";
import { MinimumTaxCreditDetails } from "./minimum-tax-credit-details";
import { SaversCreditDetails } from "./savers-credit-details";
import { PersonalEvChargerDetails } from "./personal-ev-charger-details";

function EligibilityFact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}

const mfsLivingApartQuestions = [
  ["spouseLivedApartLast6Months", "Did you live apart from your spouse for the last six months of the year?"],
  ["paidOverHalfHomeCost", "Did you pay more than half the cost of keeping up that home for the year?"],
  ["qualifyingPersonMainHomeOverHalfYear", "Was your home the qualifying person's main home for more than half the year?"],
] as const;

function DependentCareSection({
  data,
  filingStatus,
  taxYear,
  onChange,
  hasBenefitFacts,
}: {
  data: DependentCareData;
  hasBenefitFacts?: boolean;
  filingStatus?: FilingStatus | null;
  taxYear?: number | null;
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
      {filingStatus === "mfs" && supportsGuidedCarePartIILivingApart(taxYear, hasBenefitFacts === true) && (!hasBenefitFacts || data.mfsLivingApart) && <fieldset>
        <legend>Filing separately and living apart (Form 2441)</legend>
        {mfsLivingApartQuestions.map(([field, label]) => <EligibilityFact key={field} label={label} value={data.mfsLivingApart?.[field]}
          onChange={value => onChange({ ...data, sourceFactsConfirmed: false, mfsLivingApart: { ...data.mfsLivingApart, [field]: value } })} />)}
      </fieldset>}
      <CurrencyField label="Your earned income for Form 2441 line 4" allowNegative hint="Use the completed worksheet after applicable self-employment adjustments, exclusions and student or disability rules. If you elect to include combat pay in this credit, include all of your W-2 Box 12 Code Q. This election is separate from EIC and the Part III benefit election." value={data.primaryEarnedIncome ?? ""} onChange={(value) => onChange({ ...data, sourceFactsConfirmed: false, primaryEarnedIncome: value })} />
      {filingStatus === "mfj" && <CurrencyField label="Spouse's earned income for Form 2441 line 5" allowNegative hint="Use your spouse's own worksheet amount, including any substantiated deemed income. Your spouse makes their own choice about including all of their Box 12 Code Q. Enter 0 only when zero is established." value={data.spouseEarnedIncome ?? ""} onChange={(value) => onChange({ ...data, sourceFactsConfirmed: false, spouseEarnedIncome: value })} />}
      <CurrencyField label="Excluded dependent-care benefits from Form 2441 Part III" hint={hasBenefitFacts ? "Leave blank to use the validated Part III line 28 amount. If supplied, this amount must match it exactly." : "Confirm 0 when no benefits were received. Otherwise complete the actual dependent-care benefit details above."} value={data.excludedDependentCareBenefits ?? ""} onChange={(value) => onChange({ ...data, sourceFactsConfirmed: false, excludedDependentCareBenefits: value })} />
      <CareSourceDetails data={data} onChange={onChange} />
    </div>
  );
}

export function SectionCredits({
  interestEntries,
  data,
  hasDependents,
  filingStatus,
  taxYear,
  onDataChange,
  careBenefitSources,
  personalData,
  healthInsurance,
}: {
  healthInsurance?: HealthInsuranceData;
  personalData?: PersonalInfoData;
  careBenefitSources?: CareBenefitSource[];
  interestEntries?: InterestEntryData[];
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
            taxYear={taxYear}
            onChange={(next) => onDataChange({ ...current, dependentCare: next })}
          />

          <EducationSourceDetails
            filingStatus={filingStatus}
            taxYear={taxYear}
            data={current.education}
            onChange={(next) => onDataChange({ ...current, education: next })}
          />

          <EducationDistributionDetails taxYear={taxYear} filingStatus={filingStatus} originalContext={{ interestEntries, primarySsn: personalData?.ssn, spouseSsn: personalData?.spouse?.ssn }} data={current.educationDistributions} onChange={educationDistributions => onDataChange({ ...current, educationDistributions })} />
          <PremiumTaxCreditSourceDetails healthInsurance={healthInsurance} personal={personalData} filingStatus={filingStatus} taxYear={taxYear} data={current.premiumTaxCredit} onChange={premiumTaxCredit => onDataChange({ ...current, premiumTaxCredit })} />
          <SavingsBondSourceDetails data={current.savingsBondEducation} onChange={savingsBondEducation => onDataChange({ ...current, savingsBondEducation })} />
          <MinimumTaxCreditDetails data={current.minimumTaxCredit} onChange={minimumTaxCredit => onDataChange({ ...current, minimumTaxCredit })} />
          <SaversCreditDetails data={current.saversCredit} taxYear={taxYear} filingStatus={filingStatus} onChange={saversCredit => onDataChange({ ...current, saversCredit })} />

          <EnergySourceDetails
            filingStatus={filingStatus}
            taxYear={taxYear}
            data={current.energy}
            onChange={(next) => onDataChange({ ...current, energy: next })}
          />
          <PersonalEvChargerDetails data={current.personalEvCharger} taxYear={taxYear} filingStatus={filingStatus}
            onChange={personalEvCharger => onDataChange({ ...current, personalEvCharger })} />
          <AdoptionSourceDetails data={current.adoption} onChange={(next) => onDataChange({ ...current, adoption: next })} />
          <VehicleSourceDetails data={current.vehicles} taxYear={taxYear} filingStatus={filingStatus} onChange={(next) => onDataChange({ ...current, vehicles: next })} />
        </div>
      </div>
    </RetroShell>
  );
}
