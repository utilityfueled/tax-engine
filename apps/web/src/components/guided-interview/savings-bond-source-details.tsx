"use client";

import { savingsBondFields, savingsBondExpenseFields, savingsBondWorksheetFields, type SavingsBondEducationData, type SavingsBondField, type SavingsBondSourceRecord } from "@/lib/guided-savings-bond-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

function SourceFields({ fields, record, onChange }: { fields: SavingsBondField[]; record: SavingsBondSourceRecord; onChange: (key: string, value: string | boolean | null) => void }) {
  return fields.filter(field => !field.when || field.when(record)).map(field => {
    const value = record[field.key], text = typeof value === "string" ? value : "";
    if (field.kind === "boolean") return <BooleanFact key={field.key} label={field.label} value={typeof value === "boolean" ? value : null} onChange={next => onChange(field.key, next)} />;
    if (field.kind === "money") return <CurrencyField key={field.key} label={field.label} value={text} allowNegative={field.signed} onChange={next => onChange(field.key, next)} />;
    if (field.kind === "choice") return <label className="guided-field" key={field.key}><span className="guided-field-label">{field.label}</span><select className="guided-input" value={text} onChange={event => onChange(field.key, event.target.value)}><option value="">Choose from actual records</option>{field.choices?.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>;
    return <TextFact key={field.key} label={field.label} value={text} type={field.kind === "date" ? "date" : "text"} onChange={next => onChange(field.key, next)} />;
  });
}

export function SavingsBondSourceDetails({ data, onChange }: { data?: SavingsBondEducationData; onChange: (next: SavingsBondEducationData | undefined) => void }) {
  if (!data) return <div className="guided-w2-card" style={{ padding: "12px" }}><h3 className="guided-w2-card-title">Savings-bond education exclusion (Form 8815)</h3><p className="guided-hint">Add actual series EE or I redemption records and coordinated education expenses.</p><button type="button" className="utility-button" onClick={() => onChange({})}>Add savings-bond education records</button></div>;
  const update = (next: Partial<SavingsBondEducationData>) => onChange({ ...data, ...next, sourceFactsConfirmed: null });
  const row = (collection: "redemptions" | "educationExpenses", index: number, key: string, value: string | boolean | null) => update({ [collection]: data[collection]?.map((item, offset) => offset === index ? { ...item, [key]: value, ...(key === "registeredOwner" ? { ageTestOwner: undefined } : {}), ...(collection === "educationExpenses" && key !== "coordinationConfirmed" ? { coordinationConfirmed: null } : {}) } : item) });
  return <div className="guided-w2-card" style={{ padding: "12px" }}>
    <h3 className="guided-w2-card-title">Savings-bond education exclusion (Form 8815)</h3>
    <p className="guided-hint">Use actual bond records, tuition receipts and benefit worksheets. Keep the original serial-number records. Enter the reported Form 1099-INT Box 3 amounts in investment income. Leave unknown answers blank; enter 0 only when your records establish zero. See <a href="https://www.irs.gov/pub/irs-pdf/f8815.pdf" target="_blank" rel="noreferrer">Form 8815 instructions</a>.</p>
    <TextFact label="Savings-bond source tax year" value={data.taxYear ?? ""} onChange={taxYear => update({ taxYear })} />
    <fieldset className="guided-fieldset"><legend>Bond redemptions</legend>
      {(data.redemptions ?? []).map((record, index) => <fieldset className="guided-fieldset" key={String(record.sourceId ?? index)}><legend>Bond redemption {index + 1}</legend>
        <SourceFields fields={savingsBondFields} record={record} onChange={(key, value) => row("redemptions", index, key, value)} />
        <button type="button" className="utility-button" onClick={() => update({ redemptions: data.redemptions?.filter((_, offset) => offset !== index) })}>Remove bond redemption {index + 1}</button>
      </fieldset>)}
      {data.redemptions?.length === 0 && <p className="guided-hint">No bond redemptions entered.</p>}
      <button type="button" className="utility-button" onClick={() => update({ redemptions: [...(data.redemptions ?? []), { sourceId: `bond:${crypto.randomUUID()}` }] })}>Add bond redemption</button>
      {data.redemptions === undefined && <button type="button" className="utility-button" onClick={() => update({ redemptions: [] })}>Confirm no bond redemptions</button>}
    </fieldset>
    <fieldset className="guided-fieldset"><legend>Education expenses for the bond exclusion</legend>
      <p className="guided-hint">Record each expense once. Reconcile tuition with scholarships, education credits, 529 and Coverdell distributions. A withdrawal or redemption is not proof of an education payment.</p>
      {(data.educationExpenses ?? []).map((record, index) => <fieldset className="guided-fieldset" key={String(record.sourceId ?? index)}><legend>Bond education expense {index + 1}</legend>
        <SourceFields fields={savingsBondExpenseFields} record={record} onChange={(key, value) => row("educationExpenses", index, key, value)} />
        <button type="button" className="utility-button" onClick={() => update({ educationExpenses: data.educationExpenses?.filter((_, offset) => offset !== index) })}>Remove bond education expense {index + 1}</button>
      </fieldset>)}
      {data.educationExpenses?.length === 0 && <p className="guided-hint">No bond education expenses entered.</p>}
      <button type="button" className="utility-button" onClick={() => update({ educationExpenses: [...(data.educationExpenses ?? []), { sourceId: `bond-expense:${crypto.randomUUID()}` }] })}>Add bond education expense</button>
      {data.educationExpenses === undefined && <button type="button" className="utility-button" onClick={() => update({ educationExpenses: [] })}>Confirm no bond education expenses</button>}
    </fieldset>
    <fieldset className="guided-fieldset"><legend>Statement reconciliation and income worksheet</legend>
      <p className="guided-hint">Only previously reported interest included in the current statements is removed from those statements. The royalty adjustment is the signed change in AGI from the actual pre-exclusion interest deduction, not a proposed exclusion or total royalty income.</p>
      <SourceFields fields={savingsBondWorksheetFields} record={{ priorYearInterestIncludedInCurrentStatements: data.priorYearInterestIncludedInCurrentStatements, americanSamoaIncomeExclusion: data.americanSamoaIncomeExclusion, puertoRicoIncomeExclusion: data.puertoRicoIncomeExclusion, royaltyInterestAdjustment: data.royaltyInterestAdjustment }} onChange={(key, value) => update({ [key]: value })} />
      <BooleanFact label="Current Form 1099-INT interest reconciled with actual bond reporting history" value={data.currentStatementReconciliationConfirmed} onChange={currentStatementReconciliationConfirmed => update({ currentStatementReconciliationConfirmed })} />
    </fieldset>
    <BooleanFact label="All bond and education sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove savings-bond education records</button>
  </div>;
}
