"use client";

import type { RetirementEntryData } from "@/lib/guided-interview-flow";
import { guidedCode1IraAgeFacts, hasStartedGuidedCode1IraAgeSource, retirementSourceAmounts } from "@/lib/guided-retirement-facts";
import { isGuidedQcdStatement, isGuidedQualifiedLumpSum, needsGuidedSimplifiedMethod, retirementQcdAmounts, retirementQcdConfirmations, retirementQcdTextFields, type GuidedRetirementSimplifiedMethod } from "@/lib/guided-retirement-source-inputs";
import { CurrencyField } from "./currency-field";

function Fact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={event => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}
function Text({ label, value, onChange, type = "text" }: { label: string; value: string | undefined; onChange: (value: string) => void; type?: "text" | "date" }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" type={type} value={value ?? ""} onChange={event => onChange(event.target.value)} /></label>;
}

export function RetirementSourceFields({ entry, onUpdate, basisMode = false, code1IraOwnerBirthDate }: { entry: RetirementEntryData; onUpdate: <K extends keyof RetirementEntryData>(field: K, value: RetirementEntryData[K]) => void; basisMode?: boolean; code1IraOwnerBirthDate?: string }) {
  const qcdStatement = isGuidedQcdStatement(entry);
  const ordinaryQcdEligibleCode = entry.sourceTaxYear === "2026" && entry.isIraSepSimple === true && entry.distributionCode.trim() === "7";
  const qcd = entry.qcdSource;
  const needsSimplifiedMethod = needsGuidedSimplifiedMethod(entry);
  const ageFacts = guidedCode1IraAgeFacts(entry, code1IraOwnerBirthDate);
  const ageSource = entry.code1IraAgeSource;
  const worksheet = entry.simplifiedMethod;
  const worksheetYear = entry.sourceTaxYear === "2025" || entry.sourceTaxYear === "2026" ? Number(entry.sourceTaxYear) : undefined;
  const updateWorksheet = (change: Partial<GuidedRetirementSimplifiedMethod>) => onUpdate("simplifiedMethod", { ...worksheet, ...change });
  return <>
    <Text label="Retirement statement tax year" value={entry.sourceTaxYear} onChange={value => onUpdate("sourceTaxYear", value)} />
    <Text label="Payer TIN shown on the retirement form" value={entry.payerTin} onChange={value => onUpdate("payerTin", value)} />
    <Text label="Retirement account reference (last four digits or local statement label)" value={entry.accountReference} onChange={value => onUpdate("accountReference", value)} />
    <label className="guided-field"><span className="guided-field-label">Actual retirement distribution recipient</span><select className="guided-input" value={entry.accountHolder ?? ""} onChange={event => onUpdate("accountHolder", event.target.value as RetirementEntryData["accountHolder"])}><option value="">Choose actual recipient</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse</option></select></label>
    <Fact label={`IRA / SEP / SIMPLE checkbox (${entry.sourceTaxYear === "2026" ? "Box 7b" : "Box 7"})`} value={entry.requiresIraConfirmation ? null : entry.isIraSepSimple} onChange={value => onUpdate("isIraSepSimple", value)} />
    {isGuidedQualifiedLumpSum(entry) && entry.isIraSepSimple === false && <label className="guided-field">
      <span className="guided-field-label">Qualified lump-sum reporting method</span>
      <select className="guided-input" value={entry.qualifiedLumpSumReporting ?? ""} onChange={event => {
        const value = event.target.value;
        onUpdate("qualifiedLumpSumReporting", value === "ordinary_pension" || value === "form_4972" ? value : null);
      }}>
        <option value="">Choose actual reporting method</option>
        <option value="ordinary_pension">Ordinary pension reporting on Form 1040</option>
        <option value="form_4972">Special tax election on Form 4972</option>
      </select>
    </label>}
    <Fact label="Is taxable amount not determined checked in Box 2b?" value={entry.taxableAmountNotDetermined} onChange={value => onUpdate("taxableAmountNotDetermined", value)} />
    {!basisMode && !qcdStatement && !needsSimplifiedMethod && <Fact label="Have you established the actual taxable amount from the source and applicable basis records?" value={entry.taxableAmountConfirmed} onChange={value => onUpdate("taxableAmountConfirmed", value)} />}
    {retirementSourceAmounts.map(([field, label]) => <CurrencyField key={field} label={label} value={entry[field] ?? ""} onChange={value => onUpdate(field, value)} required />)}
    {!basisMode && entry.isIraSepSimple === true && <Fact label="Do actual owner records establish zero nondeductible IRA basis?" value={entry.iraBasisConfirmedZero} onChange={value => onUpdate("iraBasisConfirmedZero", value)} />}
    {ageFacts && <>
      <Fact label="Does Box 1 report one payment with no other distributions?" value={ageSource?.singlePaymentConfirmed}
        onChange={value => onUpdate("code1IraAgeSource", { singlePaymentConfirmed: value, ownerBirthDate: value === true ? code1IraOwnerBirthDate : undefined })} />
      {ageSource?.singlePaymentConfirmed === true && <Text label="Date the IRA payment was received" type="date"
        value={ageSource.distributionDate} onChange={distributionDate => onUpdate("code1IraAgeSource", { ...ageSource, distributionDate })} />}
    </>}
    {!ageFacts && hasStartedGuidedCode1IraAgeSource(entry) && <>
      <p className="guided-hint">Reconcile the saved Code 1 IRA receipt date with the current statement and return before calculating.</p>
      <button type="button" className="utility-button utility-button-small" onClick={() => onUpdate("code1IraAgeSource", undefined)}>Remove saved IRA receipt date</button>
    </>}
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
    {(qcdStatement || qcd !== undefined) && <fieldset className="guided-form-grid">
      <legend>Qualified charitable distribution worksheet</legend>
      {retirementQcdTextFields.map(([field, label]) => <Text key={field} label={label} value={qcd?.[field]} onChange={value => onUpdate("qcdSource", { ...qcd, [field]: value })} />)}
      <Text label="Actual IRA trustee transfer date" type="date" value={qcd?.distributionDate} onChange={value => onUpdate("qcdSource", { ...qcd, distributionDate: value })} />
      {retirementQcdAmounts.map(([field, label]) => <CurrencyField key={field} label={label} value={qcd?.[field] ?? ""} onChange={value => onUpdate("qcdSource", { ...qcd, [field]: value })} required />)}
      {retirementQcdConfirmations.map(([field, label]) => <Fact key={field} label={label} value={qcd?.[field]} onChange={value => onUpdate("qcdSource", { ...qcd, [field]: value })} />)}
      {qcd && <button type="button" className="utility-button utility-button-small" onClick={() => onUpdate("qcdSource", undefined)}>Remove QCD worksheet</button>}
    </fieldset>}
    {ordinaryQcdEligibleCode && !qcd && !basisMode && <button type="button" className="utility-button utility-button-small" onClick={() => onUpdate("qcdSource", {})}>Enter a QCD worksheet</button>}
    {(needsSimplifiedMethod || worksheet !== undefined) && <fieldset className="guided-form-grid" style={{ gridColumn: "1 / -1" }}>
      <legend>{worksheetYear ? `${worksheetYear} ` : ""}Simplified Method pension worksheet</legend>
      <p className="guided-hint" style={{ gridColumn: "1 / -1" }}>Use the plan’s annuity records and any prior-year worksheet. This path covers single-life annuities starting in 1998 or later when the annuitant was under 75.</p>
      <Text label="Local reference for the actual annuity contract" value={worksheet?.planReference} onChange={planReference => updateWorksheet({ planReference })} />
      <Fact label="Are the payments from a qualified employee plan, qualified employee annuity or 403(b) plan?" value={worksheet?.qualifiedPlanConfirmed} onChange={qualifiedPlanConfirmed => updateWorksheet({ qualifiedPlanConfirmed })} />
      <Fact label="Is the recipient the only annuitant, receiving periodic payments for their own life?" value={worksheet?.singleLifeAnnuitantConfirmed} onChange={singleLifeAnnuitantConfirmed => updateWorksheet({ singleLifeAnnuitantConfirmed })} />
      <Fact label={`Does Box 1 report all ${worksheetYear ?? "current-year"} periodic payments for this contract, with no other payments included?`} value={worksheet?.statementCoversContractConfirmed} onChange={statementCoversContractConfirmed => updateWorksheet({ statementCoversContractConfirmed })} />
      <Text label="Actual annuity starting date" type="date" value={worksheet?.startingDate} onChange={startingDate => updateWorksheet({ startingDate })} />
      <Text label="Annuitant age on the starting date" value={worksheet?.ageAtStart} onChange={ageAtStart => updateWorksheet({ ageAtStart })} />
      <CurrencyField label="Net cost in the plan at the starting date" hint="The plan may report this amount in Box 9b." value={worksheet?.costInPlan ?? ""} onChange={costInPlan => updateWorksheet({ costInPlan })} required />
      <Text label={`Actual months covered by ${worksheetYear ?? "current-year"} payments`} value={worksheet?.monthsPaid} onChange={monthsPaid => updateWorksheet({ monthsPaid })} />
      <CurrencyField label={`Plan cost recovered or eligible for tax-free recovery ${worksheetYear ? `through ${worksheetYear - 1}` : "in prior years"}`} hint="Use line 10 of the prior-year worksheet and include amounts you could have recovered in prior years. Enter zero only if there was no prior recoverable cost." value={worksheet?.priorRecovered ?? ""} onChange={priorRecovered => updateWorksheet({ priorRecovered })} required />
      {worksheet && <button type="button" className="utility-button utility-button-small" onClick={() => onUpdate("simplifiedMethod", undefined)}>Remove Simplified Method worksheet</button>}
    </fieldset>}
    {basisMode ? <Fact label="Is another retirement method beyond the ordinary IRA basis records needed?" value={entry.otherRetirementWorksheetRequired} onChange={value => onUpdate("otherRetirementWorksheetRequired", value)} /> : <Fact label={qcdStatement ? "Is another retirement worksheet beyond this QCD worksheet needed?" : needsSimplifiedMethod ? "Is a penalty exception or another retirement worksheet needed for this pension?" : ageFacts?.ageException ? "Is another retirement worksheet needed beyond this documented Code 1 age exception?" : "Are basis, Roth or conversion, QCD, contribution-return, disaster, penalty-exception or other additional retirement worksheets needed?"} value={entry.additionalWorksheetRequired} onChange={value => onUpdate("additionalWorksheetRequired", value)} />}
    <Fact label="Have you checked all retirement source and taxability facts after the last edit?" value={entry.sourceFactsConfirmed} onChange={value => onUpdate("sourceFactsConfirmed", value)} />
    <p className="guided-hint">Keep unknown amounts blank. Enter zero only when the source or completed worksheet establishes zero. Special distributions and unresolved basis, rollover or multi-state allocations stay saved for review until their source worksheets are supported.</p>
  </>;
}
