"use client";

import { emptyTipEmployer, emptyTipIncomeAccount, type TipIncomeAccountData } from "@/lib/guided-tip-income-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

type W2Source = { sourceId: string; accountHolder: "primary" | "spouse" | ""; employerName: string; employerEin: string };
function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{value && !choices.some(([id]) => id === value) && <option value={value}>Saved source needs reconciliation</option>}{choices.map(([id, text]) => <option value={id} key={id}>{text}</option>)}</select></label>;
}
const monthChoices = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((name, index) => [String(index + 1), name] as const);
export function TipIncomeSourceDetails({ accounts, w2Sources = [], onChange }: { accounts?: TipIncomeAccountData[]; w2Sources?: W2Source[]; onChange: (data: TipIncomeAccountData[]) => void }) {
  const current = accounts ?? [];
  return <section><h4>Actual tip income and payroll records</h4>
    <p className="guided-hint">Use your tip diary, employer reports and W-2s. Include each employer separately, and check the reporting year for December and late reports. Cash tips under $20 in an employer-month still belong in income. Noncash tips belong in income but have different payroll treatment. These records do not by themselves establish a tip deduction.</p>
    {current.map((account, index) => {
      const label = `Tip owner ${index + 1}`;
      const set = (patch: Partial<TipIncomeAccountData>) => onChange(current.map((entry, position) => position === index ? { ...entry, ...patch, sourceFactsConfirmed: "sourceFactsConfirmed" in patch ? patch.sourceFactsConfirmed! : null } : entry));
      return <fieldset key={index}><legend>{label}</legend><div className="guided-form-grid">
        <Choice label={`${label}: Owner`} value={account.accountHolder} choices={[["primary", "You"], ["spouse", "Spouse on joint return"]]} onChange={accountHolder => set({ accountHolder: accountHolder as TipIncomeAccountData["accountHolder"] })} />
        <TextFact label={`${label}: Source tax year`} value={account.sourceTaxYear} onChange={sourceTaxYear => set({ sourceTaxYear })} />
        <TextFact label={`${label}: Source reference`} value={account.sourceReference} onChange={sourceReference => set({ sourceReference })} />
        <BooleanFact label={`${label}: All employers are included`} value={account.allEmployersIncluded} onChange={allEmployersIncluded => set({ allEmployersIncluded })} />
        <BooleanFact label={`${label}: Actual reporting-year treatment checked`} value={account.reportingYearTreatmentConfirmed} onChange={reportingYearTreatmentConfirmed => set({ reportingYearTreatmentConfirmed })} />
        <CurrencyField label={`${label}: Railroad compensation`} hint="Use actual compensation, including a checked zero. Railroad coverage requires its separate source worksheet." value={account.railroadRetirementCompensation} onChange={railroadRetirementCompensation => set({ railroadRetirementCompensation })} />
        <CurrencyField label={`${label}: Noncash tips not in wages`} value={account.noncashTipsNotIncludedInWages} onChange={noncashTipsNotIncludedInWages => set({ noncashTipsNotIncludedInWages })} />
      </div>
      {account.employers.map((employer, employerIndex) => {
        const prefix = `${label} employer ${employerIndex + 1}`;
        const update = (patch: Partial<typeof employer>) => set({ employers: account.employers.map((entry, position) => position === employerIndex ? { ...entry, ...patch } : entry) });
        const choices = w2Sources.filter(source => source.accountHolder === account.accountHolder).map(source => [source.sourceId, `${source.employerName || "Unnamed employer"} (${source.employerEin || "unknown EIN"}) — ${source.sourceId}`] as const);
        return <fieldset key={employerIndex}><legend>{prefix}</legend><div className="guided-form-grid">
          {([["sourceId", "Source label"], ["employerName", "Actual employer name"], ["employerEin", "Actual employer EIN"]] as const).map(([field, text]) => <TextFact key={field} label={`${prefix}: ${text}`} value={employer[field]} onChange={value => update({ [field]: value })} />)}
          {([["cashAndChargeTipsReceived", "Cash and charge tips received"], ["tipsReportedToEmployer", "Tips reported to employer"], ["allocatedTips", "Allocated tips"], ["medicareOnlyGovernmentUnreportedTips", "Medicare-only government unreported tips"], ["reportedTipsNotIncludedInBox7", "Reported tips outside Box 7"], ["box7TipsExcludedFromReportedTotal", "Box 7 tips outside the annual reported total"]] as const).map(([field, text]) => <CurrencyField key={field} label={`${prefix}: ${text}`} value={employer[field]} onChange={value => update({ [field]: value })} />)}
          <BooleanFact label={`${prefix}: Adequate records support actual unreported tips`} value={employer.adequateRecordsSupportUnreportedTips} onChange={adequateRecordsSupportUnreportedTips => update({ adequateRecordsSupportUnreportedTips })} />
          <BooleanFact label={`${prefix}: Employer is covered by railroad retirement`} value={employer.railroadRetirementCovered} onChange={railroadRetirementCovered => update({ railroadRetirementCovered })} />
          <BooleanFact label={`${prefix}: Medicare-only government exception qualification checked`} value={employer.medicareOnlyGovernmentQualificationConfirmed} onChange={medicareOnlyGovernmentQualificationConfirmed => update({ medicareOnlyGovernmentQualificationConfirmed })} />
          <TextFact label={`${prefix}: Reporting-year reconciliation reference`} value={employer.reportedTipReconciliationReference} onChange={reportedTipReconciliationReference => update({ reportedTipReconciliationReference })} />
        </div>
        <p className="guided-hint">Link every actual W-2 for this employer. If the employer did not issue a W-2, leave the list empty and reconcile actual reports separately. Do not enter an adjustment merely to make a total agree.</p>
        {employer.w2SourceIds.map((id, position) => <div key={position}><Choice label={`${prefix}: W-2 source ${position + 1}`} value={id} choices={choices} onChange={value => update({ w2SourceIds: employer.w2SourceIds.map((entry, offset) => offset === position ? value : entry) })} /><button type="button" onClick={() => update({ w2SourceIds: employer.w2SourceIds.filter((_, offset) => offset !== position) })}>{prefix}: Remove W-2 source {position + 1}</button></div>)}
        <button type="button" onClick={() => update({ w2SourceIds: [...employer.w2SourceIds, ""] })}>{prefix}: Add W-2 source</button>
        {employer.smallTipMonths.map((month, monthIndex) => {
          const monthLabel = `${prefix} month ${monthIndex + 1}`;
          const setMonth = (patch: Partial<typeof month>) => update({ smallTipMonths: employer.smallTipMonths.map((entry, position) => position === monthIndex ? { ...entry, ...patch } : entry) });
          return <div key={monthIndex} className="guided-form-grid"><Choice label={`${monthLabel}: Month`} value={month.month} choices={monthChoices} onChange={value => setMonth({ month: value })} /><CurrencyField label={`${monthLabel}: Total cash and charge tips`} value={month.totalCashAndChargeTips} onChange={totalCashAndChargeTips => setMonth({ totalCashAndChargeTips })} /><CurrencyField label={`${monthLabel}: Tips reported to employer`} value={month.tipsReportedToEmployer} onChange={tipsReportedToEmployer => setMonth({ tipsReportedToEmployer })} /><button type="button" onClick={() => update({ smallTipMonths: employer.smallTipMonths.filter((_, position) => position !== monthIndex) })}>{monthLabel}: Remove month</button></div>;
        })}
        <button type="button" onClick={() => update({ smallTipMonths: [...employer.smallTipMonths, { month: "", totalCashAndChargeTips: "", tipsReportedToEmployer: "" }] })}>{prefix}: Add month below $20</button>
        <button type="button" onClick={() => set({ employers: account.employers.filter((_, position) => position !== employerIndex) })}>{prefix}: Remove employer</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => set({ employers: [...account.employers, { ...emptyTipEmployer, w2SourceIds: [], smallTipMonths: [] }] })}>{label}: Add employer</button>
    <BooleanFact label={`${label}: Tip sources checked after the last edit`} value={account.sourceFactsConfirmed} onChange={sourceFactsConfirmed => set({ sourceFactsConfirmed })} />
    <button type="button" onClick={() => onChange(current.filter((_, position) => position !== index))}>{label}: Remove owner</button>
    </fieldset>;
  })}
    <button type="button" onClick={() => onChange([...current, { ...emptyTipIncomeAccount, employers: [] }])}>Add tip-income owner</button>
  </section>;
}
