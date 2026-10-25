"use client";

import { emptyForeignIncome, emptyForeignIncomeSource, foreignIncomePartIVKeys, type ForeignIncomeData, type ForeignIncomeSourceData } from "@/lib/guided-foreign-income";
import { FORM2555_HOUSING_LIMITS } from "@/engine/forms/form-2555-housing-limits";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

const partLabels: Record<typeof foreignIncomePartIVKeys[number], string> = {
  wages: "Foreign wages and salary", businessPersonalServices: "Foreign business personal-service income", partnershipPersonalServices: "Foreign partnership personal-service income",
  noncashLodging: "Foreign noncash lodging", noncashMeals: "Foreign noncash meals", noncashCar: "Foreign noncash car", noncashOther: "Foreign other noncash compensation",
  allowanceCostOfLiving: "Foreign cost-of-living allowance", allowanceFamily: "Foreign family allowance", allowanceEducation: "Foreign education allowance",
  allowanceHomeLeave: "Foreign home-leave allowance", allowanceQuarters: "Foreign quarters allowance", allowanceOther: "Foreign other allowance",
  otherEarnedIncome: "Other foreign earned income", section119MealsAndLodging: "Section 119 meals and lodging",
};
function Choice({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Confirm the actual source</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}
export function ForeignIncomeDetails({ data, sources = [], onChange }: { data?: ForeignIncomeData; sources?: { sourceId: string; label: string }[]; onChange: (data: ForeignIncomeData | undefined) => void }) {
  if (!data) return <section><h3>Foreign earned income</h3><p className="guided-hint">Use original pay, travel, tax-home and election records for Form 2555. Foreign income is still reported before an exclusion is calculated.</p><button type="button" onClick={() => onChange(structuredClone(emptyForeignIncome))}>Add foreign-income worksheet</button></section>;
  const update = (patch: Partial<ForeignIncomeData>) => onChange({ ...data, ...patch, ...(Object.keys(patch).every(key => key === "sourceFactsConfirmed") ? {} : { sourceFactsConfirmed: null }) });
  const sourceUpdate = (index: number, patch: Partial<ForeignIncomeSourceData>) => update({ sources: data.sources.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const boolean = (key: { [K in keyof ForeignIncomeData]: ForeignIncomeData[K] extends boolean | null ? K : never }[keyof ForeignIncomeData], label: string) => <BooleanFact key={key} label={label} value={data[key]} onChange={value => update({ [key]: value })} />;
  const text = (key: { [K in keyof ForeignIncomeData]: ForeignIncomeData[K] extends string ? K : never }[keyof ForeignIncomeData], label: string, type: "text" | "date" = "text") => <TextFact key={key} label={label} value={data[key]} type={type} onChange={value => update({ [key]: value })} />;
  const money = (key: keyof Pick<ForeignIncomeData, "qualifiedHousingExpenses" | "nontaxableGovernmentHousingAllowance" | "deductionsAllocableToExcludedIncome" | "foreignEarnedIncomeTaxWorksheetDisallowedDeductions" | "priorYearHousingDeductionCarryover" | "priorYearIncomeExclusion" | "priorYearUnusedExclusion">, label: string) => <CurrencyField key={key} label={label} value={data[key]} required onChange={value => update({ [key]: value })} />;
  return <section>
    <h3>Foreign earned income</h3>
    <p className="guided-hint">Use the <a href="https://www.irs.gov/instructions/i2555" target="_blank" rel="noreferrer">Form 2555 instructions</a> and completed original worksheets. This entry supports one taxpayer&apos;s actual W-2, separate employment or personal-service Schedule C sources. Both spouses&apos; claims need separate forms. Leave unknown facts unanswered; enter zero only when the source establishes zero.</p>
    <div className="guided-form-grid">
      {text("sourceTaxYear", "Foreign-income worksheet year")}{text("sourceReference", "Foreign-income source reference")}
      <Choice label="Foreign-income taxpayer" value={data.accountHolder} options={[["primary", "Primary taxpayer"], ["spouse", "Spouse on joint return"]]} onChange={value => update({ accountHolder: value as ForeignIncomeData["accountHolder"] })} />
      {text("taxpayerName", "Foreign-income taxpayer name")}{text("taxpayerTaxIdLast4", "Foreign-income tax ID last four")}
    </div>
    <fieldset><legend>Actual qualification and election</legend>
      <p className="guided-hint">A foreign tax home includes the abode rule. Foreign countries exclude U.S. territories, Antarctica and international waters. U.S. Government employee pay does not qualify. Use completed records; expected future residence or travel does not establish eligibility.</p>
      <div className="guided-form-grid">
        {text("taxHomeCountry", "Foreign tax-home country")}{text("taxHomeStartDate", "Foreign tax-home start", "date")}{text("taxHomeEndDate", "Foreign tax-home end", "date")}
        {boolean("taxHomeConfirmed", "Foreign tax-home test met")}
        {boolean("foreignCountriesQualify", "Actual locations meet the foreign-country definition")}
        {(data.taxHomeCountry.toLowerCase().includes("cuba") || data.fullForeignPeriods.some(period => period.country.toLowerCase().includes("cuba")) || typeof data.cubaTravelPermittedConfirmed === "boolean") && boolean("cubaTravelPermittedConfirmed", "Actual Cuba travel complied with U.S. restrictions")}
        <Choice label="Citizenship or resident-alien status" value={data.citizenshipStatus} options={[["us_citizen", "U.S. citizen"], ["resident_alien", "U.S. resident alien"]]} onChange={value => update({ citizenshipStatus: value as ForeignIncomeData["citizenshipStatus"] })} />
        {boolean("servicesQualify", "Actual services qualify as foreign earned income")}
        <Choice label="Foreign qualification method" value={data.qualificationMethod} options={[["physical_presence", "Physical presence"], ["bona_fide_residence", "Bona fide residence"]]} onChange={value => update({ qualificationMethod: value as ForeignIncomeData["qualificationMethod"] })} />
        {text("qualificationReference", "Completed foreign qualification worksheet reference")}
        {text("testPeriodStartDate", "Foreign test-period start", "date")}{text("testPeriodEndDate", "Foreign test-period end", "date")}
        {boolean("testPeriodCompleted", "The documented qualification period is complete")}{text("qualifyingDays", "Actual qualifying days in this return year")}
      </div>
      {(data.qualificationMethod === "physical_presence" || data.fullForeignPeriods.length > 0) && <div>
        <p className="guided-hint">Enter nonoverlapping periods of full midnight-to-midnight days in foreign countries within the selected twelve months. At least 330 full foreign days are required. Travel days over international waters do not count. Current-year qualifying days use the tax-home/test-period overlap, which can differ from the foreign-day count.</p>
        {data.fullForeignPeriods.map((period, index) => <fieldset key={index}><legend>Full foreign-day period {index + 1}</legend><div className="guided-form-grid">
          {(["country", "startDate", "endDate"] as const).map((key, i) => <TextFact key={key} label={`${["Foreign-day country", "First full foreign day", "Last full foreign day"][i]} ${index + 1}`} type={key === "country" ? "text" : "date"} value={period[key]} onChange={value => update({ fullForeignPeriods: data.fullForeignPeriods.map((row, n) => n === index ? { ...row, [key]: value } : row) })} />)}
        </div><button type="button" onClick={() => update({ fullForeignPeriods: data.fullForeignPeriods.filter((_, n) => n !== index) })}>Remove full foreign-day period {index + 1}</button></fieldset>)}
        <button type="button" onClick={() => update({ fullForeignPeriods: [...data.fullForeignPeriods, { country: "", startDate: "", endDate: "" }] })}>Add full foreign-day period</button>
      </div>}
      {data.qualificationMethod === "bona_fide_residence" && <div className="guided-form-grid">
        {boolean("bonaFideResidenceConfirmed", "Actual bona fide residence test met for an uninterrupted full tax year")}
        {boolean("nonresidenceStatementDisqualifies", "A foreign nonresidence statement disqualifies the residence claim")}
        {data.citizenshipStatus === "resident_alien" && boolean("treatyResidentEligibilityConfirmed", "Actual citizenship or nationality meets the resident-alien treaty rule")}
      </div>}
      <div className="guided-form-grid">
        {boolean("electionsValidConfirmed", "Exclusion elections are valid including any revocation or IRS consent")}
        {boolean("claimForeignEarnedIncomeExclusion", "Claim foreign earned income exclusion")}
        {boolean("claimHousingExclusionOrDeduction", "Claim foreign housing exclusion or deduction")}
      </div>
    </fieldset>
    <fieldset><legend>Original Part IV amounts</legend>
      <p className="guided-hint">Enter actual U.S.-dollar amounts earned and received during the qualifying current-year services. Prior-year services paid this year belong in the separate history below. Noncash compensation uses its actual value. Personal-service business receipts are gross eligible income; a business where capital is material needs its separate 30-percent worksheet.</p>
      <div className="guided-form-grid">{foreignIncomePartIVKeys.map(key => <CurrencyField key={key} label={partLabels[key]} value={data.partIV[key]} required onChange={value => update({ partIV: { ...data.partIV, [key]: value } })} />)}</div>
      {text("noncashValuationReference", "Noncash compensation valuation reference")}
      {boolean("section119QualificationConfirmed", "Actual meals or lodging meets section 119 requirements")}
      {text("otherIncomeDescription", "Other foreign earned income description")}
      {boolean("businessCapitalMaterialIncomeProducing", "Capital is a material income-producing factor in the foreign business")}
    </fieldset>
    <fieldset><legend>Original income sources</legend>
      <p className="guided-hint">Link amounts to the original return source and retain its actual year, taxpayer and payer. A separate employment ID begins with foreignEmployment: followed by its actual distinguishable account or record reference. Selecting a source does not supply its year or identity. Schedule C source amounts must match actual included receipts and inventory records; this worksheet has no profit override.</p>
      {data.sources.map((row, index) => <fieldset key={index}><legend>Foreign source {index + 1}</legend><div className="guided-form-grid">
        <Choice label={`Existing return source ${index + 1}`} value={sources.some(source => source.sourceId === row.sourceId) ? row.sourceId : ""} options={sources.map(source => [source.sourceId, source.label] as const)} onChange={sourceId => sourceUpdate(index, { sourceId })} />
        <TextFact label={`Original foreign source ID ${index + 1}`} value={row.sourceId} onChange={sourceId => sourceUpdate(index, { sourceId })} />
        <TextFact label={`Foreign source year ${index + 1}`} value={row.sourceTaxYear} onChange={sourceTaxYear => sourceUpdate(index, { sourceTaxYear })} />
        <Choice label={`Foreign source taxpayer ${index + 1}`} value={row.accountHolder} options={[["primary", "Primary taxpayer"], ["spouse", "Spouse"]]} onChange={value => sourceUpdate(index, { accountHolder: value as ForeignIncomeSourceData["accountHolder"] })} />
        {(["payerName", "payerEin", "sourceReference"] as const).map((key, i) => <TextFact key={key} label={`${["Foreign payer or business name", "Foreign source employer EIN", "Original foreign source reference"][i]} ${index + 1}`} value={row[key]} onChange={value => sourceUpdate(index, { [key]: value })} />)}
        <CurrencyField label={`Current foreign receipts ${index + 1}`} value={row.foreignEarnedIncome} required onChange={foreignEarnedIncome => sourceUpdate(index, { foreignEarnedIncome })} />
        <CurrencyField label={`Prior services received this year ${index + 1}`} value={row.priorYearIncomeReceived} required onChange={priorYearIncomeReceived => sourceUpdate(index, { priorYearIncomeReceived })} />
        <BooleanFact label={`Separate employment is absent from W2 income ${index + 1}`} value={row.notIncludedInW2Confirmed} onChange={notIncludedInW2Confirmed => sourceUpdate(index, { notIncludedInW2Confirmed })} />
        {(row.sourceId === "scheduleC" || [row.businessGrossReceipts, row.businessReturnsAndAllowances, row.businessCostOfGoodsSold, row.businessOtherIncome].some(value => value.trim())) && (["businessGrossReceipts", "businessReturnsAndAllowances", "businessCostOfGoodsSold", "businessOtherIncome"] as const).map((key, i) => <CurrencyField key={key} label={`${["Original business gross receipts", "Original business returns and allowances", "Original business cost of goods sold", "Original business other income"][i]} ${index + 1}`} value={row[key]} required onChange={value => sourceUpdate(index, { [key]: value })} />)}
      </div><button type="button" onClick={() => update({ sources: data.sources.filter((_, n) => n !== index) })}>Remove foreign-income source {index + 1}</button></fieldset>)}
      <button type="button" onClick={() => update({ sources: [...data.sources, structuredClone(emptyForeignIncomeSource)] })}>Add original foreign-income source</button>
    </fieldset>
    <fieldset><legend>Housing and allocable deductions</legend>
      <p className="guided-hint">Use reasonable qualified housing costs from the actual paid-expense worksheet. Exclude section 119 costs, deductible interest/taxes, home purchases, principal, improvements and other disallowed costs. Confirm any spouse allocation does not duplicate a claim. Choose original notice locations and days; the engine calculates their published limit.</p>
      <div className="guided-form-grid">{money("qualifiedHousingExpenses", "Actual qualified foreign housing costs")}{text("housingExpenseReference", "Foreign housing expense source reference")}
        {boolean("housingExpensesQualificationConfirmed", "Actual foreign housing expenses qualify")}{boolean("housingNoDuplicateClaimConfirmed", "Foreign housing allocation has no duplicate claim")}
        {money("nontaxableGovernmentHousingAllowance", "Nontaxable government housing allowance")}
      </div>
      {data.housingLocationPeriods.map((period, index) => <fieldset key={index}><legend>Housing location {index + 1}</legend><div className="guided-form-grid">
        <Choice label={`Housing notice year ${index + 1}`} value={period.noticeTaxYear} options={[["2025", "2025 notice"], ["2026", "2026 notice"]]} onChange={noticeTaxYear => update({ housingLocationPeriods: data.housingLocationPeriods.map((row, n) => n === index ? { ...row, noticeTaxYear } : row) })} />
        <Choice label={`Housing notice location ${index + 1}`} value={period.locationId} options={[["default", "Location not listed in the selected notice"], ...(period.noticeTaxYear === "2025" || period.noticeTaxYear === "2026" ? FORM2555_HOUSING_LIMITS[Number(period.noticeTaxYear) as 2025 | 2026].map(entry => [entry.id, entry.id] as const) : []), ...(period.locationId && period.locationId !== "default" && !(period.noticeTaxYear === "2025" || period.noticeTaxYear === "2026" ? FORM2555_HOUSING_LIMITS[Number(period.noticeTaxYear) as 2025 | 2026] : []).some(entry => entry.id === period.locationId) ? [[period.locationId, `Saved source: ${period.locationId}`] as const] : [])]} onChange={locationId => update({ housingLocationPeriods: data.housingLocationPeriods.map((row, n) => n === index ? { ...row, locationId } : row) })} />
        <TextFact label={`Housing location qualifying days ${index + 1}`} value={period.days} onChange={days => update({ housingLocationPeriods: data.housingLocationPeriods.map((row, n) => n === index ? { ...row, days } : row) })} />
        <TextFact label={`Prior notice location for higher-year election ${index + 1}`} value={period.priorYearLocationId} onChange={priorYearLocationId => update({ housingLocationPeriods: data.housingLocationPeriods.map((row, n) => n === index ? { ...row, priorYearLocationId } : row) })} />
      </div><button type="button" onClick={() => update({ housingLocationPeriods: data.housingLocationPeriods.filter((_, n) => n !== index) })}>Remove housing location period {index + 1}</button></fieldset>)}
      <button type="button" onClick={() => update({ housingLocationPeriods: [...data.housingLocationPeriods, { locationId: "", days: "", noticeTaxYear: "", priorYearLocationId: "" }] })}>Add housing location period</button>
      <div className="guided-form-grid">{money("deductionsAllocableToExcludedIncome", "AGI deductions allocable to excluded foreign income")}{money("foreignEarnedIncomeTaxWorksheetDisallowedDeductions", "Itemized deductions disallowed for excluded foreign income")}{text("deductionWorksheetReference", "Actual allocable-deduction worksheet reference")}</div>
    </fieldset>
    <fieldset><legend>Actual prior-year sources</legend><p className="guided-hint">Enter known zero when no carryover or prior-service exclusion exists. Positive amounts require the immediately preceding year&apos;s completed worksheet. Income from prior services must already be included in the same original current-year source, and cannot be included in current Part IV again.</p>
      <div className="guided-form-grid">{money("priorYearHousingDeductionCarryover", "Actual prior housing carryover")}{text("priorYearHousingCarryoverTaxYear", "Prior housing carryover source year")}{text("priorYearHousingReference", "Prior housing worksheet reference")}{boolean("priorYearHousingCarryoverConfirmed", "Actual prior housing carryover checked")}
        {money("priorYearIncomeExclusion", "Actual prior-service income exclusion")}{text("priorYearIncomeExclusionTaxYear", "Prior service source year")}{money("priorYearUnusedExclusion", "Actual prior unused income exclusion")}{text("priorYearIncomeReference", "Prior-service exclusion statement reference")}
        {boolean("priorYearIncomeStatementConfirmed", "Actual prior-service exclusion statement checked")}{boolean("priorYearIncomeAlreadyReportedConfirmed", "Prior-service receipts are already in current gross income")}
      </div>
    </fieldset>
    {boolean("allSourcesIncluded", "All actual foreign-income sources are included")}{boolean("oneOwnerOnlyConfirmed", "This worksheet contains one taxpayer only")}{boolean("sourceFactsConfirmed", "Foreign sources checked after the last edit")}
    <button type="button" onClick={() => onChange(undefined)}>Remove foreign-income worksheet</button>
  </section>;
}
