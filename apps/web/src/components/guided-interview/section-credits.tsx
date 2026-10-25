"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type CreditsData,
  type DependentCareData,
  type EducationCreditData,
  type EducationStudentData,
  type EnergyCreditData,
  emptyCreditsData,
  emptyEducationStudent,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";

function DependentCareSection({
  data,
  onChange,
}: {
  data: DependentCareData;
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
          <select
            className="guided-input guided-input-narrow"
            value={data.qualifyingIndividuals}
            onChange={(e) => onChange({ ...data, qualifyingIndividuals: e.target.value })}
            aria-describedby="qualifying-individuals-hint"
          >
            <option value="">Select count</option>
            <option value="1">1</option>
            <option value="2">2 or more</option>
          </select>
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
  onUpdate: (field: keyof EducationStudentData, value: string) => void;
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
          value={student.priorYearsClaimed}
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
        </span>
      </label>
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
  function updateStudent(index: number, field: keyof EducationStudentData, value: string) {
    const next = data.aocStudents.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
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

function EnergySection({
  data,
  onChange,
}: {
  data: EnergyCreditData;
  onChange: (data: EnergyCreditData) => void;
}) {
  function update(field: keyof EnergyCreditData, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <div className="guided-w2-card" style={{ padding: "12px" }}>
      <div className="guided-w2-card-header">
        <h3 className="guided-w2-card-title">
          Residential Energy Credits (Form 5695)
        </h3>
      </div>
      <p className="guided-hint" style={{ marginTop: "4px" }}>
        If you installed solar panels, made energy-efficient home improvements, or
        purchased a qualifying heat pump, you may qualify for a 30% credit.
      </p>

      <fieldset className="guided-fieldset">
        <legend className="sr-only">Clean energy credits</legend>
        <h4 className="guided-w2-card-title" style={{ marginTop: "12px", marginBottom: "8px" }}>
          Clean energy (30% credit, no annual cap)
        </h4>
        <div className="guided-form-grid">
          <CurrencyField
            label="Solar electric system"
            hint="Solar panels, inverters, and installation."
            value={data.solarElectricCost}
            onChange={(v) => update("solarElectricCost", v)}
          />
          <CurrencyField
            label="Solar water heating"
            hint="Solar water heater and installation."
            value={data.solarWaterHeatingCost}
            onChange={(v) => update("solarWaterHeatingCost", v)}
          />
        </div>
      </fieldset>

      <details className="guided-expand" style={{ marginTop: "12px" }}>
        <summary className="guided-expand-trigger">Home efficiency improvements</summary>
        <div className="guided-expand-body">
          <fieldset className="guided-fieldset">
            <legend className="sr-only">Home efficiency improvements</legend>
            <p className="guided-hint">
              30% credit, up to $3,200/year for qualifying home improvements.
            </p>
            <div className="guided-form-grid">
              <CurrencyField
                label="Insulation & air sealing"
                value={data.insulationCost}
                onChange={(v) => update("insulationCost", v)}
              />
              <CurrencyField
                label="Exterior doors & windows"
                value={data.exteriorDoorsWindowsCost}
                onChange={(v) => update("exteriorDoorsWindowsCost", v)}
              />
              <CurrencyField
                label="Roofing (metal or asphalt)"
                value={data.roofCost}
                onChange={(v) => update("roofCost", v)}
              />
              <CurrencyField
                label="Energy-efficient HVAC"
                hint="Central AC, furnace, boiler. Must meet efficiency standards."
                value={data.energyEfficientHvacCost}
                onChange={(v) => update("energyEfficientHvacCost", v)}
              />
              <CurrencyField
                label="Water heater / heat pump"
                hint="Heat pump water heater, heat pump for heating/cooling."
                value={data.waterHeaterHeatPumpCost}
                onChange={(v) => update("waterHeaterHeatPumpCost", v)}
              />
            </div>
          </fieldset>
        </div>
      </details>
    </div>
  );
}

export function SectionCredits({
  data,
  hasDependents,
  onDataChange,
}: {
  data: CreditsData | undefined;
  hasDependents: boolean;
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
          from the dependents you entered in the Personal Info section
          {hasDependents ? " — you're all set there" : ""}.
        </p>

        <div className="guided-w2-stack" style={{ marginTop: "16px" }}>
          <DependentCareSection
            data={current.dependentCare}
            onChange={(next) => onDataChange({ ...current, dependentCare: next })}
          />

          <EducationSection
            data={current.education}
            onChange={(next) => onDataChange({ ...current, education: next })}
          />

          <EnergySection
            data={current.energy}
            onChange={(next) => onDataChange({ ...current, energy: next })}
          />
        </div>
      </div>
    </RetroShell>
  );
}
