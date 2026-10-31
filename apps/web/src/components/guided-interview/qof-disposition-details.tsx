"use client";
import { emptyQofDispositionFacts, emptyQofInvestment, type QofDispositionData, type QofInvestmentData } from "@/lib/guided-qof-facts";
import { BooleanFact, TextFact } from "./fact-fields";

function Choice({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span>
    <select className="guided-input" value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Choose from actual records</option>
      {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select></label>;
}
function QofInvestmentRow({ index, row, onChange, onRemove }: { index: number; row: QofInvestmentData; onChange: (patch: Partial<QofInvestmentData>) => void; onRemove: () => void }) {
  const prefix = `QOF investment ${index + 1}`, sale = row.event === "sale_or_exchange", corporation = row.interestType === "corporation";
  const text = (key: keyof QofInvestmentData, label: string, type?: "date") => <TextFact label={`${prefix}: ${label}`} type={type} value={String(row[key] ?? "")} onChange={value => onChange({ [key]: value })} />;
  return <fieldset style={{ minWidth: 0 }}><legend>{prefix}</legend><div className="guided-form-grid">
    {text("sourceReference", "Original record reference")}{text("qofEin", "Fund EIN")}{text("description", "Interest description")}
    {text("investmentDate", "Investment date", "date")}
    <Choice label={`${prefix}: Interest type`} value={row.interestType ?? ""} options={[["corporation", "Corporation stock"], ["partnership_or_s_corporation", "Partnership or S corporation interest"]]} onChange={interestType => onChange({ interestType })} />
    <Choice label={`${prefix}: Deferred gain character`} value={row.gainCharacter ?? ""} options={[["short_term", "Short-term"], ["long_term", "Long-term"]]} onChange={gainCharacter => onChange({ gainCharacter })} />
    {text("originalDeferredGain", "Original deferred gain")}{text("remainingDeferredGain", "Remaining deferred gain")}
    <Choice label={`${prefix}: Inclusion event`} value={row.event ?? ""} options={[["sale_or_exchange", "Complete sale or exchange"], ["december_31_2026", "Held on December 31, 2026"]]} onChange={event => onChange({ event })} />
    {text("eventDate", "Event date", "date")}
    <BooleanFact label={`${prefix}: Entire investment included`} value={row.entireInvestment ?? null} onChange={entireInvestment => onChange({ entireInvestment })} />
    {corporation ? text("fairMarketValue", "Fair market value on the event date") : text("fullyTaxableDispositionGain", "Gain on a fully taxable disposition at fair market value")}
    {sale && text("proceeds", "Sale proceeds")}{sale && text("basisBeforeInclusion", "Basis before inclusion, without any 10% or 15% QOF increase")}
    <BooleanFact label={`${prefix}: No Form 8997 special gain code applies`} value={row.noSpecialGainCode ?? null} onChange={noSpecialGainCode => onChange({ noSpecialGainCode })} />
    {sale && !corporation && <BooleanFact label={`${prefix}: All sale gain is capital, with no look-through character`} value={row.saleGainAllCapitalConfirmed ?? null} onChange={saleGainAllCapitalConfirmed => onChange({ saleGainAllCapitalConfirmed })} />}
    <BooleanFact label={`${prefix}: Sources checked after the last edit`} value={row.sourceFactsConfirmed ?? null} onChange={sourceFactsConfirmed => onChange({ sourceFactsConfirmed })} />
  </div><button type="button" onClick={onRemove}>Remove {prefix}</button></fieldset>;
}

export function QofDispositionDetails({ data, onChange }: { data?: QofDispositionData; onChange: (data: QofDispositionData | undefined) => void }) {
  if (!data) return <section><h3>Qualified opportunity fund investments</h3><p className="guided-hint">Schedule D asks whether you disposed of a QOF investment during the year. Gains or a Form 8949 alone do not answer that question.</p><button type="button" onClick={() => onChange({ ...emptyQofDispositionFacts })}>Add actual QOF disposition answer</button></section>;
  const update = (patch: Partial<QofDispositionData>) => onChange({ ...data, ...patch, ...(Object.keys(patch).every(key => key === "sourceFactsConfirmed") ? {} : { sourceFactsConfirmed: null }) });
  return <section><h3>Qualified opportunity fund investments</h3>
    <p className="guided-hint">Check all original investment records, including investments not on a brokerage statement. Leave an unknown answer unanswered. See the <a href="https://www.irs.gov/instructions/i1040sd" target="_blank" rel="noreferrer">Schedule D instructions</a>.</p>
    <div className="guided-form-grid">
      <TextFact label="QOF source tax year" value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label="QOF investment record reference" value={data.sourceReference} onChange={sourceReference => update({ sourceReference })} />
      <BooleanFact label="Disposed of a qualified opportunity fund investment during this year" value={data.disposedOfQofInvestment} onChange={disposedOfQofInvestment => update({ disposedOfQofInvestment })} />
      <BooleanFact label="All actual investment records reviewed for QOF dispositions" value={data.allInvestmentsReviewed} onChange={allInvestmentsReviewed => update({ allInvestmentsReviewed })} />
      <BooleanFact label="QOF sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    </div>
    {data.sourceTaxYear === "2026" && <BooleanFact label="Held previously deferred QOF gain on December 31, 2026" value={data.deferredGainHeldAtYearEnd ?? null} onChange={deferredGainHeldAtYearEnd => update({ deferredGainHeldAtYearEnd })} />}
    {(data.disposedOfQofInvestment === true || data.deferredGainHeldAtYearEnd === true) && <p role="status" className="guided-hint">Add each investment from Form 8997 and the fund statements. Gain is included for a complete sale and for gain held on December 31, 2026. Partial dispositions and other events cannot be calculated here.</p>}
    {(data.investments ?? []).map((row, index) => <QofInvestmentRow key={index} index={index} row={row}
      onChange={patch => update({ investments: data.investments!.map((item, at) => at === index ? { ...item, ...patch, ...(Object.keys(patch).every(key => key === "sourceFactsConfirmed") ? {} : { sourceFactsConfirmed: null }) } : item) })}
      onRemove={() => update({ investments: data.investments!.filter((_, at) => at !== index) })} />)}
    <button type="button" onClick={() => update({ investments: [...(data.investments ?? []), { ...emptyQofInvestment, sourceId: `qof-${Date.now()}` }] })}>Add QOF investment</button>
    <button type="button" onClick={() => onChange(undefined)}>Remove QOF disposition worksheet</button>
  </section>;
}
