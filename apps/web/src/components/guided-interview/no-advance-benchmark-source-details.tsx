"use client";
import type { NoAdvanceBenchmarkData } from "@/lib/guided-shared-policy";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

export function NoAdvanceBenchmarkSourceDetails({ value, prefix, onCapture, onChange }: {
  value?: NoAdvanceBenchmarkData; prefix: string; onCapture: () => void; onChange: (value: NoAdvanceBenchmarkData) => void;
}) {
  return <section><h5>No advance credit: separate coverage-family benchmarks</h5>
    <p className="guided-hint">Obtain the applicable benchmark for each tax family from its Marketplace records. The original statement benchmark may be wrong or printed blank. Each benchmark must cover that family's actual eligible people for the month.</p>
    <button type="button" onClick={onCapture}>{prefix}: Copy actual coverage-family months</button>
    {value && <>
      <div className="guided-form-grid">
        <TextFact label={`${prefix}: Benchmark worksheet year`} value={value.sourceTaxYear} onChange={sourceTaxYear => onChange({ ...value, sourceTaxYear })} />
        <TextFact label={`${prefix}: Benchmark worksheet reference`} value={value.sourceReference} onChange={sourceReference => onChange({ ...value, sourceReference })} />
        <BooleanFact label={`${prefix}: All covered people belong to the two coverage families`} value={value.allCoveredPeopleInCoverageFamiliesConfirmed} onChange={allCoveredPeopleInCoverageFamiliesConfirmed => onChange({ ...value, allCoveredPeopleInCoverageFamiliesConfirmed })} />
      </div>
      {value.monthlyBenchmarks.map((row, index) => {
        const label = `${prefix}: Month ${row.month}`;
        const set = (patch: Partial<typeof row>) => onChange({ ...value, monthlyBenchmarks: value.monthlyBenchmarks.map((current, i) => i === index ? { ...current, ...patch } : current) });
        return <fieldset key={index}><legend>{label}: Actual family benchmarks</legend>
          <p className="guided-hint">Copied coverage: {row.thisReturnCoveredIndividualSsns.length} people on this return and {row.otherReturnCoveredIndividualSsns.length} on the other return. Copy again after changing people, assignments or months.</p>
          <div className="guided-form-grid">
            <CurrencyField label={`${label} this-return benchmark`} value={row.thisReturnSlcsp} onChange={thisReturnSlcsp => set({ thisReturnSlcsp })} />
            <CurrencyField label={`${label} other-return benchmark`} value={row.otherReturnSlcsp} onChange={otherReturnSlcsp => set({ otherReturnSlcsp })} />
            <TextFact label={`${label} this-return benchmark reference`} value={row.thisReturnSourceReference} onChange={thisReturnSourceReference => set({ thisReturnSourceReference })} />
            <TextFact label={`${label} other-return benchmark reference`} value={row.otherReturnSourceReference} onChange={otherReturnSourceReference => set({ otherReturnSourceReference })} />
          </div>
        </fieldset>;
      })}
      <BooleanFact label={`${prefix}: Benchmark sources checked after the last edit`} value={value.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...value, sourceFactsConfirmed })} />
    </>}
  </section>;
}
