"use client";

import type { CleanEnergyCategory, CleanEnergyPropertyData, EnergyCreditData, EnergyHomeData, EnergyImprovementCategory, EnergyImprovementData, EnergyPropertySourceData, FilingStatus } from "@/lib/guided-interview-flow";
import { cleanEnergyLabels, energyImprovementLabels, legacyEnergyLabels } from "@/lib/guided-energy-facts";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

function Choice({ label, value, options, onChange }: { label: string; value?: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ""} onChange={event => onChange(event.target.value)}><option value="">Choose from actual records</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
}
function PropertySource({ entry, homes, label, onChange }: { entry: EnergyPropertySourceData; homes: EnergyHomeData[]; label: string; onChange: (values: Partial<EnergyPropertySourceData>) => void }) {
  const home = homes.find(home => home.id === entry.homeId);
  const allocation = entry.associationAllocation ?? { totalQualifiedCost: "", numerator: "", denominator: "", sourceReference: "" };
  return <>
    <Choice label={`Installation home — ${label}`} value={entry.homeId} options={homes.map((home, index) => [home.id, home.address.street || `Home ${index + 1} (address needed)`])} onChange={homeId => onChange({ homeId })} />
    {home?.jointOccupancyWithOtherReturn && <CurrencyField label={`Costs paid by all occupants — ${label}`} hint="Include your cost and every other occupant's corresponding cost. Include separate records for qualifying items paid entirely by other occupants." value={entry.totalCostPaidByAllOccupants ?? ""} onChange={totalCostPaidByAllOccupants => onChange({ totalCostPaidByAllOccupants })} />}
    <BooleanFact label={`Is this an association or cooperative cost share? — ${label}`} value={entry.associationCostShare} onChange={associationCostShare => onChange({ associationCostShare })} />
    {(entry.associationCostShare || entry.associationAllocation) && <>
      <CurrencyField label={`Association's eligible cost — ${label}`} value={allocation.totalQualifiedCost} onChange={totalQualifiedCost => onChange({ associationAllocation: { ...allocation, totalQualifiedCost } })} />
      <TextFact label={`Actual share numerator — ${label}`} value={allocation.numerator} onChange={numerator => onChange({ associationAllocation: { ...allocation, numerator } })} />
      <TextFact label={`Actual share denominator — ${label}`} value={allocation.denominator} onChange={denominator => onChange({ associationAllocation: { ...allocation, denominator } })} />
      <TextFact label={`Allocation statement reference — ${label}`} value={allocation.sourceReference} onChange={sourceReference => onChange({ associationAllocation: { ...allocation, sourceReference } })} />
      <button type="button" className="utility-button" onClick={() => onChange({ associationAllocation: undefined })}>Remove association allocation — {label}</button>
    </>}
  </>;
}

export function EnergySourceDetails({ data, taxYear, filingStatus, onChange }: { data: EnergyCreditData; taxYear?: number | null; filingStatus?: FilingStatus | null; onChange: (data: EnergyCreditData) => void }) {
  const improvements = data.qualifiedImprovements ?? [];
  const properties = data.cleanEnergyProperties ?? [];
  const homes = data.homes ?? [];
  const physicalSources = taxYear !== 2026;
  const edit = (next: EnergyCreditData) => onChange({ ...next, sourceFactsConfirmed: null });
  function updateImprovement(index: number, values: Partial<EnergyImprovementData>) {
    edit({ ...data, qualifiedImprovements: improvements.map((entry, itemIndex) => itemIndex === index ? { ...entry, sourceId: entry.sourceId ?? crypto.randomUUID(), ...values } : entry) });
  }
  function updateProperty(index: number, values: Partial<CleanEnergyPropertyData>) {
    edit({ ...data, cleanEnergyProperties: properties.map((entry, itemIndex) => itemIndex === index ? { ...entry, sourceId: entry.sourceId ?? crypto.randomUUID(), ...values } : entry) });
  }
  const updateHome = (index: number, values: Partial<EnergyHomeData>) => edit({ ...data, homes: homes.map((home, i) => i === index ? { ...home, ...values } : home) });
  return <div className="guided-w2-card" style={{ padding: "12px" }}>
    <h3 className="guided-w2-card-title">Residential Energy Credits (Form 5695)</h3>
    <p className="guided-hint">Enter each actual item and its net qualified cost, after rebates, subsidies, nonqualifying labor and any required nonbusiness-use allocation. Keep the product and installation records. Enter each exterior door separately.</p>
    {taxYear === 2026 && <p className="guided-hint">New installations completed after 2025 do not receive these credits. A confirmed residential clean-energy carryforward from the 2025 return may still apply.</p>}
    <BooleanFact label="Does the residence and personal-use eligibility documented in Form 5695 apply?" value={data.residenceEligibilityConfirmed} onChange={value => edit({ ...data, residenceEligibilityConfirmed: value })} />
    {physicalSources && <>
      <h4 className="guided-section-subheading">Actual installation homes</h4>
      <p className="guided-hint">Enter installation addresses from the actual records. When you moved, enter each home's main-residence dates. Only one home can be your main home at a time.</p>
      {homes.map((home, index) => <fieldset className="guided-fieldset" key={home.id}>
        <legend>Installation home {index + 1}</legend>
        <Choice label={`Home owner on this return — home ${index + 1}`} value={home.owner} options={[["primary", "You"], ["spouse", "Spouse"], ["joint", "Both spouses"]]} onChange={value => updateHome(index, { owner: value as EnergyHomeData["owner"] })} />
        {([ ["street", "Installation street"], ["unit", "Unit"], ["city", "City"], ["state", "State"], ["zip", "ZIP code"] ] as const).map(([key, label]) => <TextFact key={key} label={`${label} — home ${index + 1}`} value={home.address[key] ?? ""} onChange={value => updateHome(index, { address: { ...home.address, [key]: value } })} />)}
        <BooleanFact label={`Is this home in the United States? — home ${index + 1}`} value={home.locatedInUnitedStates} onChange={value => updateHome(index, { locatedInUnitedStates: value })} />
        <BooleanFact label={`Did you use this home as a residence? — home ${index + 1}`} value={home.usedAsResidence} onChange={value => updateHome(index, { usedAsResidence: value })} />
        <BooleanFact label={`Did you own this home? — home ${index + 1}`} value={home.ownedByTaxpayer} onChange={value => updateHome(index, { ownedByTaxpayer: value })} />
        <Choice label={`Whose main home is this? — home ${index + 1}`} value={home.mainHomeFor} options={[["primary", "Your main home"], ["spouse", "Spouse's main home"], ["both", "Both spouses' main home"], ["neither", "Neither person's main home"]]} onChange={value => updateHome(index, { mainHomeFor: value as EnergyHomeData["mainHomeFor"] })} />
        <TextFact label={`Main-home start date, if needed — home ${index + 1}`} type="date" value={home.mainHomeStartDate ?? ""} onChange={value => updateHome(index, { mainHomeStartDate: value })} />
        <TextFact label={`Main-home end date, if needed — home ${index + 1}`} type="date" value={home.mainHomeEndDate ?? ""} onChange={value => updateHome(index, { mainHomeEndDate: value })} />
        <BooleanFact label={`Is this home jointly occupied with someone filing another return? — home ${index + 1}`} value={home.jointOccupancyWithOtherReturn} onChange={value => updateHome(index, { jointOccupancyWithOtherReturn: value })} />
        {home.jointOccupancyWithOtherReturn && <BooleanFact label={`Have you included all occupants' corresponding property costs? — home ${index + 1}`} value={home.allOccupantCostsComplete} onChange={value => updateHome(index, { allOccupantCostsComplete: value })} />}
        <button type="button" className="utility-button" onClick={() => edit({ ...data, homes: homes.filter((_, i) => i !== index) })}>Remove installation home {index + 1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={() => edit({ ...data, homes: [...homes, { id: crypto.randomUUID(), address: { street: "", city: "", state: "", zip: "" } }] })}>+ Add installation home</button>
      {!homes.length && <button type="button" className="utility-button" onClick={() => edit({ ...data, homes: [] })}>Confirm no installation homes</button>}
      {filingStatus === "mfj" && <BooleanFact label="Did both spouses own and live apart in separate main homes?" value={data.separateSpousalMainHomes} onChange={value => edit({ ...data, separateSpousalMainHomes: value })} />}
    </>}
    <h4 className="guided-section-subheading">Individual home-efficiency improvements</h4>
    {improvements.map((entry, index) => <fieldset className="guided-fieldset" key={entry.sourceId ?? index}>
      <legend>Improvement {index + 1}</legend>
      <Choice label="Improvement category" value={entry.category} options={Object.entries(energyImprovementLabels)} onChange={value => updateImprovement(index, { category: value as EnergyImprovementCategory | "" })} />
      <CurrencyField label="Net qualified improvement cost" value={entry.qualifiedCost} onChange={value => updateImprovement(index, { qualifiedCost: value })} />
      <TextFact label="Improvement installation completion date" type="date" value={entry.installationCompletedDate} onChange={value => updateImprovement(index, { installationCompletedDate: value })} />
      <BooleanFact label="Do actual records establish this item's qualification?" value={entry.qualificationConfirmed} onChange={value => updateImprovement(index, { qualificationConfirmed: value })} />
      {entry.category && !["insulation", "home_energy_audit"].includes(entry.category) && <TextFact label="Qualified manufacturer ID (four characters for 2025)" value={entry.manufacturerQualifiedId ?? ""} onChange={value => updateImprovement(index, { manufacturerQualifiedId: value })} />}
      {physicalSources && <>
        <PropertySource entry={entry} homes={homes} label={`improvement ${index + 1}`} onChange={values => updateImprovement(index, values)} />
        {entry.qualificationConfirmed && (entry.category === "home_energy_audit" ? <BooleanFact label={`Was there a certified written audit report? — improvement ${index + 1}`} value={entry.auditReportCertified} onChange={value => updateImprovement(index, { auditReportCertified: value })} /> : <>
          <BooleanFact label={`Did original use begin with you? — improvement ${index + 1}`} value={entry.originalUseByTaxpayer} onChange={value => updateImprovement(index, { originalUseByTaxpayer: value })} />
          <BooleanFact label={`Was this related to constructing a new home? — improvement ${index + 1}`} value={entry.newConstruction} onChange={value => updateImprovement(index, { newConstruction: value })} />
          {["insulation", "exterior_door", "windows_skylights"].includes(entry.category) && <BooleanFact label={`Is this expected to remain in use for at least five years? — improvement ${index + 1}`} value={entry.expectedFiveYearUse} onChange={value => updateImprovement(index, { expectedFiveYearUse: value })} />}
        </>)}
        {entry.category === "electrical_panel" && <>
          <TextFact label={`Panel load capacity in amps — improvement ${index + 1}`} value={entry.panelLoadAmps ?? ""} onChange={value => updateImprovement(index, { panelLoadAmps: value })} />
          <BooleanFact label={`Was the installation consistent with the National Electric Code? — improvement ${index + 1}`} value={entry.panelCodeComplianceConfirmed} onChange={value => updateImprovement(index, { panelCodeComplianceConfirmed: value })} />
          {(entry.enabledPropertyIds ?? []).map((id, linkIndex) => <div key={linkIndex}>
            <Choice label={`Property enabled by panel ${index + 1} — link ${linkIndex + 1}`} value={id} options={improvements.filter(item => item.sourceId && item.sourceId !== entry.sourceId && ["windows_skylights", "central_ac", "gas_water_heater", "furnace_boiler", "heat_pump", "heat_pump_water_heater", "biomass"].includes(item.category)).map(item => [item.sourceId ?? "", `${energyImprovementLabels[item.category as EnergyImprovementCategory]} (${item.installationCompletedDate || "date needed"})`])} onChange={value => updateImprovement(index, { enabledPropertyIds: entry.enabledPropertyIds?.map((saved, i) => i === linkIndex ? value : saved) })} />
            <button type="button" className="utility-button" onClick={() => updateImprovement(index, { enabledPropertyIds: entry.enabledPropertyIds?.filter((_, i) => i !== linkIndex) })}>Remove enabled-property link {linkIndex + 1} from panel {index + 1}</button>
          </div>)}
          <button type="button" className="utility-button" onClick={() => updateImprovement(index, { enabledPropertyIds: [...(entry.enabledPropertyIds ?? []), ""] })}>Add enabled property to panel {index + 1}</button>
          <BooleanFact label={`Are you electing to treat consecutive-year installations in the later year? — panel ${index + 1}`} value={entry.consecutiveYearElection} onChange={value => updateImprovement(index, { consecutiveYearElection: value })} />
        </>}
        {entry.installationCompletedDate && taxYear && Number(entry.installationCompletedDate.slice(0, 4)) < taxYear && <BooleanFact label={`Was a credit already claimed for this property in its earlier installation year? — improvement ${index + 1}`} value={entry.priorYearCreditClaimed} onChange={value => updateImprovement(index, { priorYearCreditClaimed: value })} />}
      </>}
      <button type="button" className="utility-button" onClick={() => edit({ ...data, qualifiedImprovements: improvements.filter((_, itemIndex) => itemIndex !== index) })}>Remove improvement {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => edit({ ...data, qualifiedImprovements: [...improvements, { sourceId: crypto.randomUUID(), category: "", qualifiedCost: "", installationCompletedDate: "", qualificationConfirmed: null }] })}>+ Add improvement</button>
    {!improvements.length && <button type="button" className="utility-button" onClick={() => edit({ ...data, qualifiedImprovements: [] })}>Confirm no efficiency improvements</button>}
    <h4 className="guided-section-subheading">Individual clean-energy properties</h4>
    {properties.map((entry, index) => <fieldset className="guided-fieldset" key={entry.sourceId ?? index}>
      <legend>Clean-energy property {index + 1}</legend>
      <Choice label="Clean-energy category" value={entry.category} options={Object.entries(cleanEnergyLabels)} onChange={value => updateProperty(index, { category: value as CleanEnergyCategory | "" })} />
      <CurrencyField label="Net qualified clean-energy cost" value={entry.qualifiedCost} onChange={value => updateProperty(index, { qualifiedCost: value })} />
      <TextFact label="Clean-energy installation completion date" type="date" value={entry.installationCompletedDate} onChange={value => updateProperty(index, { installationCompletedDate: value })} />
      <BooleanFact label="Do actual records establish this property's qualification?" value={entry.qualificationConfirmed} onChange={value => updateProperty(index, { qualificationConfirmed: value })} />
      {entry.category === "fuel_cell" && <TextFact label="Fuel-cell kilowatt capacity" value={entry.fuelCellKilowattCapacity ?? ""} onChange={value => updateProperty(index, { fuelCellKilowattCapacity: value })} />}
      {entry.category === "battery" && <TextFact label="Battery capacity in kilowatt-hours" value={entry.batteryKilowattHours ?? ""} onChange={value => updateProperty(index, { batteryKilowattHours: value })} />}
      {physicalSources && <PropertySource entry={entry} homes={homes} label={`clean-energy property ${index + 1}`} onChange={values => updateProperty(index, values)} />}
      <button type="button" className="utility-button" onClick={() => edit({ ...data, cleanEnergyProperties: properties.filter((_, itemIndex) => itemIndex !== index) })}>Remove clean-energy property {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => edit({ ...data, cleanEnergyProperties: [...properties, { sourceId: crypto.randomUUID(), category: "", qualifiedCost: "", installationCompletedDate: "", qualificationConfirmed: null }] })}>+ Add clean-energy property</button>
    {!properties.length && <button type="button" className="utility-button" onClick={() => edit({ ...data, cleanEnergyProperties: [] })}>Confirm no clean-energy properties</button>}
    <h4 className="guided-section-subheading">Residential clean-energy carryforward</h4>
    <CurrencyField label="Prior-year Form 5695 carryforward" hint="Use the actual prior-year carryforward, not the total credit. Enter0 when your prior records establish none." value={data.priorYearCarryforward ?? ""} onChange={value => edit({ ...data, priorYearCarryforward: value, carryforwardConfirmed: null })} />
    <TextFact label="Carryforward source tax year" value={data.carryforwardSourceTaxYear ?? ""} onChange={value => edit({ ...data, carryforwardSourceTaxYear: value, carryforwardConfirmed: null })} />
    <BooleanFact label="Is this carryforward confirmed from the prior-year Form 5695?" value={data.carryforwardConfirmed} onChange={value => edit({ ...data, carryforwardConfirmed: value })} />
    {(Object.keys(legacyEnergyLabels) as Array<keyof typeof legacyEnergyLabels>).filter(field => data[field].trim()).map(field => <CurrencyField key={field} label={legacyEnergyLabels[field]} hint="Reconcile the saved amount to actual individual records above. It will not be counted again." value={data[field]} onChange={value => edit({ ...data, [field]: value })} />)}
    {data.roofCost.trim() && <Choice label="Actual treatment of the saved roof cost" value={data.legacyRoofTreatment} options={[["not_eligible", "General roofing — no energy credit"], ["qualified_solar_component", "Qualified solar component included in the detailed solar cost"]]} onChange={value => edit({ ...data, legacyRoofTreatment: value as EnergyCreditData["legacyRoofTreatment"] })} />}
    {physicalSources && <BooleanFact label="Have you checked every installation, eligibility and allocation record after the last edit?" value={data.sourceFactsConfirmed} onChange={value => onChange({ ...data, sourceFactsConfirmed: value,
      qualifiedImprovements: data.qualifiedImprovements?.map(entry => ({ ...entry, sourceId: entry.sourceId ?? crypto.randomUUID() })),
      cleanEnergyProperties: data.cleanEnergyProperties?.map(entry => ({ ...entry, sourceId: entry.sourceId ?? crypto.randomUUID() })),
    })} />}
  </div>;
}
