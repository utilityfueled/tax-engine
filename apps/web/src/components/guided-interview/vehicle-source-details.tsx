"use client";

import { filingStatusOptions, type FilingStatus } from "@/lib/guided-interview-flow";
import type { VehicleCreditData, VehicleEntryData } from "@/lib/guided-vehicle-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

function FilingStatusFact({ label, value, onChange }: { label: string; value: FilingStatus | "" | undefined; onChange: (value: FilingStatus | "") => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ""} onChange={(event) => onChange(event.target.value as FilingStatus | "")}><option value="">Choose the actual prior-year status</option>{filingStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function VehicleSourceDetails({ data, filingStatus, onChange }: { data: VehicleCreditData | undefined; filingStatus?: FilingStatus | null; onChange: (data: VehicleCreditData) => void }) {
  const current = data ?? { entries: [] };
  const update = (values: Partial<VehicleCreditData>) => onChange({ ...current, ...values });
  return <div className="guided-w2-card" style={{ padding: "12px" }}>
    <h3 className="guided-w2-card-title">Clean Vehicle Credits (Form 8936)</h3>
    <p className="guided-hint">Use the actual accepted seller report and purchase records. A binding written contract and payment by September 30, 2025 may qualify a vehicle placed in service later. Transfer elections must still be reconciled on the return. <a href="https://www.irs.gov/instructions/i8936" target="_blank" rel="noreferrer">Review the IRS eligibility requirements.</a></p>
    {current.entries.map((entry, index) => {
      const change = (values: Partial<VehicleEntryData>) => update({ entries: current.entries.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) });
      return <fieldset className="guided-fieldset" key={index}><legend>Vehicle {index + 1}</legend>
        <label className="guided-field"><span className="guided-field-label">Vehicle purchase category</span><select className="guided-input" value={entry.kind ?? ""} onChange={(event) => change({ kind: event.target.value as VehicleEntryData["kind"] })}><option value="">Choose actual category</option><option value="new">New clean vehicle</option><option value="used">Previously owned clean vehicle</option></select></label>
        <label className="guided-field"><span className="guided-field-label">Vehicle owner claiming the credit</span><select className="guided-input" value={entry.owner ?? ""} onChange={(event) => change({ owner: event.target.value as VehicleEntryData["owner"] })}><option value="">Choose actual owner</option><option value="primary">You</option>{filingStatus === "mfj" && <option value="spouse">Your spouse</option>}</select></label>
        <TextFact label="Vehicle identification number (VIN)" value={entry.vin ?? ""} onChange={(value) => change({ vin: value })} />
        {([ ["dateAcquired", "Actual vehicle acquisition date"], ["datePlacedInService", "Date you took possession (placed in service)"], ["bindingContractDate", "Written binding contract date"], ["paymentDate", "Date a payment was made under the contract"] ] as const).map(([field, label]) => <TextFact key={field} label={label} type="date" value={entry[field] ?? ""} onChange={(value) => change({ [field]: value })} />)}
        <BooleanFact label="Do actual records establish a binding written contract and qualifying payment?" value={entry.bindingContractConfirmed} onChange={(value) => change({ bindingContractConfirmed: value })} />
        <BooleanFact label="Did you receive the seller report accepted by IRS Energy Credits Online?" value={entry.sellerReportReceived} onChange={(value) => change({ sellerReportReceived: value })} />
        <CurrencyField label="Credit amount on the accepted seller report" value={entry.sellerReportCreditAmount ?? ""} onChange={(value) => change({ sellerReportCreditAmount: value })} />
        <BooleanFact label="Do actual records establish all applicable vehicle and buyer eligibility requirements?" value={entry.eligibilityConfirmed} onChange={(value) => change({ eligibilityConfirmed: value })} />
        <TextFact label="Actual personal-use percentage (0–100)" value={entry.personalUsePercentage ?? ""} onChange={(value) => change({ personalUsePercentage: value })} />
        {entry.kind === "new" && <>
          <label className="guided-field"><span className="guided-field-label">Vehicle powertrain</span><select className="guided-input" value={entry.powertrain ?? ""} onChange={(event) => change({ powertrain: event.target.value as VehicleEntryData["powertrain"] })}><option value="">Choose actual powertrain</option><option value="battery">Battery</option><option value="fuel_cell">Fuel cell</option></select></label>
          <label className="guided-field"><span className="guided-field-label">Vehicle type for MSRP limit</span><select className="guided-input" value={entry.vehicleType ?? ""} onChange={(event) => change({ vehicleType: event.target.value as VehicleEntryData["vehicleType"] })}><option value="">Choose actual type</option><option value="suv_van_pickup">SUV, van or pickup truck</option><option value="other">Other vehicle</option></select></label>
          <CurrencyField label="Actual manufacturer suggested retail price" value={entry.msrp ?? ""} onChange={(value) => change({ msrp: value })} />
          <BooleanFact label="Does the seller report establish the critical-minerals requirement?" value={entry.criticalMineralsRequirementMet} onChange={(value) => change({ criticalMineralsRequirementMet: value })} />
          <BooleanFact label="Does the seller report establish the battery-components requirement?" value={entry.batteryComponentsRequirementMet} onChange={(value) => change({ batteryComponentsRequirementMet: value })} />
        </>}
        {entry.kind === "used" && <CurrencyField label="Actual previously owned vehicle sale price" value={entry.salePrice ?? ""} onChange={(value) => change({ salePrice: value })} />}
        <BooleanFact label="Did you elect to transfer this credit to the dealer?" value={entry.creditTransferredToDealer} onChange={(value) => change({ creditTransferredToDealer: value })} />
        {(entry.creditTransferredToDealer || entry.creditTransferredAmount?.trim()) && <CurrencyField label="Actual amount transferred to the dealer" value={entry.creditTransferredAmount ?? ""} onChange={(value) => change({ creditTransferredAmount: value })} />}
        <BooleanFact label="Was the vehicle resold within 30 days?" value={entry.resoldWithin30Days} onChange={(value) => change({ resoldWithin30Days: value })} />
        <BooleanFact label="Was the vehicle returned to the seller within 30 days?" value={entry.returnedToSellerWithin30Days} onChange={(value) => change({ returnedToSellerWithin30Days: value })} />
        {entry.returnedToSellerWithin30Days && <BooleanFact label="Was the seller report updated and the transferred credit reconciled with the dealer?" value={entry.sellerReportUpdatedForReturn} onChange={(value) => change({ sellerReportUpdatedForReturn: value })} />}
        <details className="guided-expand"><summary className="guided-expand-trigger">Owner's separate prior-year MAGI</summary><div className="guided-expand-body">
          <p className="guided-hint">Use the actual owner's prior-year facts when a joint return's prior-year amounts do not apply to that owner. Do not substitute another person's income.</p>
          <CurrencyField label="Owner's actual prior-year modified AGI" value={entry.priorYearMagi ?? ""} onChange={(value) => change({ priorYearMagi: value })} />
          <FilingStatusFact label="Owner's actual prior-year filing status" value={entry.priorYearFilingStatus} onChange={(value) => change({ priorYearFilingStatus: value })} />
          <BooleanFact label="Is the owner's prior-year MAGI confirmed from the actual worksheet?" value={entry.priorYearMagiConfirmed} onChange={(value) => change({ priorYearMagiConfirmed: value })} />
        </div></details>
        <button type="button" className="utility-button" onClick={() => update({ entries: current.entries.filter((_, itemIndex) => itemIndex !== index) })}>Remove vehicle {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => update({ entries: [...current.entries, {}] })}>Add vehicle</button>
    {current.entries.length > 0 && <fieldset className="guided-fieldset"><legend>Vehicle credit MAGI worksheet</legend>
      <p className="guided-hint">Current AGI comes from the return calculation. Enter each actual adjustment below, including zero. Leave prior-year AGI unanswered if unknown; the calculation may require it if current-year MAGI is over the limit.</p>
      {([ ["foreignEarnedIncomeExclusion", "Current-year foreign earned income exclusion"], ["foreignHousingDeduction", "Current-year foreign housing deduction"], ["possessionIncomeExclusion", "Current-year Puerto Rico / American Samoa exclusion"], ["priorYearAgi", "Prior-year adjusted gross income (optional if unknown)"] ] as const).map(([field, label]) => <CurrencyField key={field} label={label} value={current[field] ?? ""} onChange={(value) => update({ [field]: value })} />)}
      <BooleanFact label="Are all current-year vehicle MAGI adjustments confirmed from actual records?" value={current.agiAdjustmentsConfirmed} onChange={(value) => update({ agiAdjustmentsConfirmed: value })} />
      {current.priorYearAgi?.trim() && <>
        <FilingStatusFact label="Actual prior-year filing status" value={current.priorYearFilingStatus} onChange={(value) => update({ priorYearFilingStatus: value })} />
        {([ ["priorYearForeignEarnedIncomeExclusion", "Prior-year foreign earned income exclusion"], ["priorYearForeignHousingDeduction", "Prior-year foreign housing deduction"], ["priorYearPossessionIncomeExclusion", "Prior-year Puerto Rico / American Samoa exclusion"] ] as const).map(([field, label]) => <CurrencyField key={field} label={label} value={current[field] ?? ""} onChange={(value) => update({ [field]: value })} />)}
        <BooleanFact label="Are all prior-year vehicle MAGI adjustments confirmed from actual records?" value={current.priorYearAgiAdjustmentsConfirmed} onChange={(value) => update({ priorYearAgiAdjustmentsConfirmed: value })} />
      </>}
    </fieldset>}
  </div>;
}
