"use client";

import { RetroShell } from "@/components/retro-shell";
import { type SocialSecurityData, emptySocialSecurityData } from "@/lib/guided-interview-flow";
import { emptySocialSecurityEntry, emptySocialSecurityEarlierYear, socialSecurityEntries, withSocialSecurityEntries, type SocialSecurityEntryData, type SocialSecurityEarlierYearData } from "@/lib/guided-social-security-facts";
import { CurrencyField } from "./currency-field";
import { BenefitFact, SocialSecuritySourceFields, SocialSecurityEarlierYearFields } from "./social-security-source-fields";

export function SectionSocialSecurity({ data, onDataChange }: { data: SocialSecurityData | undefined; onDataChange: (data: SocialSecurityData) => void }) {
  const current = data ?? emptySocialSecurityData;
  const savedEntries = socialSecurityEntries(current);
  const entries = savedEntries.length ? savedEntries : [{ ...emptySocialSecurityEntry }];
  const update = (change: Partial<SocialSecurityData>) => onDataChange({ ...current, sourceFactsConfirmed: null, ...change });
  const updateEntry = (index: number, change: Partial<SocialSecurityEntryData>) => onDataChange(withSocialSecurityEntries(current, entries.map((entry, position) => position === index ? { ...entry, sourceFactsConfirmed: null, ...change } : entry)));
  const updateYear = (index: number, change: Partial<SocialSecurityEarlierYearData>) => update({ earlierYears: current.earlierYears?.map((year, position) => position === index ? { ...year, sourceFactsConfirmed: null, ...change } : year) });
  return <RetroShell title="Social Security Benefits" eyebrow="INCOME"><div className="guided-question">
    <p className="guided-prompt">Enter each actual benefit statement.</p>
    <p className="guided-hint">Use the legal beneficiary and statement amounts. A representative payee is not necessarily the taxpayer who owns the benefits. RRB-1099 covers Social Security equivalent benefits; RRB-1099-R pensions need their separate retirement source treatment.</p>
    <div className="guided-w2-stack">{entries.map((entry, index) => <div className="guided-w2-card" key={index}>
      <div className="guided-w2-card-header"><h3 className="guided-w2-card-title">Benefit statement #{index + 1}</h3>{entries.length > 1 && <button type="button" className="utility-button utility-button-small" aria-label={`Remove benefit statement ${index + 1}`} onClick={() => onDataChange(withSocialSecurityEntries(current, entries.filter((_, position) => position !== index)))}>Remove</button>}</div>
      <div className="guided-form-grid"><SocialSecuritySourceFields entry={entry} onChange={change => updateEntry(index, change)} /></div>
    </div>)}</div>
    <button type="button" className="utility-button" onClick={() => onDataChange(withSocialSecurityEntries(current, [...entries, { ...emptySocialSecurityEntry }]))}>Add benefit statement</button>
    <div className="guided-form-grid">
      <BenefitFact label="Do ordinary U.S. citizen or resident benefit rules apply to these taxpayers?" value={current.residentTreatmentConfirmed} onChange={residentTreatmentConfirmed => update({ residentTreatmentConfirmed })} />
      <CurrencyField label="Actual Puerto Rico income excluded for the benefit worksheet" value={current.puertoRicoIncomeExclusion ?? ""} onChange={puertoRicoIncomeExclusion => update({ puertoRicoIncomeExclusion })} required />
      <CurrencyField label="Actual American Samoa income excluded for the benefit worksheet" value={current.americanSamoaIncomeExclusion ?? ""} onChange={americanSamoaIncomeExclusion => update({ americanSamoaIncomeExclusion })} required />
      {(entries.some(entry => entry.priorYearBenefits === true) || current.lumpSumMethod) && <label className="guided-field"><span className="guided-field-label">Treatment of benefits paid for earlier years</span><select className="guided-input" value={current.lumpSumMethod ?? ""} onChange={event => update({ lumpSumMethod: event.target.value as SocialSecurityData["lumpSumMethod"] })}><option value="">Choose an actual method</option><option value="current-year">Use all net benefits in the current-year method</option><option value="election">Supply actual earlier returns for the lump-sum election comparison</option></select><span className="guided-field-hint">The optional election may reduce taxable benefits. It requires the actual earlier-year returns and allocation; an estimated prior income is not sufficient.</span></label>}
      {current.lumpSumMethod === "election" && <CurrencyField label="Actual current-year total Publication 915 exclusion addbacks" hint="Use the complete current-year worksheet, including any foreign income/housing, adoption benefits and possession exclusions. Keep separate exclusion amounts above; do not add this aggregate twice." value={current.currentYearExclusionsAdjustments ?? ""} onChange={currentYearExclusionsAdjustments => update({ currentYearExclusionsAdjustments })} required />}
    </div>
    {(current.lumpSumMethod === "election" || !!current.earlierYears?.length) && <>
      {(current.earlierYears ?? []).map((year, index) => <fieldset className="guided-fieldset" key={index}><legend>Earlier-year benefit worksheet #{index + 1}</legend><div className="guided-form-grid"><SocialSecurityEarlierYearFields year={year} onChange={change => updateYear(index, change)} /></div><button type="button" className="utility-button utility-button-small" aria-label={`Remove earlier-year worksheet ${index + 1}`} onClick={() => update({ earlierYears: current.earlierYears?.filter((_, position) => position !== index) })}>Remove earlier-year worksheet</button></fieldset>)}
      <button type="button" className="utility-button" onClick={() => update({ earlierYears: [...current.earlierYears ?? [], { ...emptySocialSecurityEarlierYear }] })}>Add earlier-year worksheet</button>
    </>}
    <BenefitFact label="Have you checked current-year benefit treatment and exclusion facts after the last edit?" value={current.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    <p className="guided-hint">Blank withholding stays unknown; enter zero only when established. Nonresident or foreign statements, excess repayments and unresolved IRA/benefit interactions need their separate worksheets. These source facts stay saved for review.</p>
  </div></RetroShell>;
}
