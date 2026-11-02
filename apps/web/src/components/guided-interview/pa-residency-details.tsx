"use client";
import { useState } from "react";
import type { TaxYearInput } from "@/models/inputs";
import type { PAResidencySources } from "@/models/pa-residency";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";
import { confirmGuidedPAResidencySources, emptyGuidedPAResidencySources, updateGuidedPAResidencySources } from "@/lib/guided-pa-residency-facts";

type Period = { from: string; through: string };
function NumberFact({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" type="number" step="1" value={value === null ? "" : value} onChange={event => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label>;
}
function SelectFact({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Choose from actual records</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
function Abodes({ label, periods, onChange }: { label: string; periods: Period[]; onChange: (periods: Period[]) => void }) {
  return <fieldset><legend>{label}</legend>{periods.map((period, index) => <div className="guided-card" key={index}>
    <TextFact label={`${label} ${index + 1} first date`} type="date" value={period.from} onChange={from => onChange(periods.map((p, i) => i === index ? { ...p, from } : p))} />
    <TextFact label={`${label} ${index + 1} last date`} type="date" value={period.through} onChange={through => onChange(periods.map((p, i) => i === index ? { ...p, through } : p))} />
    <button type="button" onClick={() => onChange(periods.filter((_, i) => i !== index))}>Remove {label} {index + 1}</button>
  </div>)}<button type="button" onClick={() => onChange([...periods, { from: "", through: "" }])}>Add {label}</button></fieldset>;
}

/** Actual private source collector. This component does not select residency from a mailing address. */
export function PAResidencyDetails({ originalInput, data, onChange }: {
  originalInput: TaxYearInput | null; data?: PAResidencySources;
  onChange: (data: PAResidencySources | undefined) => void;
}) {
  const [message, setMessage] = useState("");
  if (!data) return <button type="button" onClick={() => onChange(emptyGuidedPAResidencySources())}>Add Pennsylvania residency sources</button>;
  const current = data;
  const update = (patch: Partial<PAResidencySources>) => { setMessage(""); onChange(updateGuidedPAResidencySources(current, patch)); };
  const residency = current.residency;
  const updateResidency = (patch: Partial<typeof residency>) => update({ residency: { ...residency, ...patch } });
  const updateWage = (index: number, patch: Partial<PAResidencySources["wages"][number]>) => update({ wages: current.wages.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const updateInterest = (index: number, patch: Partial<PAResidencySources["interest"][number]>) => update({ interest: current.interest.map((row, i) => i === index ? { ...row, ...patch } : row) });
  return <section aria-label="Actual Pennsylvania residency sources">
    <h3>Actual payroll and bank records</h3>
    <p className="guided-hint">Enter the actual domicile, permanent-home and presence records, plus the source payroll and bank credits. This ordinary source method covers one owner and current cash wages/personal bank interest. It does not establish credits, payments, penalties or a filing-ready return. Joint/separate spouse sources and other income need their corresponding methods.</p>
    <NumberFact label="PA source tax year" value={current.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
    <TextFact label="PA original source reference" value={current.sourceReference} onChange={sourceReference => update({ sourceReference })} />
    <SelectFact label="Actual owner of this PA return" value={current.owner.accountHolder} options={[["primary", "Primary taxpayer"], ["spouse", "Spouse — separate owner method required"]]} onChange={accountHolder => update({ owner: { ...current.owner, accountHolder: accountHolder as PAResidencySources["owner"]["accountHolder"] } })} />
    <SelectFact label="Residency status supported by actual records" value={residency.status} options={[["resident", "Full-year resident"], ["part_year", "Part-year resident"], ["nonresident", "Nonresident"]]} onChange={status => updateResidency({ status: status as typeof residency.status })} />
    <TextFact label="Domicile, permanent-home and presence source reference" value={residency.sourceReference} onChange={sourceReference => updateResidency({ sourceReference })} />
    <p className="guided-hint">Cover the whole year with actual domicile periods. Presence days alone do not decide residency. Include every permanent-home period, including homes maintained while away. Do not use a mailing address or an estimated day ratio to allocate money.</p>
    {residency.domicilePeriods.map((period, index) => <fieldset className="guided-card" key={index}><legend>Domicile period {index + 1}</legend>
      <TextFact label={`Domicile ${index + 1} first date`} type="date" value={period.from} onChange={from => updateResidency({ domicilePeriods: residency.domicilePeriods.map((p, i) => i === index ? { ...p, from } : p) })} />
      <TextFact label={`Domicile ${index + 1} last date`} type="date" value={period.through} onChange={through => updateResidency({ domicilePeriods: residency.domicilePeriods.map((p, i) => i === index ? { ...p, through } : p) })} />
      <TextFact label={`Domicile ${index + 1} actual state code`} value={period.state} onChange={state => updateResidency({ domicilePeriods: residency.domicilePeriods.map((p, i) => i === index ? { ...p, state } : p) })} />
      <NumberFact label={`Domicile ${index + 1} actual PA presence days`} value={period.daysInPA} onChange={daysInPA => updateResidency({ domicilePeriods: residency.domicilePeriods.map((p, i) => i === index ? { ...p, daysInPA } : p) })} />
      <button type="button" onClick={() => updateResidency({ domicilePeriods: residency.domicilePeriods.filter((_, i) => i !== index) })}>Remove domicile period {index + 1}</button>
    </fieldset>)}
    <button type="button" onClick={() => updateResidency({ domicilePeriods: [...residency.domicilePeriods, { from: "", through: "", state: "", daysInPA: null }] })}>Add actual domicile period</button>
    <Abodes label="PA permanent home" periods={residency.paPermanentAbodePeriods} onChange={paPermanentAbodePeriods => updateResidency({ paPermanentAbodePeriods })} />
    <Abodes label="Outside-PA permanent home" periods={residency.outsidePAPermanentAbodePeriods} onChange={outsidePAPermanentAbodePeriods => updateResidency({ outsidePAPermanentAbodePeriods })} />
    <BooleanFact label="All actual domicile, permanent-home and presence periods are included" value={residency.factsConfirmed} onChange={factsConfirmed => updateResidency({ factsConfirmed })} />
    <BooleanFact label="An actual move abandoned the old domicile and established the new domicile with physical presence" value={residency.moveAbandonmentNewDomicileAndPresenceConfirmed} onChange={moveAbandonmentNewDomicileAndPresenceConfirmed => updateResidency({ moveAbandonmentNewDomicileAndPresenceConfirmed })} />
    <TextFact label="Actual December 31 principal-residence state" value={residency.dec31PrincipalResidenceState} onChange={dec31PrincipalResidenceState => updateResidency({ dec31PrincipalResidenceState })} />
    <TextFact label="December 31 school district code (99999 only for actual outside-PA residence)" value={residency.schoolDistrictCode} onChange={schoolDistrictCode => updateResidency({ schoolDistrictCode })} />
    <TextFact label="Actual school district name or non-PA residence" value={residency.schoolDistrictName} onChange={schoolDistrictName => updateResidency({ schoolDistrictName })} />
    <h4>Actual W-2 payroll allocation sources</h4>
    <p className="guided-hint">Entered-source numbers refer to the actual nonblank W-2 records, not unused interview cards. Each original must be covered exactly once. Enter both PA and outside-PA amounts, including actual zero; do not subtract to invent an unrecorded amount.</p>
    {current.wages.map((row, index) => <fieldset className="guided-card" key={index}><legend>Payroll source {index + 1}</legend>
      <SelectFact label={`Payroll ${index + 1} entered W-2 original`} value={row.originalIndex === null ? "" : String(row.originalIndex)} options={(originalInput?.w2s ?? []).map((w2, i) => [String(i), `Entered W-2 ${i + 1}: ${w2.employer.name}, wages ${w2.wages}`])} onChange={v => updateWage(index, { originalIndex: v === "" ? null : Number(v) })} />
      <NumberFact label={`Payroll ${index + 1} original tax year`} value={row.sourceTaxYear} onChange={sourceTaxYear => updateWage(index, { sourceTaxYear })} />
      <TextFact label={`Payroll ${index + 1} original reference`} value={row.sourceReference} onChange={sourceReference => updateWage(index, { sourceReference })} />
      {([
        ["sourceFactsConfirmed", "Original facts checked"], ["ordinaryCashCompensationOnlyConfirmed", "Current-year ordinary cash services only"],
        ["noPAFederalCompensationDifferencesConfirmed", "Actual source establishes no PA/federal compensation differences"],
        ["currentUncorrectedNonvoidOriginalConfirmed", "Actual final original is uncorrected, nonvoid and not a duplicate"],
        ["allOriginalBoxesKnownConfirmed", "Every original box has been checked, including actual zero or blank boxes"],
      ] as const).map(([key, text]) => <BooleanFact key={key} label={`Payroll ${index + 1}: ${text}`} value={row[key]} onChange={value => updateWage(index, { [key]: value })} />)}
      {row.payroll.map((period, periodIndex) => {
        const change = (patch: Partial<typeof period>) => updateWage(index, { payroll: row.payroll.map((p, i) => i === periodIndex ? { ...p, ...patch } : p) });
        const prefix = `Payroll ${index + 1} segment ${periodIndex + 1}`;
        return <div className="guided-card" key={periodIndex}>
          <TextFact label={`${prefix} actual record reference`} value={period.sourceReference} onChange={sourceReference => change({ sourceReference })} />
          <TextFact label={`${prefix} actual paid date`} type="date" value={period.paidOn} onChange={paidOn => change({ paidOn })} />
          <TextFact label={`${prefix} service first date`} type="date" value={period.serviceFrom} onChange={serviceFrom => change({ serviceFrom })} />
          <TextFact label={`${prefix} service last date`} type="date" value={period.serviceThrough} onChange={serviceThrough => change({ serviceThrough })} />
          <CurrencyField label={`${prefix} actual gross`} value={period.grossCompensation} onChange={grossCompensation => change({ grossCompensation })} />
          <CurrencyField label={`${prefix} actual PA services gross`} value={period.paServicesCompensation} onChange={paServicesCompensation => change({ paServicesCompensation })} />
          <CurrencyField label={`${prefix} actual outside-PA services gross`} value={period.outsidePAServicesCompensation} onChange={outsidePAServicesCompensation => change({ outsidePAServicesCompensation })} />
          <button type="button" onClick={() => updateWage(index, { payroll: row.payroll.filter((_, i) => i !== periodIndex) })}>Remove {prefix}</button>
        </div>;
      })}
      <button type="button" onClick={() => updateWage(index, { payroll: [...row.payroll, { sourceReference: "", paidOn: "", serviceFrom: "", serviceThrough: "", grossCompensation: "", paServicesCompensation: "", outsidePAServicesCompensation: "" }] })}>Add actual payroll segment {index + 1}</button>
      <button type="button" onClick={() => update({ wages: current.wages.filter((_, i) => i !== index) })}>Remove payroll source {index + 1}</button>
    </fieldset>)}
    <button type="button" onClick={() => update({ wages: [...current.wages, { originalIndex: null, sourceTaxYear: null, sourceReference: "", sourceFactsConfirmed: null, ordinaryCashCompensationOnlyConfirmed: null, noPAFederalCompensationDifferencesConfirmed: null, currentUncorrectedNonvoidOriginalConfirmed: null, allOriginalBoxesKnownConfirmed: null, payroll: [] }] })}>Add actual W-2 source</button>
    <h4>Actual personal-bank interest credits</h4>
    {current.interest.map((row, index) => <fieldset className="guided-card" key={index}><legend>Bank source {index + 1}</legend>
      <SelectFact label={`Bank ${index + 1} entered original`} value={row.originalIndex === null ? "" : String(row.originalIndex)} options={(originalInput?.form1099Int ?? []).map((entry, i) => [String(i), `Entered 1099-INT ${i + 1}: ${entry.payer}, Box1 ${entry.interestIncome}`])} onChange={v => updateInterest(index, { originalIndex: v === "" ? null : Number(v) })} />
      <NumberFact label={`Bank ${index + 1} original tax year`} value={row.sourceTaxYear} onChange={sourceTaxYear => updateInterest(index, { sourceTaxYear })} />
      <TextFact label={`Bank ${index + 1} original reference`} value={row.sourceReference} onChange={sourceReference => updateInterest(index, { sourceReference })} />
      {([
        ["sourceFactsConfirmed", "Original facts checked"], ["ordinaryPersonalBankInterestConfirmed", "Actual ordinary personal bank interest, not business-source interest"],
        ["currentUncorrectedNonvoidOriginalConfirmed", "Actual final original is uncorrected, nonvoid and not a duplicate"],
        ["allOriginalBoxesKnownConfirmed", "Every original box has been checked, including actual zero or blank boxes"],
      ] as const).map(([key, text]) => <BooleanFact key={key} label={`Bank ${index + 1}: ${text}`} value={row[key]} onChange={value => updateInterest(index, { [key]: value })} />)}
      {row.credits.map((credit, creditIndex) => <div className="guided-card" key={creditIndex}>
        <TextFact label={`Bank ${index + 1} credit ${creditIndex + 1} record reference`} value={credit.sourceReference} onChange={sourceReference => updateInterest(index, { credits: row.credits.map((c, i) => i === creditIndex ? { ...c, sourceReference } : c) })} />
        <TextFact label={`Bank ${index + 1} credit ${creditIndex + 1} actual date`} type="date" value={credit.creditedOn} onChange={creditedOn => updateInterest(index, { credits: row.credits.map((c, i) => i === creditIndex ? { ...c, creditedOn } : c) })} />
        <CurrencyField label={`Bank ${index + 1} credit ${creditIndex + 1} actual amount`} value={credit.amount} onChange={amount => updateInterest(index, { credits: row.credits.map((c, i) => i === creditIndex ? { ...c, amount } : c) })} />
        <button type="button" onClick={() => updateInterest(index, { credits: row.credits.filter((_, i) => i !== creditIndex) })}>Remove bank {index + 1} credit {creditIndex + 1}</button>
      </div>)}
      <button type="button" onClick={() => updateInterest(index, { credits: [...row.credits, { creditedOn: "", amount: "", sourceReference: "" }] })}>Add actual bank credit {index + 1}</button>
      <button type="button" onClick={() => update({ interest: current.interest.filter((_, i) => i !== index) })}>Remove bank source {index + 1}</button>
    </fieldset>)}
    <button type="button" onClick={() => update({ interest: [...current.interest, { originalIndex: null, sourceTaxYear: null, sourceReference: "", sourceFactsConfirmed: null, ordinaryPersonalBankInterestConfirmed: null, currentUncorrectedNonvoidOriginalConfirmed: null, allOriginalBoxesKnownConfirmed: null, credits: [] }] })}>Add actual bank-interest source</button>
    <BooleanFact label="Actual records establish no other PA income classes in this ordinary source packet" value={current.otherPAIncomeClassesConfirmedNone} onChange={otherPAIncomeClassesConfirmedNone => update({ otherPAIncomeClassesConfirmedNone })} />
    <BooleanFact label="Actual records establish no other PA taxable-income adjustments in this source packet" value={current.otherPAAdjustmentsConfirmedNone} onChange={otherPAAdjustmentsConfirmedNone => update({ otherPAAdjustmentsConfirmedNone })} />
    <button type="button" onClick={() => {
      try {
        if (!originalInput) throw new Error("Complete actual original taxpayer and income sources before confirming PA records");
        onChange(confirmGuidedPAResidencySources(originalInput, current)); setMessage("Actual source records confirmed after the last edit.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Complete the actual source records before confirmation."); }
    }}>Confirm all actual PA source records after the last edit</button>
    <p role="status">{message || (current.sourceFactsConfirmed === true ? "Original records retained; any source edit requires reconfirmation." : "Actual source confirmation is still required.")}</p>
    <button type="button" onClick={() => onChange(undefined)}>Remove Pennsylvania residency sources</button>
  </section>;
}
