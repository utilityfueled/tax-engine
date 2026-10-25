"use client";

import { emptyMinimumTaxCredit, minimumTaxCreditAmounts, type MinimumTaxCreditData } from "@/lib/guided-minimum-tax-credit";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

const amountLabels: Record<typeof minimumTaxCreditAmounts[number], string> = {
  priorYearForm6251Line1And2e: "Prior Form 6251 income line plus line 2e",
  priorYearExclusionItemAdjustments: "Prior exclusion-item adjustments",
  priorYearMinimumTaxCreditNOLDeduction: "Minimum-tax-credit NOL deduction",
  priorYearMinimumTaxForeignTaxCredit: "Minimum tax foreign credit on exclusion items",
  priorYearForm6251Line10: "Prior Form 6251 line 10",
  priorYearAMT: "Prior Form 6251 line 11 AMT",
  unusedMinimumTaxCreditCarryforward: "Prior Form 8801 line 26 carryforward",
  priorYearUnallowedQualifiedElectricVehicleCredit: "Unallowed pre-2009 qualified electric vehicle credit",
};
export function MinimumTaxCreditDetails({ data, onChange }: { data?: MinimumTaxCreditData; onChange: (data: MinimumTaxCreditData | undefined) => void }) {
  if (!data) return <section><h3>Credit for prior-year minimum tax</h3><p className="guided-hint">Use actual prior Form 6251 and Form 8801 worksheets when a minimum-tax credit or carryforward applies.</p><button type="button" onClick={() => onChange(structuredClone(emptyMinimumTaxCredit))}>Add prior minimum-tax worksheet</button></section>;
  const update = (patch: Partial<MinimumTaxCreditData>) => onChange({ ...data, ...patch, ...(Object.keys(patch).every(key => key === "sourceFactsConfirmed") ? {} : { sourceFactsConfirmed: null }) });
  const showCapital = data.priorYearCapitalGainsRequired === true || Object.values(data.capitalGainsWorksheet).some(value => value.trim());
  const showForeign = data.priorYearFiledForm2555 === true || data.foreignEarnedIncome.form2555Lines45And50.trim() || data.foreignEarnedIncome.disallowedDeductions.trim() || typeof data.foreignEarnedIncome.capitalGainAdjustmentsConfirmed === "boolean";
  return <section>
    <h3>Credit for prior-year minimum tax</h3>
    <p className="guided-hint">Enter the original sources from the <a href="https://www.irs.gov/instructions/i8801" target="_blank" rel="noreferrer">Form 8801 instructions</a>. The return calculates current-year tax, the allowed credit and the next carryforward. Prior AMT alone does not establish a credit: exclusion items and earlier carryforwards also matter.</p>
    <div className="guided-form-grid">
      <TextFact label="Form 8801 worksheet year" value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label="Actual prior-return source year" value={data.priorYear} onChange={priorYear => update({ priorYear })} />
      <TextFact label="Prior minimum-tax source reference" value={data.sourceReference} onChange={sourceReference => update({ sourceReference })} />
      <label className="guided-field"><span className="guided-field-label">Prior minimum-tax filing status</span><select className="guided-input" value={data.priorYearFilingStatus} onChange={event => update({ priorYearFilingStatus: event.target.value as MinimumTaxCreditData["priorYearFilingStatus"] })}>
        <option value="">Confirm from prior return</option><option value="single">Single</option><option value="mfj">Married filing jointly</option><option value="mfs">Married filing separately</option><option value="hoh">Head of household</option><option value="qss">Qualifying surviving spouse</option>
      </select></label>
      <TextFact label="Taxpayer name on prior sources" value={data.primaryName} onChange={primaryName => update({ primaryName })} />
      <TextFact label="Taxpayer prior-source tax ID last four" value={data.primaryTaxIdLast4} onChange={primaryTaxIdLast4 => update({ primaryTaxIdLast4 })} />
      {(data.priorYearFilingStatus === "mfj" || data.spouseName || data.spouseTaxIdLast4) && <>
        <TextFact label="Spouse name on prior sources" value={data.spouseName} onChange={spouseName => update({ spouseName })} />
        <TextFact label="Spouse prior-source tax ID last four" value={data.spouseTaxIdLast4} onChange={spouseTaxIdLast4 => update({ spouseTaxIdLast4 })} />
      </>}
      <BooleanFact label="These prior sources belong to the same taxpayer or joint taxpayers as this return" value={data.sameTaxpayersAsPriorYear} onChange={sameTaxpayersAsPriorYear => update({ sameTaxpayersAsPriorYear })} />
    </div>
    <p className="guided-hint">A changed joint membership, combining separate prior returns, or dividing a prior joint credit needs a separate allocation method. Preserve the original sources; do not enter an assumed half share.</p>
    <fieldset><legend>Actual prior-year worksheet amounts</legend>
      <p className="guided-hint">Use prior Form 6251 line 1 for 2024 or line 1b for 2025, plus line 2e. Exclusion adjustments are the completed Form 8801 line 2 source computation, including applicable standard deduction and other exclusion items. NOL and foreign-credit amounts must come from their exclusion-only worksheets. Enter zero only when the original source establishes zero.</p>
      <div className="guided-form-grid">{minimumTaxCreditAmounts.map(key => <CurrencyField key={key} label={amountLabels[key]} required value={data[key]} allowNegative={key === "priorYearForm6251Line1And2e" || key === "priorYearExclusionItemAdjustments"} onChange={value => update({ [key]: value })} />)}</div>
    </fieldset>
    <BooleanFact label="Prior Form 1040-NR applies" value={data.priorYearFiledForm1040NR} onChange={priorYearFiledForm1040NR => update({ priorYearFiledForm1040NR })} />
    {(data.priorYearFiledForm1040NR === true || data.priorYearNetUSRealPropertyGain.trim()) && <CurrencyField label="Prior net U.S. real-property gain" value={data.priorYearNetUSRealPropertyGain} onChange={priorYearNetUSRealPropertyGain => update({ priorYearNetUSRealPropertyGain })} required />}
    <BooleanFact label="Prior capital-gain worksheet is required" value={data.priorYearCapitalGainsRequired} onChange={priorYearCapitalGainsRequired => update({ priorYearCapitalGainsRequired })} />
    {showCapital && <fieldset><legend>Actual prior capital-gain worksheet</legend>
      <label className="guided-field"><span className="guided-field-label">Prior capital worksheet method</span><select className="guided-input" value={data.capitalGainsWorksheet.method} onChange={event => update({ capitalGainsWorksheet: { ...data.capitalGainsWorksheet, method: event.target.value as MinimumTaxCreditData["capitalGainsWorksheet"]["method"] } })}><option value="">Select actual worksheet</option><option value="qualified_dividends">Qualified Dividends and Capital Gain Tax Worksheet</option><option value="schedule_d">Schedule D Tax Worksheet</option></select></label>
      <p className="guided-hint">Use the prior worksheet as adjusted under Form 8801 Part III, including applicable AMT capital-gain changes. Preferential income is QD/CG line 4 or Schedule D worksheet line 13. Ordinary sources are QD/CG line 5 for both fields, or Schedule D worksheet lines 14 and 21 respectively.</p>
      <div className="guided-form-grid">{([
        ["preferentialIncome", "Prior worksheet preferential income"], ["ordinaryIncomeForZeroRate", "Prior ordinary income for zero rate"],
        ["ordinaryIncomeForFifteenRate", "Prior ordinary income for fifteen-percent rate"], ["section1250Gain", "Prior Schedule D section 1250 gain"],
        ["scheduleDTaxWorksheetLine10", "Prior Schedule D Tax Worksheet line 10"],
      ] as const).filter(([key]) => data.capitalGainsWorksheet.method === "schedule_d" || !["section1250Gain", "scheduleDTaxWorksheetLine10"].includes(key) || data.capitalGainsWorksheet[key].trim()).map(([key, label]) => <CurrencyField key={key} label={label} value={data.capitalGainsWorksheet[key]} onChange={value => update({ capitalGainsWorksheet: { ...data.capitalGainsWorksheet, [key]: value } })} required />)}</div>
      <button type="button" onClick={() => update({ capitalGainsWorksheet: structuredClone(emptyMinimumTaxCredit.capitalGainsWorksheet) })}>Clear prior capital worksheet details</button>
    </fieldset>}
    <BooleanFact label="Prior Form 2555 exclusion or housing deduction applies" value={data.priorYearFiledForm2555} onChange={priorYearFiledForm2555 => update({ priorYearFiledForm2555 })} />
    {showForeign && <fieldset><legend>Prior foreign earned income worksheet</legend>
      <CurrencyField label="Prior Form 2555 lines 45 and 50" value={data.foreignEarnedIncome.form2555Lines45And50} required onChange={form2555Lines45And50 => update({ foreignEarnedIncome: { ...data.foreignEarnedIncome, form2555Lines45And50 } })} />
      <CurrencyField label="Prior deductions or exclusion items disallowed for excluded foreign income" value={data.foreignEarnedIncome.disallowedDeductions} required onChange={disallowedDeductions => update({ foreignEarnedIncome: { ...data.foreignEarnedIncome, disallowedDeductions } })} />
      <BooleanFact label="Foreign-income capital-gain worksheet adjustments checked" value={data.foreignEarnedIncome.capitalGainAdjustmentsConfirmed} onChange={capitalGainAdjustmentsConfirmed => update({ foreignEarnedIncome: { ...data.foreignEarnedIncome, capitalGainAdjustmentsConfirmed } })} />
      <button type="button" onClick={() => update({ foreignEarnedIncome: structuredClone(emptyMinimumTaxCredit.foreignEarnedIncome) })}>Clear prior foreign worksheet details</button>
    </fieldset>}
    <BooleanFact label="All applicable prior minimum-tax sources are included" value={data.allSourcesIncluded} onChange={allSourcesIncluded => update({ allSourcesIncluded })} />
    <BooleanFact label="Minimum-tax-credit sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    <button type="button" onClick={() => onChange(undefined)}>Remove prior minimum-tax worksheet</button>
  </section>;
}
