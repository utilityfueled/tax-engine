"use client";
import {RRTAPayrollSourceDetails} from "./rrta-payroll-source-details";
import { RetroShell } from "@/components/retro-shell";
import { tipIncomeW2Options, type AdditionalDeductionsData } from "@/lib/guided-tip-income-facts";
import { schedule1ACompensationSources } from "@/lib/guided-schedule-1-a-facts";
import { Schedule1ASourceDetails } from "./schedule-1-a-source-details";
import type { GuidedFlowState, W2EntryData } from "@/lib/guided-interview-flow";
import { TipIncomeSourceDetails } from "./tip-income-source-details";
import { Form8919ReasonADetails } from "./form-8919-reason-a-details";
export function SectionAdditionalDeductions({ data, state, w2Entries, onChange }: { data?: AdditionalDeductionsData; state: GuidedFlowState; w2Entries?: W2EntryData[]; onChange: (data: AdditionalDeductionsData) => void }) {
  const business = state.sectionData["income-self-employment"];
  return <RetroShell title="Tips & Additional Deductions" eyebrow="ADDITIONAL DEDUCTIONS"><div className="guided-question">
    <p className="guided-hint">Enter original sources before eligibility and income limits. Tip income and payroll tax are calculated separately from any deduction.</p>
    <Schedule1ASourceDetails data={data?.schedule1A} compensationSources={schedule1ACompensationSources(state)} businessOwner={business?.businessFacts?.accountHolder} businessName={business?.businessFacts?.businessName} cardTipSource={state.taxYear === 2026 ? business?.cardTipSource : undefined} onChange={schedule1A => onChange({ ...data, schedule1A })} />
    <TipIncomeSourceDetails accounts={data?.tipIncomeAccounts} w2Sources={tipIncomeW2Options(w2Entries)} onChange={tipIncomeAccounts => onChange({ ...data, tipIncomeAccounts })} />
    <RRTAPayrollSourceDetails state={state} data={data?.rrtaPayrollSources} onChange={rrtaPayrollSources=>onChange({...data,rrtaPayrollSources})}/>
    <Form8919ReasonADetails data={data?.form8919ReasonA} taxYear={state.taxYear} onChange={form8919ReasonA => onChange({ ...data, form8919ReasonA })} />
  </div></RetroShell>;
}
