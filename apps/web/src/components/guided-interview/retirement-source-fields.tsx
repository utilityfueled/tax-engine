"use client";

import type { RetirementEntryData } from "@/lib/guided-interview-flow";
import { guidedCode1IraAgeFacts, guidedCode1IraEducationOriginal, guidedCode1IraOriginal, hasStartedGuidedCode1IraAgeSource, retirementSourceAmounts } from "@/lib/guided-retirement-facts";
import { isGuidedQcdStatement, isGuidedQualifiedLumpSum, needsGuidedSimplifiedMethod, retirementQcdAmounts, retirementQcdConfirmations, retirementQcdTextFields, type GuidedRetirementSimplifiedMethod } from "@/lib/guided-retirement-source-inputs";
import { guidedFirstHomeOriginalError, matchesGuidedCode1IraOriginal, type GuidedFirstHomeWorksheet } from "@/lib/guided-retirement-first-home";
import { guidedIraEducationOriginalError, matchesGuidedIraEducationOriginal, type GuidedIraEducationWorksheet } from "@/lib/guided-retirement-education";
import { guidedDisabilityPensionOriginal, guidedDisabilityPensionOriginalError, matchesGuidedDisabilityPensionOriginal, type GuidedDisabilityPensionWorksheet } from "@/lib/guided-retirement-disability";
import { CurrencyField } from "./currency-field";

function Fact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={event => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}
function Text({ label, value, onChange, type = "text" }: { label: string; value: string | undefined; onChange: (value: string) => void; type?: "text" | "date" }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" type={type} value={value ?? ""} onChange={event => onChange(event.target.value)} /></label>;
}

function DisabilityPensionWorksheetFields({ worksheet, onChange }: {
  worksheet: GuidedDisabilityPensionWorksheet;
  onChange: (change: Partial<GuidedDisabilityPensionWorksheet>) => void;
}) {
  return <>
    <Text label="Employer plan record reference" value={worksheet.planReference} onChange={planReference => onChange({ planReference })} />
    <Fact label="Does the employer plan confirm this is a disability pension?" value={worksheet.employerDisabilityPensionConfirmed} onChange={employerDisabilityPensionConfirmed => onChange({ employerDisabilityPensionConfirmed })} />
    <Fact label="Does Box 1 report only this one disability pension payment?" value={worksheet.singlePaymentConfirmed} onChange={singlePaymentConfirmed => onChange({ singlePaymentConfirmed })} />
    <Text label="Minimum retirement date shown by the employer plan" type="date" value={worksheet.minimumRetirementDate} onChange={minimumRetirementDate => onChange({ minimumRetirementDate })} />
    <Text label="Date the disability pension payment was received" type="date" value={worksheet.paymentDate} onChange={paymentDate => onChange({ paymentDate })} />
  </>;
}

const firstHomeConfirmations = [
  ["ownHomePurchaseCompleted", "Did you complete the purchase of your own main home?"],
  ["unmarriedWithoutMainHomeInterest", "Were you unmarried on the binding contract date and without a main-home ownership interest during the two years ending on that date?"],
  ["noFormerSection1034Suspension", "Do your tax records establish that no former section 1034 suspension applies?"],
  ["distributionWasNotRolledOver", "Do your records confirm that none of this IRA distribution was rolled over?"],
  ["paidPurchasePriceFromDistribution", "Did you make one purchase-price payment using funds from this specific IRA payment?"],
] as const;

function FirstHomeWorksheetFields({ worksheet, onChange }: {
  worksheet: GuidedFirstHomeWorksheet;
  onChange: (change: Partial<GuidedFirstHomeWorksheet>) => void;
}) {
  return <>
    {firstHomeConfirmations.map(([field, label]) => <Fact key={field} label={label} value={worksheet[field]} onChange={value => onChange({ [field]: value })} />)}
    <Text label="Binding home purchase contract date" type="date" value={worksheet.bindingContractDate} onChange={bindingContractDate => onChange({ bindingContractDate })} />
    <Text label="Actual purchase-price payment date" type="date" value={worksheet.paymentDate} onChange={paymentDate => onChange({ paymentDate })} />
    <CurrencyField label="Purchase price paid from this IRA distribution" value={worksheet.paymentAmount ?? ""} onChange={paymentAmount => onChange({ paymentAmount })} required />
    <CurrencyField label="Prior lifetime qualifying first-home IRA distributions" hint="Use your own IRA records. Enter zero only if you have never had a prior qualifying first-home distribution." value={worksheet.priorQualifiedDistributions ?? ""} onChange={priorQualifiedDistributions => onChange({ priorQualifiedDistributions })} required />
  </>;
}

const educationConfirmations = [
  ["ordinaryTraditionalIraConfirmed", "Do IRA records confirm an ordinary traditional IRA withdrawal with no rollover?"],
  ["ownEligibleTuitionConfirmed", "Did you pay this required tuition for your own enrollment at an eligible college?"],
  ["refundedOrReimbursed", "Was any of this tuition refunded or reimbursed?"],
  ["coveredByEducationAccount", "Did Coverdell ESA or 529 funds cover any of this tuition?"],
  ["allocatedToEducationCredit", "Did anyone allocate this tuition to an education credit?"],
] as const;

function EducationWorksheetFields({ worksheet, onChange }: {
  worksheet: GuidedIraEducationWorksheet; onChange: (change: Partial<GuidedIraEducationWorksheet>) => void;
}) {
  return <>
    {educationConfirmations.map(([field, label]) => <Fact key={field} label={label} value={worksheet[field]} onChange={value => onChange({ [field]: value })} />)}
    <Text label="Eligible college name" value={worksheet.institutionName} onChange={institutionName => onChange({ institutionName })} />
    <Text label="Student account reference on the college bill" value={worksheet.billAccountReference} onChange={billAccountReference => onChange({ billAccountReference })} />
    <Text label="Student account reference on the payment receipt" value={worksheet.receiptAccountReference} onChange={receiptAccountReference => onChange({ receiptAccountReference })} />
    <Text label="Actual tuition payment date" type="date" value={worksheet.paymentDate} onChange={paymentDate => onChange({ paymentDate })} />
    <CurrencyField label="Required tuition charged on the college bill" value={worksheet.billedTuition ?? ""} onChange={billedTuition => onChange({ billedTuition })} required />
    <CurrencyField label="Tuition actually paid on the matching receipt" value={worksheet.paidTuition ?? ""} onChange={paidTuition => onChange({ paidTuition })} required />
    <CurrencyField label="Tax-free assistance applied to this tuition" hint="Check scholarships, grants, and employer or other tax-free aid. Enter zero only if none applied." value={worksheet.taxFreeAssistance ?? ""} onChange={taxFreeAssistance => onChange({ taxFreeAssistance })} required />
  </>;
}

export function RetirementSourceFields({ entry, onUpdate, basisMode = false, datedOwnerBirthDate, primaryOwnerFingerprint }: { entry: RetirementEntryData; onUpdate: <K extends keyof RetirementEntryData>(field: K, value: RetirementEntryData[K]) => void; basisMode?: boolean; datedOwnerBirthDate?: string; primaryOwnerFingerprint?: string }) {
  const qcdStatement = isGuidedQcdStatement(entry);
  const ordinaryQcdEligibleCode = entry.sourceTaxYear === "2026" && entry.isIraSepSimple === true && entry.distributionCode.trim() === "7";
  const qcd = entry.qcdSource;
  const needsSimplifiedMethod = needsGuidedSimplifiedMethod(entry);
  const ageFacts = guidedCode1IraAgeFacts(entry, datedOwnerBirthDate);
  const ageSource = entry.code1IraAgeSource;
  const firstHome = entry.code1IraFirstHomeSource;
  const firstHomeOriginal = guidedCode1IraOriginal(entry, datedOwnerBirthDate);
  const education = entry.code1IraEducationSource;
  const educationOriginal = guidedCode1IraEducationOriginal(entry, datedOwnerBirthDate, primaryOwnerFingerprint);
  const disability = entry.code3DisabilitySource;
  const disabilityOriginal = guidedDisabilityPensionOriginal(entry, datedOwnerBirthDate, primaryOwnerFingerprint);
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
        onChange={value => onUpdate("code1IraAgeSource", { singlePaymentConfirmed: value, ownerBirthDate: value === true ? datedOwnerBirthDate : undefined })} />
      {ageSource?.singlePaymentConfirmed === true && <Text label="Date the IRA payment was received" type="date"
        value={ageSource.distributionDate} onChange={distributionDate => onUpdate("code1IraAgeSource", { ...ageSource, distributionDate })} />}
    </>}
    {!ageFacts && hasStartedGuidedCode1IraAgeSource(entry) && <>
      <p className="guided-hint">Reconcile the saved Code 1 IRA receipt date with the current statement and return before calculating.</p>
      <button type="button" className="utility-button utility-button-small" onClick={() => onUpdate("code1IraAgeSource", undefined)}>Remove saved IRA receipt date</button>
    </>}
    {firstHomeOriginal && firstHome === undefined && education === undefined && <button type="button" className="utility-button utility-button-small"
      onClick={() => onUpdate("code1IraFirstHomeSource", { original: firstHomeOriginal })}>Enter a first-home IRA worksheet</button>}
    {firstHome !== undefined && <fieldset className="guided-form-grid" style={{ gridColumn: "1 / -1" }}>
      <legend>First-home IRA worksheet</legend>
      {matchesGuidedCode1IraOriginal(firstHome?.original, firstHomeOriginal)
        ? <FirstHomeWorksheetFields worksheet={firstHome} onChange={change => onUpdate("code1IraFirstHomeSource", { ...firstHome, ...change })} />
        : <p className="guided-hint">{guidedFirstHomeOriginalError}</p>}
      <button type="button" className="utility-button utility-button-small" onClick={() => onUpdate("code1IraFirstHomeSource", undefined)}>Remove first-home IRA worksheet</button>
    </fieldset>}
    {educationOriginal && education === undefined && firstHome === undefined && <button type="button" className="utility-button utility-button-small"
      onClick={() => onUpdate("code1IraEducationSource", { original: educationOriginal })}>Enter a college tuition IRA worksheet</button>}
    {education !== undefined && <fieldset className="guided-form-grid" style={{ gridColumn: "1 / -1" }}>
      <legend>College tuition IRA worksheet</legend>
      {matchesGuidedIraEducationOriginal(education, educationOriginal)
        ? <EducationWorksheetFields worksheet={education} onChange={change => onUpdate("code1IraEducationSource", { ...education, ...change })} />
        : <p className="guided-hint">{guidedIraEducationOriginalError}</p>}
      <button type="button" className="utility-button utility-button-small" onClick={() => onUpdate("code1IraEducationSource", undefined)}>Remove college tuition IRA worksheet</button>
    </fieldset>}
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
    {disabilityOriginal && disability === undefined && <button type="button" className="utility-button utility-button-small"
      onClick={() => onUpdate("code3DisabilitySource", { original: disabilityOriginal })}>Enter a disability pension worksheet</button>}
    {disability !== undefined && <fieldset className="guided-form-grid" style={{ gridColumn: "1 / -1" }}>
      <legend>Disability pension worksheet</legend>
      {matchesGuidedDisabilityPensionOriginal(disability, disabilityOriginal)
        ? <DisabilityPensionWorksheetFields worksheet={disability} onChange={change => onUpdate("code3DisabilitySource", { ...disability, ...change })} />
        : <p className="guided-hint">{guidedDisabilityPensionOriginalError}</p>}
      <button type="button" className="utility-button utility-button-small" onClick={() => onUpdate("code3DisabilitySource", undefined)}>Remove disability pension worksheet</button>
    </fieldset>}
    {basisMode ? <Fact label="Is another retirement method beyond the ordinary IRA basis records needed?" value={entry.otherRetirementWorksheetRequired} onChange={value => onUpdate("otherRetirementWorksheetRequired", value)} /> : <Fact label={qcdStatement ? "Is another retirement worksheet beyond this QCD worksheet needed?" : needsSimplifiedMethod ? "Is a penalty exception or another retirement worksheet needed for this pension?" : firstHome !== undefined ? "Is another retirement worksheet needed beyond this first-home IRA worksheet?" : education !== undefined ? "Is another retirement worksheet needed beyond this college tuition IRA worksheet?" : disability !== undefined ? "Is another retirement worksheet beyond this disability pension worksheet needed?" : ageFacts?.ageException ? "Is another retirement worksheet needed beyond this documented Code 1 age exception?" : "Are basis, Roth or conversion, QCD, contribution-return, disaster, penalty-exception or other additional retirement worksheets needed?"} value={entry.additionalWorksheetRequired} onChange={value => onUpdate("additionalWorksheetRequired", value)} />}
    <Fact label="Have you checked all retirement source and taxability facts after the last edit?" value={entry.sourceFactsConfirmed} onChange={value => onUpdate("sourceFactsConfirmed", value)} />
    <p className="guided-hint">Keep unknown amounts blank. Enter zero only when the source or completed worksheet establishes zero. Special distributions and unresolved basis, rollover or multi-state allocations stay saved for review until their source worksheets are supported.</p>
  </>;
}
