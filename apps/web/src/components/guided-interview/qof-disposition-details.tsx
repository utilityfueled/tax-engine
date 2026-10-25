"use client";
import { emptyQofDispositionFacts, type QofDispositionData } from "@/lib/guided-qof-facts";
import { BooleanFact, TextFact } from "./fact-fields";

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
    {data.disposedOfQofInvestment === true && <p role="status" className="guided-hint">Your Yes answer is saved. This return cannot calculate a QOF disposition yet: it needs the actual Form 8997 investment history and Form 8949 deferred-gain inclusion method.</p>}
    <button type="button" onClick={() => onChange(undefined)}>Remove QOF disposition worksheet</button>
  </section>;
}
