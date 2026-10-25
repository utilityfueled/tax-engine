"use client";

import { emptyMortgageWorksheet, type MortgageWorksheetData } from "@/lib/guided-mortgage-worksheet";

export function MortgageWorksheetDetails({ data, onChange }: { data: MortgageWorksheetData | undefined; onChange: (data: MortgageWorksheetData) => void }) {
  const current = data ?? emptyMortgageWorksheet;
  const update = (change: Partial<MortgageWorksheetData>) => onChange({ ...current, sourceFactsConfirmed: null, ...change });
  return <fieldset className="guided-fieldset"><legend>Complete home-debt worksheet</legend>
    <p className="guided-hint">Include all debt on your main home and selected second home. Use the actual annual records, even when interest or points are zero.</p>
    <div className="guided-form-grid">
      <label className="guided-field"><span className="guided-field-label">Home-debt worksheet tax year</span><input className="guided-input" value={current.sourceTaxYear} onChange={event => update({ sourceTaxYear: event.target.value })} /></label>
      <label className="guided-field"><span className="guided-field-label">Annual home-debt record reference</span><input className="guided-input" value={current.sourceReference} onChange={event => update({ sourceReference: event.target.value })} /></label>
      {([
        ["allHomeDebtIncluded", "Are all debts on the main and selected second home included?"],
        ["priorYearInterestRecoveriesPresent", "Did you receive a refund or recovery of mortgage interest deducted in an earlier year?"],
        ["sourceFactsConfirmed", "Have you confirmed the complete annual home-debt worksheet after the last change?"],
      ] as const).map(([field, label]) => <label className="guided-field" key={field}><span className="guided-field-label">{label}</span><select className="guided-input" value={current[field] == null ? "" : String(current[field])} onChange={event => update({ [field]: event.target.value === "" ? null : event.target.value === "true" })}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>)}
    </div>
    {current.priorYearInterestRecoveriesPresent !== false && <p className="guided-hint">Earlier-year recoveries need their actual tax-benefit worksheet. An unknown answer remains incomplete.</p>}
  </fieldset>;
}
