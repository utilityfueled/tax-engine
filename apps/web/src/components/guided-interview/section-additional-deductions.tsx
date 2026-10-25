"use client";
import { RetroShell } from "@/components/retro-shell";
import { tipIncomeW2Options, type AdditionalDeductionsData } from "@/lib/guided-tip-income-facts";
import { schedule1ACompensationSources } from "@/lib/guided-schedule-1-a-facts";
import { Schedule1ASourceDetails } from "./schedule-1-a-source-details";
import type { GuidedFlowState, W2EntryData } from "@/lib/guided-interview-flow";
import { TipIncomeSourceDetails } from "./tip-income-source-details";
export function SectionAdditionalDeductions({ data, state, w2Entries, onChange }: { data?: AdditionalDeductionsData; state: GuidedFlowState; w2Entries?: W2EntryData[]; onChange: (data: AdditionalDeductionsData) => void }) {
  return <RetroShell title="Tips & Additional Deductions" eyebrow="ADDITIONAL DEDUCTIONS"><div className="guided-question">
    <p className="guided-hint">Enter original sources before eligibility and income limits. Tip income and payroll tax are calculated separately from any deduction.</p>
    <Schedule1ASourceDetails data={data?.schedule1A} compensationSources={schedule1ACompensationSources(state)} businessOwner={state.sectionData["income-self-employment"]?.businessFacts?.accountHolder} businessName={state.sectionData["income-self-employment"]?.businessFacts?.businessName} onChange={schedule1A => onChange({ ...data, schedule1A })} />
    <TipIncomeSourceDetails accounts={data?.tipIncomeAccounts} w2Sources={tipIncomeW2Options(w2Entries)} onChange={tipIncomeAccounts => onChange({ ...data, tipIncomeAccounts })} />
  </div></RetroShell>;
}
