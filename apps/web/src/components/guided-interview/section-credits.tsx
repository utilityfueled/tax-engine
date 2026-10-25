"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type CreditsData,
  type DependentCareData,
  type EducationCreditData,
  type EducationStudentData,
  type FilingStatus,
  emptyCreditsData,
  emptyEducationStudent,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { EnergySourceDetails } from "./energy-source-details";
import { VehicleSourceDetails } from "./vehicle-source-details";

function EligibilityFact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}

function DependentCareSection({
  data,
  filingStatus,
  onChange,
}: {
  data: DependentCareData;
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
          onChange={(v) => onChange({ ...data, expenses: v })}
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
            onChange={(e) => onChange({ ...data, qualifyingIndividuals: e.target.value })}
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
      <EligibilityFact label="Do the qualifying-person, work-related care and eligible-provider requirements in Form 2441 apply?" value={data.eligibilityConfirmed} onChange={(value) => onChange({ ...data, eligibilityConfirmed: value })} />
      <CurrencyField label="Your earned income for Form 2441 line 4" hint="Use the worksheet amount after applicable self-employment adjustments, exclusions and substantiated student/incapacity rules." value={data.primaryEarnedIncome ?? ""} onChange={(value) => onChange({ ...data, primaryEarnedIncome: value })} />
      {filingStatus === "mfj" && <CurrencyField label="Spouse's earned income for Form 2441 line 5" hint="Use your spouse's own worksheet amount, including substantiated deemed income where applicable. Enter 0 only when zero is established." value={data.spouseEarnedIncome ?? ""} onChange={(value) => onChange({ ...data, spouseEarnedIncome: value })} />}
      <CurrencyField label="Excluded dependent-care benefits from Form 2441 Part III" hint="Use the amount determined excludable, not simply W-2 box 10. Confirm 0 when no benefits were excluded." value={data.excludedDependentCareBenefits ?? ""} onChange={(value) => onChange({ ...data, excludedDependentCareBenefits: value })} />
      <p className="guided-hint">Provider and qualifying-person details still require form review before filing.</p>
    </div>
  );
}

function EducationStudentCard({
  index,
  student,
  onUpdate,
  onRemove,
  removable,
}: {
  index: number;
  student: EducationStudentData;
  onUpdate: (field: keyof EducationStudentData, value: string | boolean | null) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="guided-w2-card" style={{ padding: "12px" }}>
      <div className="guided-w2-card-header">
        <h5 className="guided-w2-card-title">Student #{index + 1}</h5>
        {removable && (
          <button
            type="button"
            className="utility-button utility-button-small utility-button-danger"
            onClick={onRemove}
            aria-label={`Remove student #${index + 1}${student.name ? ` — ${student.name}` : ""}`}
          >
            Remove
          </button>
        )}
      </div>
      <div className="guided-form-grid">
        <label className="guided-field">
          <span className="guided-field-label">Student name</span>
          <input
            type="text"
            className="guided-input"
            value={student.name}
            onChange={(e) => onUpdate("name", e.target.value)}
            placeholder="e.g. Jane Smith"
            aria-required="true"
          />
        </label>
        <CurrencyField
          label="Qualified tuition & expenses"
          hint="Tuition, fees, and course materials from Form 1098-T."
          value={student.qualifiedExpenses}
          onChange={(v) => onUpdate("qualifiedExpenses", v)}
        />
      </div>
      <label className="guided-field">
        <span className="guided-field-label">Prior years AOTC was claimed</span>
        <select
          className="guided-input guided-input-narrow"
          value={student.requiresPriorYearsConfirmation ? "" : student.priorYearsClaimed}
          onChange={(e) => onUpdate("priorYearsClaimed", e.target.value)}
          aria-describedby={`student-${index}-aotc-hint`}
        >
          <option value="">Confirm the actual prior claim history</option>
          <option value="0">0 (first year)</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4+ (no longer eligible for AOTC)</option>
        </select>
        <span className="guided-field-hint" id={`student-${index}-aotc-hint`}>
          The American Opportunity Credit can be claimed for up to 4 tax years per student.
          {student.requiresPriorYearsConfirmation ? ` Saved prior claim count ${student.priorYearsClaimed} needs confirmation because older versions prefilled zero.` : ""}
        </span>
      </label>
      <EligibilityFact label="Completed the first four years of postsecondary education before this tax year" value={student.completedFirstFourYearsBeforeYear} onChange={(value) => onUpdate("completedFirstFourYearsBeforeYear", value)} />
      <EligibilityFact label="Enrolled at least half-time for at least one academic period" value={student.enrolledAtLeastHalfTime} onChange={(value) => onUpdate("enrolledAtLeastHalfTime", value)} />
      <EligibilityFact label="Pursuing a degree or recognized education credential" value={student.pursuingDegreeOrCredential} onChange={(value) => onUpdate("pursuingDegreeOrCredential", value)} />
      <EligibilityFact label="Had a felony drug conviction by the end of the tax year" value={student.felonyDrugConviction} onChange={(value) => onUpdate("felonyDrugConviction", value)} />
      <EligibilityFact label="Student has an employment-valid SSN issued by the return due date (required for 2026)" value={student.studentSsnEligible} onChange={(value) => onUpdate("studentSsnEligible", value)} />
      <label className="guided-field"><span className="guided-field-label">Institution EIN from Form 1098-T (required for 2026)</span><input className="guided-input" value={student.institutionEin ?? ""} onChange={(event) => onUpdate("institutionEin", event.target.value)} /></label>
    </div>
  );
}

function EducationSection({
  data,
  onChange,
}: {
  data: EducationCreditData;
  onChange: (data: EducationCreditData) => void;
}) {
  function updateStudent(index: number, field: keyof EducationStudentData, value: string | boolean | null) {
    const next = data.aocStudents.map((s, i) =>
      i === index ? { ...s, [field]: value, ...(field === "priorYearsClaimed" ? { requiresPriorYearsConfirmation: false } : {}) } : s
    );
    onChange({ ...data, aocStudents: next });
  }

  function addStudent() {
    onChange({ ...data, aocStudents: [...data.aocStudents, { ...emptyEducationStudent }] });
  }

  function removeStudent(index: number) {
    onChange({ ...data, aocStudents: data.aocStudents.filter((_, i) => i !== index) });
  }

  return (
    <div className="guided-w2-card" style={{ padding: "12px" }}>
      <div className="guided-w2-card-header">
        <h3 className="guided-w2-card-title">
          Education Credits (Form 8863)
        </h3>
      </div>
      <p className="guided-hint" style={{ marginTop: "4px" }}>
        Two credits are available: the American Opportunity Credit (up to $2,500/student,
        partially refundable) and the Lifetime Learning Credit (up to $2,000 total).
      </p>

      <h4 className="guided-w2-card-title" style={{ marginTop: "12px", marginBottom: "8px" }}>
        American Opportunity Credit students
      </h4>
      <EligibilityFact label="Taxpayer has an employment-valid SSN issued by the return due date (required for 2026 education credits)" value={data.primarySsnEligible} onChange={(primarySsnEligible) => onChange({ ...data, primarySsnEligible })} />
      <EligibilityFact label="Spouse has an employment-valid SSN issued by the return due date (required for a 2026 joint education credit)" value={data.spouseSsnEligible} onChange={(spouseSsnEligible) => onChange({ ...data, spouseSsnEligible })} />

      {data.aocStudents.length > 0 && (
        <div className="guided-w2-stack">
          {data.aocStudents.map((student, index) => (
            <EducationStudentCard
              key={index}
              index={index}
              student={student}
              onUpdate={(field, value) => updateStudent(index, field, value)}
              onRemove={() => removeStudent(index)}
              removable={data.aocStudents.length > 1}
            />
          ))}
        </div>
      )}
      {data.aocStudents.length > 0 && <>
        <EligibilityFact label="Taxpayer meets the refundable AOTC eligibility requirements" value={data.refundableAocEligible} onChange={(refundableAocEligible) => onChange({ ...data, refundableAocEligible })} />
        <p className="guided-hint">Review age, full-time student status, earned income and support, whether a parent is alive, and joint-return status in the <a href="https://www.irs.gov/instructions/i8863" target="_blank" rel="noreferrer">Form 8863 instructions</a>. A student&apos;s expense amount does not establish refundability.</p>
      </>}

      <button
        type="button"
        className="utility-button"
        onClick={addStudent}
        style={{ marginTop: "8px" }}
        aria-label="Add another student for American Opportunity Credit"
      >
        + Add a student
      </button>

      <details className="guided-expand" style={{ marginTop: "12px" }}>
        <summary className="guided-expand-trigger">Lifetime Learning Credit</summary>
        <div className="guided-expand-body">
          <CurrencyField
            label="Lifetime Learning Credit expenses"
            hint="Tuition for graduate school, professional courses, or students past their 4th year. Up to $10,000 in expenses qualifies (20% credit = $2,000 max)."
            value={data.llcExpenses}
            onChange={(v) => onChange({ ...data, llcExpenses: v })}
          />
        </div>
      </details>
    </div>
  );
}

export function SectionCredits({
  data,
  hasDependents,
  filingStatus,
  taxYear,
  onDataChange,
}: {
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
          <DependentCareSection
            data={current.dependentCare}
            filingStatus={filingStatus}
            onChange={(next) => onDataChange({ ...current, dependentCare: next })}
          />

          <EducationSection
            data={current.education}
            onChange={(next) => onDataChange({ ...current, education: next })}
          />

          <EnergySourceDetails
            taxYear={taxYear}
            data={current.energy}
            onChange={(next) => onDataChange({ ...current, energy: next })}
          />
          <VehicleSourceDetails data={current.vehicles} filingStatus={filingStatus} onChange={(next) => onDataChange({ ...current, vehicles: next })} />
        </div>
      </div>
    </RetroShell>
  );
}
