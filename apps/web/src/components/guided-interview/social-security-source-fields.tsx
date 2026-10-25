"use client";

import type { SocialSecurityEarlierYearData, SocialSecurityEntryData } from "@/lib/guided-social-security-facts";
import { CurrencyField } from "./currency-field";

export function BenefitFact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={event => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}
function Text({ label, value, onChange }: { label: string; value: string | undefined; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" value={value ?? ""} onChange={event => onChange(event.target.value)} /></label>;
}
export function SocialSecuritySourceFields({ entry, onChange }: { entry: SocialSecurityEntryData; onChange: (change: Partial<SocialSecurityEntryData>) => void }) {
  return <>
    <label className="guided-field"><span className="guided-field-label">Actual benefit statement type</span><select className="guided-input" value={entry.sourceType ?? ""} onChange={event => onChange({ sourceType: event.target.value as SocialSecurityEntryData["sourceType"] })}><option value="">Choose the actual statement</option><option value="ssa-1099">SSA-1099</option><option value="rrb-1099">RRB-1099 — Social Security equivalent benefits</option><option value="ssa-1042s">SSA-1042S — nonresident benefits</option><option value="rrb-1042s">RRB-1042S — nonresident benefits</option><option value="foreign">Foreign benefit statement</option></select></label>
    <Text label="Benefit statement tax year" value={entry.sourceTaxYear} onChange={sourceTaxYear => onChange({ sourceTaxYear })} />
    <Text label="Benefit statement reference (local label or last four account digits)" value={entry.accountReference} onChange={accountReference => onChange({ accountReference })} />
    <Text label="Legal beneficiary name shown on the statement" value={entry.recipient} onChange={recipient => onChange({ recipient })} />
    <Text label="Last four digits of the beneficiary taxpayer ID" value={entry.beneficiaryTaxIdLast4} onChange={beneficiaryTaxIdLast4 => onChange({ beneficiaryTaxIdLast4 })} />
    <label className="guided-field"><span className="guided-field-label">Whose legal benefits are reported?</span><select className="guided-input" value={entry.beneficiaryRole ?? ""} onChange={event => onChange({ beneficiaryRole: event.target.value as SocialSecurityEntryData["beneficiaryRole"] })}><option value="">Choose actual beneficiary</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on this joint return</option><option value="other">Another beneficiary — excluded from this return</option></select><span className="guided-field-hint">A child's benefits belong to the child even when you receive the payment as representative payee.</span></label>
    <CurrencyField label="Gross benefits paid (Box 3)" value={entry.benefitsPaid ?? ""} onChange={benefitsPaid => onChange({ benefitsPaid })} required />
    <CurrencyField label="Benefits repaid (Box 4)" value={entry.benefitsRepaid ?? ""} onChange={benefitsRepaid => onChange({ benefitsRepaid })} required />
    <CurrencyField label="Signed net benefits (Box 5)" hint="Copy the actual source amount. Use a minus sign for an amount shown in parentheses; never substitute deposits after Medicare or withholding." value={entry.netBenefits} onChange={netBenefits => onChange({ netBenefits })} required />
    <CurrencyField label={`Federal withholding (${entry.sourceType === "rrb-1099" ? "RRB-1099 Box 10" : "SSA-1099 Box 6"})`} value={entry.federalWithheld} onChange={federalWithheld => onChange({ federalWithheld })} required />
    <BenefitFact label="Does this statement include benefits paid for earlier tax years?" value={entry.priorYearBenefits} onChange={priorYearBenefits => onChange({ priorYearBenefits })} />
    {entry.priorYearBenefits === true && <CurrencyField label="Actual benefits for earlier years included on this statement" value={entry.priorYearBenefitsAmount ?? ""} onChange={priorYearBenefitsAmount => onChange({ priorYearBenefitsAmount })} required />}
    <BenefitFact label="Have you checked this benefit source after the last edit?" value={entry.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ sourceFactsConfirmed })} />
  </>;
}

export function SocialSecurityEarlierYearFields({ year, onChange }: { year: SocialSecurityEarlierYearData; onChange: (change: Partial<SocialSecurityEarlierYearData>) => void }) {
  return <>
    <Text label="Actual earlier tax year" value={year.taxYear} onChange={taxYear => onChange({ taxYear })} />
    <label className="guided-field"><span className="guided-field-label">Filing status on the actual earlier return</span><select className="guided-input" value={year.filingStatus} onChange={event => onChange({ filingStatus: event.target.value as SocialSecurityEarlierYearData["filingStatus"] })}><option value="">Choose actual prior status</option><option value="single">Single</option><option value="mfj">Married filing jointly</option><option value="mfs">Married filing separately</option><option value="hoh">Head of household</option><option value="qss">Qualifying surviving spouse</option></select></label>
    {year.filingStatus === "mfs" && <BenefitFact label="Did you live with your spouse at any time in that earlier year?" value={year.livedWithSpouseAtAnyTimeDuringYear} onChange={livedWithSpouseAtAnyTimeDuringYear => onChange({ livedWithSpouseAtAnyTimeDuringYear })} />}
    {([
      ["benefitsReceivedInEarlierYear", "Net benefits originally received in the earlier year"],
      ["delayedBenefitsReceivedInCurrentYear", "Benefits paid this year that belong to this earlier year"],
      ["adjustedGrossIncome", "Actual adjusted gross income on the earlier return"],
      ["taxExemptInterest", "Actual tax-exempt interest in the earlier year"],
      ["exclusionsAdjustments", "Actual earlier-year Publication 915 exclusion and adjustment worksheet total"],
      ["taxableBenefitsPreviouslyReported", "Taxable benefits actually reported on the earlier return"],
    ] as const).map(([field, label]) => <CurrencyField key={field} label={label} value={year[field]} onChange={value => onChange({ [field]: value })} required />)}
    <BenefitFact label="Have you checked the actual earlier return and benefit allocation after the last edit?" value={year.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ sourceFactsConfirmed })} />
  </>;
}
