"use client";
import { TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";
import type { CompensationReportingData } from "@/lib/guided-compensation-reporting";
export type { CompensationReportingData } from "@/lib/guided-compensation-reporting";
export function CompensationReportingFields({ data, kind, onChange }: { data: CompensationReportingData; kind: "w2" | "nec"; onChange: (patch: Partial<CompensationReportingData>) => void }) {
  const w2 = kind === "w2";
  return <fieldset><legend>Original year and tip/overtime reporting</legend><p className="guided-hint">Copy these fields only from the original source. The 2026 reporting boxes differ from 2025. Leave missing fields unknown; a separate deduction worksheet establishes eligibility.</p><div className="guided-form-grid">
    <TextFact label={`Original ${w2 ? "W-2" : "1099-NEC"} tax year`} value={data.sourceTaxYear ?? ""} onChange={sourceTaxYear => onChange({ sourceTaxYear })} />
    <CurrencyField label={w2 ? "Box 12 code TP: Reported cash tips" : "Box 1b: Reported cash tips"} value={(w2 ? data.box12CodeTP : data.cashTips) ?? ""} onChange={value => onChange(w2 ? { box12CodeTP: value } : { cashTips: value })} />
    <CurrencyField label={w2 ? "Box 12 code TT: Reported qualified overtime" : "Box 1d: Reported qualified overtime"} value={(w2 ? data.box12CodeTT : data.qualifiedOvertimeCompensation) ?? ""} onChange={value => onChange(w2 ? { box12CodeTT: value } : { qualifiedOvertimeCompensation: value })} />
    <TextFact label={w2 ? "Box 14b: Reported tipped occupation codes" : "Box 1c: Reported tipped occupation codes"} value={data.treasuryTippedOccupationCodes?.join(", ") ?? ""} onChange={value => onChange({ treasuryTippedOccupationCodes: value.trim() ? value.split(",").map(code => code.trim()) : undefined })} />
  </div>{data.treasuryTippedOccupationCodes?.length === 0 && <p className="guided-hint">You confirmed no occupation code is reported on this source.</p>}<button type="button" onClick={() => onChange({ treasuryTippedOccupationCodes: [] })}>Confirm no tipped occupation code reported</button></fieldset>;
}
