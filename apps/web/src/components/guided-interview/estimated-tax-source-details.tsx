"use client";

import { ANNUALIZED_PERIOD_FIELDS, emptyAnnualizedPeriods, emptyEstimatedTaxFacts, type EstimatedTaxFactsData } from "@/lib/guided-estimated-tax-facts";
import type { EstimatedPaymentEntry, PaymentData } from "@/lib/guided-interview-flow";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";
function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{value && !choices.some(([id]) => id === value) && <option value={value}>Saved source needs reconciliation</option>}{choices.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}
export function EstimatedTaxSourceDetails({ data, appliedCredits = [], taxYear, onChange }: {
  data?: EstimatedTaxFactsData; appliedCredits?: PaymentData["priorYearAppliedCredits"]; taxYear?: number | null; onChange: (data: EstimatedTaxFactsData | undefined) => void;
}) {
  if (!data) return <section><h4>Estimated-tax penalty history</h4><p className="guided-hint">Prior-year tax and actual payment timing can change an underpayment penalty. Add the source worksheet when those facts are needed; estimated payments entered above remain separate.</p><button type="button" onClick={() => onChange(structuredClone(emptyEstimatedTaxFacts))}>Add estimated-tax worksheet</button></section>;
  const update = (patch: Partial<EstimatedTaxFactsData>) => onChange({ ...data, ...patch, ...(Object.keys(patch).every(key => key === "sourceFactsConfirmed") ? {} : { sourceFactsConfirmed: null }) });
  const dateRows = (key: "withholdingPayments" | "returnPayments", title: string) => <fieldset><legend>{title}</legend>{data[key].map((payment, index) => {
    const prefix = `${title} ${index + 1}`;
    const set = (patch: Partial<EstimatedPaymentEntry>) => update({ [key]: data[key].map((row, i) => i === index ? { ...row, ...patch } : row) });
    return <div key={index} className="guided-form-grid"><TextFact label={`${prefix}: Actual date`} type="date" value={payment.date} onChange={date => set({ date })} /><CurrencyField label={`${prefix}: Amount`} value={payment.amount} onChange={amount => set({ amount })} required /><button type="button" onClick={() => update({ [key]: data[key].filter((_, i) => i !== index) })}>{prefix}: Remove</button></div>;
  })}<button type="button" onClick={() => update({ [key]: [...data[key], { date: "", amount: "" }] })}>Add {title.toLowerCase()}</button></fieldset>;
  return <section>
    <h4>Estimated-tax penalty history</h4>
    <p className="guided-hint">Use the actual prior return and IRS payment records. The return calculates current-year tax and withholding. Amounts already entered as estimated or extension payments must not be entered again here. See the <a href="https://www.irs.gov/instructions/i2210" target="_blank" rel="noreferrer">Form 2210 instructions</a> for the prior-tax computation and filing-status allocation.</p>
    <div className="guided-form-grid">
      <TextFact label="Estimated-tax source year" value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label="Estimated-tax source reference" value={data.sourceReference} onChange={sourceReference => update({ sourceReference })} />
      <BooleanFact label="Calendar-year taxpayer" value={data.calendarYearTaxpayer} onChange={calendarYearTaxpayer => update({ calendarYearTaxpayer })} />
      <BooleanFact label="U.S. resident return" value={data.residentReturn} onChange={residentReturn => update({ residentReturn })} />
      <BooleanFact label="Farmer or fisher estimated-tax special rule applies" value={data.farmerOrFisher} onChange={farmerOrFisher => update({ farmerOrFisher })} />
      <BooleanFact label="Disaster relief applies to these payments" value={data.disasterReliefClaimed} onChange={disasterReliefClaimed => update({ disasterReliefClaimed })} />
      <BooleanFact label="A penalty waiver is requested" value={data.waiverRequested} onChange={waiverRequested => update({ waiverRequested })} />
      <Choice label="Estimated-tax calculation method" value={data.calculationMethod} choices={[["regular", "Regular installments"], ["annualized", "Annualized income (Schedule AI)"]]} onChange={calculationMethod => update({ calculationMethod: calculationMethod as EstimatedTaxFactsData["calculationMethod"] })} />
      <Choice label="Withholding timing method" value={data.withholdingMethod} choices={[["equal-installments", "Statutory equal installments"], ["actual-dates", "Elect actual withholding dates"]]} onChange={withholdingMethod => update({ withholdingMethod: withholdingMethod as EstimatedTaxFactsData["withholdingMethod"] })} />
    </div>
    {data.calculationMethod === "annualized" && <AnnualizedPeriods data={data} update={update} />}
    <fieldset><legend>Actual prior-year history</legend><div className="guided-form-grid">
      <Choice label="Prior-year return and tax status" value={data.priorYearTaxStatus} choices={[["return-filed", "A return was filed"], ["no-return", "No prior return for the tax comparison"], ["no-tax-liability", "No prior-year tax liability"]]} onChange={priorYearTaxStatus => update({ priorYearTaxStatus: priorYearTaxStatus as EstimatedTaxFactsData["priorYearTaxStatus"] })} />
      <BooleanFact label="Prior return covered a full 12 months" value={data.priorYearFullYear} onChange={priorYearFullYear => update({ priorYearFullYear })} />
      <BooleanFact label="Prior return was joint" value={data.priorYearJointReturn} onChange={priorYearJointReturn => update({ priorYearJointReturn })} />
      <BooleanFact label="U.S. citizen or resident throughout the prior year" value={data.priorYearResidentAllYear} onChange={priorYearResidentAllYear => update({ priorYearResidentAllYear })} />
      <CurrencyField label="Actual prior-year tax before the 110% multiplier" hint="Compute prior-year tax under the Form 2210 line 8 instructions, including any required joint/separate allocation. Enter the amount before the high-income 110% multiplier; the return applies that multiplier once. Do not copy the already-multiplied line 8 amount." value={data.priorYearTaxForForm2210} onChange={priorYearTaxForForm2210 => update({ priorYearTaxForForm2210 })} />
      <CurrencyField label="Actual prior-year AGI" allowNegative value={data.priorYearAgiForForm2210} onChange={priorYearAgiForForm2210 => update({ priorYearAgiForForm2210 })} />
      <BooleanFact label="Prior-year tax computation and filing-status allocation checked" value={data.priorYearTaxComputationConfirmed} onChange={priorYearTaxComputationConfirmed => update({ priorYearTaxComputationConfirmed })} />
    </div></fieldset>
    {(data.withholdingMethod === "actual-dates" || data.withholdingPayments.length > 0) && <><p className="guided-hint">Enter every actual withholding date and amount used in this election, including any separately applicable excess Social Security credit. The calculated return reconciles this total to its withholding sources.</p>{dateRows("withholdingPayments", "Withholding payment")}</>}
    <fieldset><legend>Applied-refund effective dates</legend><p className="guided-hint">Link the prior-year refund entered above. Its IRS-effective payment date can differ from its return year. Split records only when the source establishes separate effective amounts; they must add to the original credit.</p>
      {data.priorYearCreditPayments.map((payment, index) => {
        const prefix = `Applied-credit history ${index + 1}`;
        const set = (patch: Partial<typeof payment>) => update({ priorYearCreditPayments: data.priorYearCreditPayments.map((row, i) => i === index ? { ...row, ...patch } : row) });
        return <div className="guided-form-grid" key={index}><Choice label={`${prefix}: Original applied refund`} value={payment.appliedCreditIndex} choices={(appliedCredits ?? []).map((credit, i) => [String(i), `Refund ${i + 1}: source year ${credit.sourceTaxYear || "unknown"}, amount ${credit.amount || "unknown"}`])} onChange={appliedCreditIndex => set({ appliedCreditIndex })} /><TextFact label={`${prefix}: IRS-effective date`} type="date" value={payment.date} onChange={date => set({ date })} /><CurrencyField label={`${prefix}: Amount`} value={payment.amount} onChange={amount => set({ amount })} required /><button type="button" onClick={() => update({ priorYearCreditPayments: data.priorYearCreditPayments.filter((_, i) => i !== index) })}>{prefix}: Remove</button></div>;
      })}<button type="button" onClick={() => update({ priorYearCreditPayments: [...data.priorYearCreditPayments, { appliedCreditIndex: "", date: "", amount: "" }] })}>Add applied-credit effective payment</button>
    </fieldset>
    {dateRows("returnPayments", "Return payment")}
    <div className="guided-form-grid">
      <p className="guided-hint">{taxYear === 2025 ? "For 2025, the early-return deadline is February 2, 2026." : taxYear === 2026 ? "For 2026, the early-return deadline is February 1, 2027." : "Use the applicable early-return deadline."} Actual records must establish filing and full payment. Do not assume a future event.</p>
      <BooleanFact label="Filed and paid in full by the early-return exception deadline" value={data.earlyReturnExceptionClaimed} onChange={earlyReturnExceptionClaimed => update({ earlyReturnExceptionClaimed })} />
      <TextFact label="Actual return filing date" type="date" value={data.returnFiledDate} onChange={returnFiledDate => update({ returnFiledDate })} />
      <TextFact label="Actual return paid-in-full date" type="date" value={data.returnPaidInFullDate} onChange={returnPaidInFullDate => update({ returnPaidInFullDate })} />
      <BooleanFact label="All payment records and applicable history are included" value={data.allPaymentRecordsIncluded} onChange={allPaymentRecordsIncluded => update({ allPaymentRecordsIncluded })} />
      <BooleanFact label="Estimated-tax sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    </div>
    <button type="button" onClick={() => onChange(undefined)}>Remove estimated-tax worksheet</button>
  </section>;
}

const ANNUALIZED_LABELS = ["January 1 to March 31", "January 1 to May 31", "January 1 to August 31", "January 1 to December 31"];
function AnnualizedPeriods({ data, update }: { data: EstimatedTaxFactsData; update: (patch: Partial<EstimatedTaxFactsData>) => void }) {
  const periods = data.annualizedIncomePeriods ?? emptyAnnualizedPeriods();
  return <fieldset style={{ minWidth: 0 }}><legend>Schedule AI cumulative income by period</legend>
    <p className="guided-hint">Enter income, deductions and wages as actual totals from January 1 through each period end, including 0 where that is the amount. Figure lines 9, 16 and 18 as the Schedule AI instructions describe, because some of those amounts are annualized first. The full-year column must match your return. Returns with qualified dividends or net capital gain cannot be calculated here. Use the same Schedule AI method for all four dates.</p>
    <BooleanFact label="Both spouses had self-employment earnings" value={data.bothSpousesSelfEmployed ?? null} onChange={bothSpousesSelfEmployed => update({ bothSpousesSelfEmployed })} />
    {periods.map((period, index) => <fieldset key={ANNUALIZED_LABELS[index]} style={{ minWidth: 0 }}><legend>{ANNUALIZED_LABELS[index]}</legend><div className="guided-form-grid">
      {ANNUALIZED_PERIOD_FIELDS.map(([key, label, signed]) => <CurrencyField key={key} label={`Period ${index + 1}: ${label}`} allowNegative={signed} value={period[key]}
        onChange={value => update({ annualizedIncomePeriods: periods.map((row, at) => at === index ? { ...row, [key]: value } : row) })} />)}
    </div></fieldset>)}
  </fieldset>;
}
