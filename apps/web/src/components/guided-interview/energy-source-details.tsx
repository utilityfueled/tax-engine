"use client";

import type { CleanEnergyCategory, CleanEnergyPropertyData, EnergyCreditData, EnergyImprovementCategory, EnergyImprovementData } from "@/lib/guided-interview-flow";
import { cleanEnergyLabels, energyImprovementLabels, legacyEnergyLabels } from "@/lib/guided-energy-facts";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

export function EnergySourceDetails({ data, taxYear, onChange }: { data: EnergyCreditData; taxYear?: number | null; onChange: (data: EnergyCreditData) => void }) {
  const improvements = data.qualifiedImprovements ?? [];
  const properties = data.cleanEnergyProperties ?? [];
  function updateImprovement(index: number, values: Partial<EnergyImprovementData>) {
    onChange({ ...data, qualifiedImprovements: improvements.map((entry, itemIndex) => itemIndex === index ? { ...entry, ...values } : entry) });
  }
  function updateProperty(index: number, values: Partial<CleanEnergyPropertyData>) {
    onChange({ ...data, cleanEnergyProperties: properties.map((entry, itemIndex) => itemIndex === index ? { ...entry, ...values } : entry) });
  }
  return <div className="guided-w2-card" style={{ padding: "12px" }}>
    <h3 className="guided-w2-card-title">Residential Energy Credits (Form 5695)</h3>
    <p className="guided-hint">Enter each actual item and its net qualified cost, excluding rebates and any nonqualifying labor. Keep the product qualifications and installation records. Enter each exterior door separately.</p>
    {taxYear === 2026 && <p className="guided-hint">New installations completed after 2025 do not receive these credits. A confirmed residential clean-energy carryforward from the 2025 return may still apply.</p>}
    <BooleanFact label="Does the residence and personal-use eligibility documented in Form 5695 apply?" value={data.residenceEligibilityConfirmed} onChange={(value) => onChange({ ...data, residenceEligibilityConfirmed: value })} />
    <h4 className="guided-section-subheading">Individual home-efficiency improvements</h4>
    {improvements.map((entry, index) => <fieldset className="guided-fieldset" key={index}>
      <legend>Improvement {index + 1}</legend>
      <label className="guided-field"><span className="guided-field-label">Improvement category</span><select className="guided-input" value={entry.category} onChange={(event) => updateImprovement(index, { category: event.target.value as EnergyImprovementCategory | "" })}><option value="">Choose actual category</option>{Object.entries(energyImprovementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <CurrencyField label="Net qualified improvement cost" value={entry.qualifiedCost} onChange={(value) => updateImprovement(index, { qualifiedCost: value })} />
      <TextFact label="Improvement installation completion date" type="date" value={entry.installationCompletedDate} onChange={(value) => updateImprovement(index, { installationCompletedDate: value })} />
      <BooleanFact label="Do actual records establish this item's qualification?" value={entry.qualificationConfirmed} onChange={(value) => updateImprovement(index, { qualificationConfirmed: value })} />
      {entry.category && !["insulation", "home_energy_audit"].includes(entry.category) && <TextFact label="Qualified manufacturer ID (four characters for 2025)" value={entry.manufacturerQualifiedId ?? ""} onChange={(value) => updateImprovement(index, { manufacturerQualifiedId: value })} />}
      <button type="button" className="utility-button" onClick={() => onChange({ ...data, qualifiedImprovements: improvements.filter((_, itemIndex) => itemIndex !== index) })}>Remove improvement {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => onChange({ ...data, qualifiedImprovements: [...improvements, { category: "", qualifiedCost: "", installationCompletedDate: "", qualificationConfirmed: null }] })}>+ Add improvement</button>
    <h4 className="guided-section-subheading">Individual clean-energy properties</h4>
    {properties.map((entry, index) => <fieldset className="guided-fieldset" key={index}>
      <legend>Clean-energy property {index + 1}</legend>
      <label className="guided-field"><span className="guided-field-label">Clean-energy category</span><select className="guided-input" value={entry.category} onChange={(event) => updateProperty(index, { category: event.target.value as CleanEnergyCategory | "" })}><option value="">Choose actual category</option>{Object.entries(cleanEnergyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <CurrencyField label="Net qualified clean-energy cost" value={entry.qualifiedCost} onChange={(value) => updateProperty(index, { qualifiedCost: value })} />
      <TextFact label="Clean-energy installation completion date" type="date" value={entry.installationCompletedDate} onChange={(value) => updateProperty(index, { installationCompletedDate: value })} />
      <BooleanFact label="Do actual records establish this property's qualification?" value={entry.qualificationConfirmed} onChange={(value) => updateProperty(index, { qualificationConfirmed: value })} />
      {entry.category === "fuel_cell" && <TextFact label="Fuel-cell kilowatt capacity" value={entry.fuelCellKilowattCapacity ?? ""} onChange={(value) => updateProperty(index, { fuelCellKilowattCapacity: value })} />}
      <button type="button" className="utility-button" onClick={() => onChange({ ...data, cleanEnergyProperties: properties.filter((_, itemIndex) => itemIndex !== index) })}>Remove clean-energy property {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => onChange({ ...data, cleanEnergyProperties: [...properties, { category: "", qualifiedCost: "", installationCompletedDate: "", qualificationConfirmed: null }] })}>+ Add clean-energy property</button>
    <h4 className="guided-section-subheading">Residential clean-energy carryforward</h4>
    <CurrencyField label="Prior-year Form 5695 carryforward" hint="Use the actual prior-year carryforward, not the prior-year total credit. Confirm 0 when zero is established." value={data.priorYearCarryforward ?? ""} onChange={(value) => onChange({ ...data, priorYearCarryforward: value })} />
    <TextFact label="Carryforward source tax year" value={data.carryforwardSourceTaxYear ?? ""} onChange={(value) => onChange({ ...data, carryforwardSourceTaxYear: value })} />
    <BooleanFact label="Is this carryforward confirmed from the prior-year Form 5695?" value={data.carryforwardConfirmed} onChange={(value) => onChange({ ...data, carryforwardConfirmed: value })} />
    {(Object.keys(legacyEnergyLabels) as Array<keyof typeof legacyEnergyLabels>).filter((field) => data[field].trim()).map((field) => <CurrencyField key={field} label={legacyEnergyLabels[field]} hint="Reconcile the saved amount to actual individual records above. It is retained here and will not be counted again." value={data[field]} onChange={(value) => onChange({ ...data, [field]: value })} />)}
    {data.roofCost.trim() && <label className="guided-field"><span className="guided-field-label">Actual treatment of the saved roof cost</span><select className="guided-input" value={data.legacyRoofTreatment ?? ""} onChange={(event) => onChange({ ...data, legacyRoofTreatment: event.target.value as EnergyCreditData["legacyRoofTreatment"] })}><option value="">Confirm actual treatment</option><option value="not_eligible">General roofing — no energy credit</option><option value="qualified_solar_component">Qualified solar component, included in the detailed solar cost</option></select></label>}
  </div>;
}
