"use client";

import type { RetirementEntryData } from "@/lib/guided-interview-flow";
import { retirementSourceAmounts } from "@/lib/guided-retirement-facts";
import { CurrencyField } from "./currency-field";

function Fact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={event => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}
function Text({ label, value, onChange }: { label: string; value: string | undefined; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" value={value ?? ""} onChange={event => onChange(event.target.value)} /></label>;
}

export function RetirementSourceFields({ entry, onUpdate, basisMode = false }: { entry: RetirementEntryData; onUpdate: <K extends keyof RetirementEntryData>(field: K, value: RetirementEntryData[K]) => void; basisMode?: boolean }) {
  return <>
    <Text label="Retirement statement tax year" value={entry.sourceTaxYear} onChange={value => onUpdate("sourceTaxYear", value)} />
    <Text label="Payer TIN shown on the retirement form" value={entry.payerTin} onChange={value => onUpdate("payerTin", value)} />
    <Text label="Retirement account reference (last four digits or local statement label)" value={entry.accountReference} onChange={value => onUpdate("accountReference", value)} />
    <label className="guided-field"><span className="guided-field-label">Actual retirement distribution recipient</span><select className="guided-input" value={entry.accountHolder ?? ""} onChange={event => onUpdate("accountHolder", event.target.value as RetirementEntryData["accountHolder"])}><option value="">Choose actual recipient</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse</option></select></label>
    <Fact label={`IRA / SEP / SIMPLE checkbox (${entry.sourceTaxYear === "2026" ? "Box 7b" : "Box 7"})`} value={entry.requiresIraConfirmation ? null : entry.isIraSepSimple} onChange={value => onUpdate("isIraSepSimple", value)} />
    <Fact label="Is taxable amount not determined checked in Box 2b?" value={entry.taxableAmountNotDetermined} onChange={value => onUpdate("taxableAmountNotDetermined", value)} />
    {!basisMode && <Fact label="Have you established the actual taxable amount from the source and applicable basis records?" value={entry.taxableAmountConfirmed} onChange={value => onUpdate("taxableAmountConfirmed", value)} />}
    {retirementSourceAmounts.map(([field, label]) => <CurrencyField key={field} label={label} value={entry[field] ?? ""} onChange={value => onUpdate(field, value)} required />)}
    {!basisMode && entry.isIraSepSimple === true && <Fact label="Do actual owner records establish zero nondeductible IRA basis?" value={entry.iraBasisConfirmedZero} onChange={value => onUpdate("iraBasisConfirmedZero", value)} />}
    <Fact label="Is this an eligible governmental section 457(b) distribution?" value={entry.eligibleGovernmental457bPlan} onChange={value => onUpdate("eligibleGovernmental457bPlan", value)} />
    {entry.eligibleGovernmental457bPlan === true && <CurrencyField label="457(b) taxable amount attributable to transferred qualified-plan funds" value={entry.governmental457bTransferredTaxableAmount ?? ""} onChange={value => onUpdate("governmental457bTransferredTaxableAmount", value)} required />}
    <Fact label="Is this a U.S. military pension or survivor benefit?" value={entry.militaryPensionOrSurvivorBenefit} onChange={value => onUpdate("militaryPensionOrSurvivorBenefit", value)} />
    <Fact label="Is this a qualified joint-and-survivor annuity benefit?" value={entry.qualifiedJointSurvivorAnnuity} onChange={value => onUpdate("qualifiedJointSurvivorAnnuity", value)} />
    {["G", "H"].includes(entry.distributionCode.trim().toUpperCase()) && <Fact label="Do actual records confirm the completed direct rollover and its destination?" value={entry.directRolloverConfirmed} onChange={value => onUpdate("directRolloverConfirmed", value)} />}
    {entry.sourceTaxYear === "2026" && <>
      <Fact label="Is the Trump account checkbox in Box 7c checked?" value={entry.trumpAccount} onChange={value => onUpdate("trumpAccount", value)} />
      <CurrencyField label="Earnings on excess contributions (Box 7d)" value={entry.excessContributionEarnings ?? ""} onChange={value => onUpdate("excessContributionEarnings", value)} required />
    </>}
    <label className="guided-field"><span className="guided-field-label">Actual state reporting on this retirement form</span><select className="guided-input" value={entry.stateTaxReporting ?? ""} onChange={event => onUpdate("stateTaxReporting", event.target.value as RetirementEntryData["stateTaxReporting"])}><option value="">Confirm source reporting</option><option value="none">No state section reported</option><option value="single">One state reported</option><option value="multiple">Multiple states reported</option></select></label>
    {entry.stateTaxReporting === "single" && <>
      <Text label="Retirement source state (two-letter code)" value={entry.state} onChange={value => onUpdate("state", value)} />
      <CurrencyField label="Retirement state tax withheld (Box 14)" value={entry.stateWithheld ?? ""} onChange={value => onUpdate("stateWithheld", value)} required />
      <CurrencyField label="Retirement state distribution (Box 16)" value={entry.stateDistribution ?? ""} onChange={value => onUpdate("stateDistribution", value)} required />
    </>}
    <label className="guided-field"><span className="guided-field-label">Actual local reporting on this retirement form</span><select className="guided-input" value={entry.localTaxReporting ?? ""} onChange={event => onUpdate("localTaxReporting", event.target.value as RetirementEntryData["localTaxReporting"])}><option value="">Confirm source reporting</option><option value="none">No local section reported</option><option value="single">One locality reported</option><option value="multiple">Multiple localities reported</option></select></label>
    {entry.localTaxReporting === "single" && <>
      <Text label="Retirement source locality (Box 18)" value={entry.locality} onChange={value => onUpdate("locality", value)} />
      <CurrencyField label="Retirement local tax withheld (Box 17)" value={entry.localTaxWithheld ?? ""} onChange={value => onUpdate("localTaxWithheld", value)} required />
      <CurrencyField label="Retirement local distribution (Box 19)" value={entry.localDistribution ?? ""} onChange={value => onUpdate("localDistribution", value)} required />
    </>}
    {basisMode ? <Fact label="Is another retirement method beyond the ordinary IRA basis records needed?" value={entry.otherRetirementWorksheetRequired} onChange={value => onUpdate("otherRetirementWorksheetRequired", value)} /> : <Fact label="Are basis, Roth or conversion, QCD, contribution-return, disaster, penalty-exception or other additional retirement worksheets needed?" value={entry.additionalWorksheetRequired} onChange={value => onUpdate("additionalWorksheetRequired", value)} />}
    <Fact label="Have you checked all retirement source and taxability facts after the last edit?" value={entry.sourceFactsConfirmed} onChange={value => onUpdate("sourceFactsConfirmed", value)} />
    <p className="guided-hint">Keep unknown amounts blank. Enter zero only when the source or completed worksheet establishes zero. Special distributions and unresolved basis, rollover or multi-state allocations stay saved for review until their source worksheets are supported.</p>
  </>;
}
