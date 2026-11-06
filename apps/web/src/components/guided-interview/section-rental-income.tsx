"use client";

import { RetroShell } from "@/components/retro-shell";
import { type RentalPropertyEntryData, emptyRentalPropertyEntry, rentalPropertyTypeOptions } from "@/lib/guided-interview-flow";
import { rentalExpenseFields, paRentalBooleanFacts, type PARentalClassificationData } from "@/lib/guided-rental-facts";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";
import { PARentalExpenseDetails } from "./pa-rental-expense-details";
import type { PARentalIncomeExpensesData } from "@/lib/guided-pa-rental-facts";
import { RentalCarrySourceDetails } from "./rental-carry-source-details";
import { guidedSourceValuesChanged } from "@/lib/guided-source-confirmation";

function RentalPropertyCard({ entry, index, onEntryChange, onRemove, canRemove, stateCode }: {
  entry: RentalPropertyEntryData; index: number; onEntryChange: (entry: RentalPropertyEntryData) => void; onRemove: () => void; canRemove: boolean;
  stateCode?: string | null;
}) {
  const patch = (values: Partial<RentalPropertyEntryData>, confirmationOnly = false) => onEntryChange({ ...entry, ...values,
    priorLossSources: "priorLossSources" in values ? values.priorLossSources : (!confirmationOnly && !("sourceFactsConfirmed" in values) && entry.priorLossSources ? { ...entry.priorLossSources, sourceFactsConfirmed: null } : entry.priorLossSources),
    paClassification: values.paClassification ?? (!confirmationOnly && !("sourceFactsConfirmed" in values) && entry.paClassification ? { ...entry.paClassification, factsConfirmed: null } : entry.paClassification),
    paIncomeExpenses: values.paIncomeExpenses ?? (!confirmationOnly && !("sourceFactsConfirmed" in values) && entry.paIncomeExpenses ? { ...entry.paIncomeExpenses, factsConfirmed: null } : entry.paIncomeExpenses),
    sourceFactsConfirmed: "sourceFactsConfirmed" in values ? values.sourceFactsConfirmed : null });
  const patchPA = (values: PARentalClassificationData) => patch({ paClassification: { ...entry.paClassification, ...values, factsConfirmed: "factsConfirmed" in values ? values.factsConfirmed : null } }, Object.keys(values).length === 1 && "factsConfirmed" in values);
  const patchPAExpenses = (values: PARentalIncomeExpensesData) => patch({ paIncomeExpenses: { ...entry.paIncomeExpenses, ...values, factsConfirmed: "factsConfirmed" in values ? values.factsConfirmed : null } }, Object.keys(values).length === 1 && "factsConfirmed" in values);
  return <div className="guided-w2-card">
    <div className="guided-w2-card-header"><h3 className="guided-w2-card-title">{entry.description || `Property #${index + 1}`}</h3>
      {canRemove && <button className="utility-button utility-button-small" type="button" onClick={onRemove} aria-label={`Remove ${entry.description || `property #${index + 1}`}`}>Remove</button>}
    </div>
    <div className="guided-form-grid">
      <TextFact label="Actual property address or legal land description" value={entry.description} onChange={description => patch({ description })} />
      <label className="guided-field"><span className="guided-field-label">Actual property type</span><select className="guided-input" value={entry.propertyType} onChange={event => patch({ propertyType: event.target.value as RentalPropertyEntryData["propertyType"] })}><option value="">Not answered</option>{rentalPropertyTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="guided-field"><span className="guided-field-label">Actual rental owner</span><select className="guided-input" value={entry.accountHolder ?? ""} onChange={event => patch({ accountHolder: event.target.value as RentalPropertyEntryData["accountHolder"] })}><option value="">Not answered</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on a joint return</option><option value="joint">Joint interests requiring allocation</option></select></label>
      <TextFact label="Actual ownership percentage" value={entry.ownershipPercentage ?? ""} onChange={ownershipPercentage => patch({ ownershipPercentage })} />
      <TextFact label="Days rented at fair rental value" value={entry.rentalDays ?? ""} onChange={rentalDays => patch({ rentalDays })} />
      <TextFact label="Days of personal use" value={entry.personalUseDays ?? ""} onChange={personalUseDays => patch({ personalUseDays })} />
      <CurrencyField label="Gross rents for the whole property" hint="Include actual rental income before ownership allocation; enter 0 when the records establish zero." value={entry.rents} onChange={rents => patch({ rents })} />
    </div>
    <p className="guided-hint">Report each property separately. Blank amounts and answers are unknown. Enter full-property rents and expense amounts; the engine applies the actual ownership percentage once. Personal-use and other special classifications need additional worksheets.</p>
    <BooleanFact label="Was the property held for rental income or profit?" value={entry.heldForRental} onChange={heldForRental => patch({ heldForRental })} />
    <BooleanFact label="Are all entered rents and expenses full-property amounts before ownership allocation?" value={entry.amountsAreWholeProperty} onChange={amountsAreWholeProperty => patch({ amountsAreWholeProperty })} />
    <BooleanFact label="Did you actively participate through actual management decisions under the rental loss rules?" value={entry.isActiveParticipant} onChange={isActiveParticipant => patch({ isActiveParticipant })} />
    {entry.isActiveParticipant === true && <TextFact label="Lowest combined taxpayer and spouse ownership percentage during the year" value={entry.minimumOwnershipPercentage ?? ""} onChange={minimumOwnershipPercentage => patch({ minimumOwnershipPercentage })} />}
    <BooleanFact label="Was all your investment in this rental activity at risk?" value={entry.allInvestmentAtRisk} onChange={allInvestmentAtRisk => patch({ allInvestmentAtRisk })} />
    <BooleanFact label="Do you claim real estate professional treatment for this activity?" value={entry.realEstateProfessional} onChange={realEstateProfessional => patch({ realEstateProfessional })} />
    <BooleanFact label="Did you provide substantial services to occupants beyond ordinary rental services?" value={entry.substantialServices} onChange={substantialServices => patch({ substantialServices })} />
    <BooleanFact label="Was the property rented to a business in which you materially participated?" value={entry.selfRental} onChange={selfRental => patch({ selfRental })} />
    <BooleanFact label="Does this property require other special classification, interest-limit or loss worksheets?" value={entry.additionalWorksheetRequired} onChange={additionalWorksheetRequired => patch({ additionalWorksheetRequired })} />
    <CurrencyField label="Prior-year unallowed rental losses" value={entry.priorYearUnallowedLoss ?? ""} onChange={priorYearUnallowedLoss => patch({ priorYearUnallowedLoss })} />
    <CurrencyField label="Prior-year unallowed rental credits" value={entry.priorYearUnallowedCredits ?? ""} onChange={priorYearUnallowedCredits => patch({ priorYearUnallowedCredits })} />
    <RentalCarrySourceDetails data={entry.priorLossSources} onChange={priorLossSources => patch({ priorLossSources }, !guidedSourceValuesChanged(entry.priorLossSources, priorLossSources))} />
    <details className="guided-expand"><summary className="guided-expand-trigger">Actual deductible rental expenses</summary>
      <p className="guided-hint">Enter each checked category, including actual zero. Exclude capital improvements, personal costs and amounts claimed elsewhere. Vehicle and depreciation amounts come from their completed deductible worksheets.</p>
      <div className="guided-expand-body guided-form-grid guided-form-grid-3">{rentalExpenseFields.map(([field, label]) => <CurrencyField key={field} label={label} value={entry[field] ?? ""} onChange={value => patch({ [field]: value })} />)}</div>
      <TextFact label="Description of other deductible rental expenses" value={entry.otherExpenseDescription ?? ""} onChange={otherExpenseDescription => patch({ otherExpenseDescription })} />
      <BooleanFact label="Is the depreciation amount from the actual deductible depreciation worksheet?" value={entry.depreciationWorksheetConfirmed} onChange={depreciationWorksheetConfirmed => patch({ depreciationWorksheetConfirmed })} />
      <BooleanFact label="Is the auto and travel amount from the actual deductible vehicle and travel records?" value={entry.autoTravelWorksheetConfirmed} onChange={autoTravelWorksheetConfirmed => patch({ autoTravelWorksheetConfirmed })} />
    </details>
    <BooleanFact label="Does this rental qualify as a trade or business for the QBI deduction?" value={entry.qualifiesForQBI} onChange={qualifiesForQBI => patch({ qualifiesForQBI })} />
    {entry.qualifiesForQBI === true && <div className="guided-form-grid">
      <BooleanFact label="Did you materially participate in this qualified rental under section 469?" value={entry.qbiMateriallyParticipated} onChange={qbiMateriallyParticipated => patch({ qbiMateriallyParticipated })} />
      <BooleanFact label="Is the rental a specified service business for section 199A?" value={entry.qbiIsSST} onChange={qbiIsSST => patch({ qbiIsSST })} />
      <CurrencyField label="Owner's qualified W-2 wages for this rental" value={entry.qbiW2Wages ?? ""} onChange={qbiW2Wages => patch({ qbiW2Wages })} />
      <CurrencyField label="Owner's qualified-property UBIA for this rental" value={entry.qbiUBIA ?? ""} onChange={qbiUBIA => patch({ qbiUBIA })} />
    </div>}
    {stateCode?.toUpperCase() === "PA" && <fieldset className="guided-expand-body">
      <legend className="guided-field-label">Pennsylvania rental activity</legend>
      <p className="guided-hint">PA distinguishes a rental from a business using the activity's actual operation. Average customer use is the length of each customer's use, not total occupied days in the year. Your profit-intent and services answers above also apply here.</p>
      <TextFact label="Actual average customer-use period in days" value={entry.paClassification?.averageCustomerUseDays ?? ""} onChange={averageCustomerUseDays => patchPA({ averageCustomerUseDays })} />
      {paRentalBooleanFacts.map(([field, label]) => <BooleanFact key={field} label={label} value={entry.paClassification?.[field]} onChange={value => patchPA({ [field]: value })} />)}
      <TextFact label="PA rental activity source or worksheet reference" value={entry.paClassification?.sourceReference ?? ""} onChange={sourceReference => patchPA({ sourceReference })} />
      <BooleanFact label="Have you checked these PA activity facts against the source records?" value={entry.paClassification?.factsConfirmed} onChange={factsConfirmed => patchPA({ factsConfirmed })} />
    </fieldset>}
    {stateCode?.toUpperCase() === "PA" && <PARentalExpenseDetails value={entry.paIncomeExpenses} onChange={patchPAExpenses} />}
    <BooleanFact label="Have you checked the actual property, ownership, use, income and expense facts after the latest edits?" value={entry.sourceFactsConfirmed} onChange={sourceFactsConfirmed => patch({ sourceFactsConfirmed })} />
  </div>;
}

export function SectionRentalIncome({ entries, onEntriesChange, stateCode }: { entries: RentalPropertyEntryData[]; onEntriesChange: (entries: RentalPropertyEntryData[]) => void; stateCode?: string | null }) {
  return <RetroShell title="Rental Income" eyebrow="INCOME // SCHEDULE E">
    <div className="guided-question"><p className="guided-prompt">Enter the actual source facts for each rental property.</p><p className="guided-hint">Zero-rent and expense-only properties stay in the record. Complete their actual eligibility before calculating.</p></div>
    <div className="guided-w2-stack">{entries.map((entry, index) => <RentalPropertyCard key={index} entry={entry} index={index} stateCode={stateCode} onEntryChange={updated => onEntriesChange(entries.map((existing, existingIndex) => existingIndex === index ? updated : existing))} onRemove={() => onEntriesChange(entries.filter((_, existingIndex) => existingIndex !== index))} canRemove={entries.length > 1} />)}</div>
    <button className="utility-button" type="button" onClick={() => onEntriesChange([...entries, { ...emptyRentalPropertyEntry }])} aria-label="Add another rental property">+ Add another property</button>
  </RetroShell>;
}
