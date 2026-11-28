"use client";

import type { RentalAllocationCategory } from "@/models/rental-use-allocation-2026.js";
import type { RentalAssetDraft, RentalExpenseReceiptDraft, RentalRentReceiptDraft, RentalResidenceWorksheetDraft, RentalUseAllocationDraft, RentalUsePeriodDraft } from "@/lib/guided-rental-use-allocation";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

const expenseChoices = [["advertising", "Advertising"], ["commissions", "Commissions"], ["managementFees", "Management fees"],
  ["insurance", "Insurance"], ["utilities", "Utilities"], ["taxes", "Property taxes"]] as const satisfies ReadonlyArray<readonly [RentalAllocationCategory, string]>;

function RentalSelect<T extends string>({ label, value, choices, onChange }: {
  label: string; value?: T; choices: ReadonlyArray<readonly [T, string]>; onChange: (value: T | undefined) => void;
}) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input"
    value={value ?? ""} onChange={event => onChange(choices.find(([key]) => key === event.target.value)?.[0])}>
    <option value="">Choose from the original record</option>{choices.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select></label>;
}

function ReceiptFields({ label, value, onChange }: { label: string; value: RentalRentReceiptDraft; onChange: (update: RentalRentReceiptDraft) => void }) {
  return <>
    <TextFact label={`${label} reference`} value={value.sourceReference ?? ""} onChange={sourceReference => onChange({ sourceReference })} />
    <TextFact label={`${label} dwelling address`} value={value.propertyAddress ?? ""} onChange={propertyAddress => onChange({ propertyAddress })} />
    <TextFact label={`${label} paid date`} type="date" value={value.datePaid ?? ""} onChange={datePaid => onChange({ datePaid })} />
    <CurrencyField label={`${label} amount`} value={value.amount ?? ""} onChange={amount => onChange({ amount })} />
  </>;
}

function editRow<T>(rows: T[], index: number, value: T): T[] {
  return rows.map((row, position) => position === index ? { ...row, ...value } : row);
}

export function RentalUseAllocationDetails({ value, usedAsHome, onChange }: { value?: RentalUseAllocationDraft; usedAsHome: boolean; onChange: (value: RentalUseAllocationDraft) => void }) {
  const draft: RentalUseAllocationDraft = value ?? { taxYear: 2026, expenseReceipts: [] };
  const periods = draft.periods ?? [];
  const rents = draft.rentReceipts ?? [];
  const expenses = draft.expenseReceipts ?? [];
  const depreciation = draft.depreciation ?? {};
  const assets = depreciation.assets ?? [];
  const residence = draft.residenceWorksheet ?? {};
  const update = (values: Partial<RentalUseAllocationDraft>) => onChange({
    ...draft, confirmedCompleteOrdinaryUse: null, ...values,
  });
  const updateDepreciation = (values: Partial<NonNullable<RentalUseAllocationDraft["depreciation"]>>) => update({
    depreciation: { ...depreciation, confirmedCompleteWithoutCurrentAssets: null, ...values },
  });
  const updatePeriod = (index: number, row: RentalUsePeriodDraft) => update({ periods: editRow(periods, index, row) });
  const updateRent = (index: number, row: RentalRentReceiptDraft) => update({ rentReceipts: editRow(rents, index, row) });
  const updateExpense = (index: number, row: RentalExpenseReceiptDraft) => update({ expenseReceipts: editRow(expenses, index, row) });
  const updateAsset = (index: number, row: RentalAssetDraft) => updateDepreciation({ assets: editRow(assets, index, row) });
  const updateResidence = (values: RentalResidenceWorksheetDraft) => update({
    residenceWorksheet: { ...residence, priorYear: 2025, confirmedCompletePriorYear: null, ...values },
  });
  return <details className="guided-expand"><summary className="guided-expand-trigger">2026 rental and personal use records</summary>
    <p className="guided-hint">Use complete records for one wholly owned dwelling and one tenant lease longer than 30 days. Enter the original lease reference on its use period and each rent receipt. Enter whole expense amounts before allocating them. Property taxes require a standard deduction election.</p>
    <div className="guided-form-grid">
      <TextFact label="Dwelling address on the use calendar" value={draft.propertyAddress ?? ""} onChange={propertyAddress => update({ propertyAddress })} />
      <TextFact label="Original occupied-day calendar reference" value={draft.occupancySourceReference ?? ""} onChange={occupancySourceReference => update({ occupancySourceReference })} />
      <TextFact label="Complete gross-rent ledger reference" value={draft.rentSourceReference ?? ""} onChange={rentSourceReference => update({ rentSourceReference })} />
      <TextFact label="Complete expense ledger reference" value={draft.expenseSourceReference ?? ""} onChange={expenseSourceReference => update({ expenseSourceReference })} />
    </div>
    {periods.map((period, index) => <fieldset key={index} className="guided-form-grid"><legend>Use period {index + 1}</legend>
      <TextFact label={`Use period ${index + 1} reference`} value={period.sourceReference ?? ""} onChange={sourceReference => updatePeriod(index, { sourceReference })} />
      <RentalSelect label={`Use period ${index + 1} type`} value={period.use} choices={[["fair_rental", "Fair-market rental to an unrelated tenant"], ["personal", "Personal use"]]} onChange={use => updatePeriod(index, { use })} />
      <TextFact label={`Use period ${index + 1} first occupied date`} type="date" value={period.start ?? ""} onChange={start => updatePeriod(index, { start })} />
      <TextFact label={`Use period ${index + 1} last occupied date`} type="date" value={period.end ?? ""} onChange={end => updatePeriod(index, { end })} />
      <button type="button" onClick={() => update({ periods: periods.filter((_, row) => row !== index) })}>Remove use period {index + 1}</button>
    </fieldset>)}
    <button type="button" onClick={() => update({ periods: [...periods, {}] })}>Add use period</button>
    {rents.map((receipt, index) => <fieldset key={index} className="guided-form-grid"><legend>Rent receipt {index + 1}</legend>
      <ReceiptFields label={`Rent receipt ${index + 1}`} value={receipt} onChange={row => updateRent(index, row)} />
      <TextFact label={`Rent receipt ${index + 1} original lease reference`} value={receipt.leaseReference ?? ""} onChange={leaseReference => updateRent(index, { leaseReference })} />
      <button type="button" onClick={() => update({ rentReceipts: rents.filter((_, row) => row !== index) })}>Remove rent receipt {index + 1}</button>
    </fieldset>)}
    <button type="button" onClick={() => update({ rentReceipts: [...rents, {}] })}>Add rent receipt</button>
    {expenses.map((receipt, index) => <fieldset key={index} className="guided-form-grid"><legend>Expense receipt {index + 1}</legend>
      <ReceiptFields label={`Expense receipt ${index + 1}`} value={receipt} onChange={row => updateExpense(index, row)} />
      <RentalSelect label={`Expense receipt ${index + 1} category`} value={receipt.category} choices={expenseChoices} onChange={category => updateExpense(index, { category })} />
      <RentalSelect label={`Expense receipt ${index + 1} use`} value={receipt.use} choices={[["rental_only", "Rental only"], ["shared", "Shared between rental and personal use"], ["personal", "Personal only"]]} onChange={use => updateExpense(index, { use })} />
      <button type="button" onClick={() => update({ expenseReceipts: expenses.filter((_, row) => row !== index) })}>Remove expense receipt {index + 1}</button>
    </fieldset>)}
    <button type="button" onClick={() => update({ expenseReceipts: [...expenses, {}] })}>Add expense receipt</button>
    <fieldset className="guided-form-grid"><legend>Original depreciation records</legend>
      <TextFact label="Dwelling address on the asset ledger" value={depreciation.propertyAddress ?? ""} onChange={propertyAddress => updateDepreciation({ propertyAddress })} />
      <TextFact label="Prior asset ledger reference" value={depreciation.sourceReference ?? ""} onChange={sourceReference => updateDepreciation({ sourceReference })} />
      {assets.map((asset, index) => <fieldset key={index} className="guided-form-grid"><legend>Prior asset {index + 1}</legend>
        <TextFact label={`Prior asset ${index + 1} reference`} value={asset.sourceReference ?? ""} onChange={sourceReference => updateAsset(index, { sourceReference })} />
        <RentalSelect label={`Prior asset ${index + 1} type`} value={asset.kind} choices={[["building", "Dwelling building"], ["other", "Other retained asset"]]} onChange={kind => updateAsset(index, { kind })} />
        <TextFact label={`Prior asset ${index + 1} placed-in-service date`} type="date" value={asset.placedInServiceDate ?? ""} onChange={placedInServiceDate => updateAsset(index, { placedInServiceDate })} />
        <TextFact label={`Prior asset ${index + 1} full recovery date`} type="date" value={asset.basisFullyRecoveredDate ?? ""} onChange={basisFullyRecoveredDate => updateAsset(index, { basisFullyRecoveredDate })} />
        <CurrencyField label={`Prior asset ${index + 1} depreciable basis`} value={asset.depreciableBasis ?? ""} onChange={depreciableBasis => updateAsset(index, { depreciableBasis })} />
        <CurrencyField label={`Prior asset ${index + 1} prior allowable depreciation`} value={asset.priorAllowableDepreciation ?? ""} onChange={priorAllowableDepreciation => updateAsset(index, { priorAllowableDepreciation })} />
        <button type="button" onClick={() => updateDepreciation({ assets: assets.filter((_, row) => row !== index) })}>Remove prior asset {index + 1}</button>
      </fieldset>)}
      <button type="button" onClick={() => updateDepreciation({ assets: [...assets, {}] })}>Add prior asset</button>
      <BooleanFact label="Do the complete asset records show full prior recovery, with zero allowable 2026 depreciation and no current assets, basis changes or listed property?" value={depreciation.confirmedCompleteWithoutCurrentAssets} onChange={confirmedCompleteWithoutCurrentAssets => updateDepreciation({ confirmedCompleteWithoutCurrentAssets })} />
    </fieldset>
    {(usedAsHome || draft.residenceWorksheet) && <fieldset className="guided-form-grid"><legend>Dwelling used as a home</legend>
      <p className="guided-hint">This worksheet supports rental-only advertising and shared insurance with the standard deduction. Enter each carryover amount from complete 2025 records, including zero if the records confirm it.</p>
      <TextFact label="Dwelling address on the 2025 carryover records" value={residence.propertyAddress ?? ""} onChange={propertyAddress => updateResidence({ propertyAddress })} />
      <TextFact label="2025 carryover records reference" value={residence.sourceReference ?? ""} onChange={sourceReference => updateResidence({ sourceReference })} />
      <CurrencyField label="2025 operating expense carryover" value={residence.priorOperatingCarryover ?? ""} onChange={priorOperatingCarryover => updateResidence({ priorOperatingCarryover })} />
      <CurrencyField label="2025 depreciation and casualty carryover" value={residence.priorDepreciationAndCasualtyCarryover ?? ""} onChange={priorDepreciationAndCasualtyCarryover => updateResidence({ priorDepreciationAndCasualtyCarryover })} />
      <CurrencyField label="2026 casualty and theft loss" value={residence.currentCasualtyAndTheftLoss ?? ""} onChange={currentCasualtyAndTheftLoss => updateResidence({ currentCasualtyAndTheftLoss })} />
      <BooleanFact label="Have you checked complete 2025 carryover records for this dwelling and the current casualty and theft amount?" value={residence.confirmedCompletePriorYear} onChange={confirmedCompletePriorYear => updateResidence({ confirmedCompletePriorYear })} />
      {draft.residenceWorksheet && <button type="button" onClick={() => update({ residenceWorksheet: undefined })}>Remove residence worksheet records</button>}
    </fieldset>}
    <BooleanFact label="Was this one for-profit lease to an unrelated tenant, without significant services or a special rental relationship?" value={draft.confirmedOrdinaryTenantRelationship} onChange={confirmedOrdinaryTenantRelationship => update({ confirmedOrdinaryTenantRelationship })} />
    <BooleanFact label="Do these complete ordinary cash-rental records include all occupied days, rents and expenses, with no other rental classifications or special-use periods?" value={draft.confirmedCompleteOrdinaryUse} onChange={confirmedCompleteOrdinaryUse => update({ confirmedCompleteOrdinaryUse })} />
  </details>;
}
