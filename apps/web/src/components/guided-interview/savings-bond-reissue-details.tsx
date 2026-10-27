"use client";
import { bondReissueIdentityFields, bondReissueGroupFields, bondReissueSuccessorFields, bondReissueStatementFields, type SavingsBondReissueData } from "@/lib/guided-savings-bond-reissues";
import type { SavingsBondField, SavingsBondSourceRecord } from "@/lib/guided-savings-bond-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

function Fields({ fields, record, change }: { fields: SavingsBondField[]; record: object; change: (key: string, value: string | boolean | null) => void }) {
  const values = record as SavingsBondSourceRecord;
  return fields.map(field => {
    const value = values[field.key], text = typeof value === "string" ? value : "";
    if (field.kind === "boolean") return <BooleanFact key={field.key} label={field.label} value={typeof value === "boolean" ? value : null} onChange={next => change(field.key, next)} />;
    if (field.kind === "money") return <CurrencyField key={field.key} label={field.label} value={text} onChange={next => change(field.key, next)} />;
    if (field.kind === "choice") return <label key={field.key} className="guided-field"><span className="guided-field-label">{field.label}</span><select className="guided-input" value={text} onChange={event => change(field.key, event.target.value)}><option value="">Choose from actual records</option>{field.choices?.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>;
    return <TextFact key={field.key} label={field.label} value={text} type={field.kind === "date" ? "date" : "text"} onChange={next => change(field.key, next)} />;
  });
}
const ownerChoices: SavingsBondField[] = [{ key: "owner", label: "Original owner recognizing this transfer interest", kind: "choice", choices: [["primary", "You"], ["spouse", "Spouse"]] }];

export function SavingsBondReissueDetails({ data, redemptions, onChange }: {
  data?: SavingsBondReissueData; redemptions?: SavingsBondSourceRecord[];
  onChange: (next: SavingsBondReissueData | undefined) => void;
}) {
  if (!data) return <button className="utility-button" type="button" onClick={() => onChange({})}>Add original bond reissue history</button>;
  const update = (patch: Partial<SavingsBondReissueData>) => onChange({ ...data, ...patch, sourceFactsConfirmed: null });
  const groupChange = (index: number, patch: Partial<NonNullable<SavingsBondReissueData["groups"]>[number]>) => update({ groups: data.groups?.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const statementChange = (index: number, patch: Partial<NonNullable<SavingsBondReissueData["statements"]>[number]>) => update({ statements: data.statements?.map((row, i) => i === index ? { ...row, ...patch } : row) });
  return <fieldset className="guided-fieldset"><legend>Original bond reissue history</legend>
    <p className="guided-hint">Use the purchase records, actual reissue value, every successor bond and each current interest statement. Earlier-year reporting and current transfer interest are separate. This method covers the two living original joint owners, a whole transfer to one owner, a proportional split, or a sole-funder split. Keep unknown answers blank.</p>
    <TextFact label="Reissue history return tax year" value={data.sourceTaxYear ?? ""} onChange={sourceTaxYear => update({ sourceTaxYear })} />
    <TextFact label="Complete reissue history record reference" value={data.sourceReference ?? ""} onChange={sourceReference => update({ sourceReference })} />
    {(["primary", "spouse"] as const).map(owner => <fieldset className="guided-fieldset" key={owner}><legend>{owner === "primary" ? "Your original owner identity" : "Spouse original owner identity"}</legend><Fields fields={bondReissueIdentityFields} record={data[owner] ?? {}} change={(key, value) => update({ [owner]: { ...data[owner], [key]: value } })} /></fieldset>)}
    {(data.groups ?? []).map((group, index) => <fieldset className="guided-fieldset" key={group.sourceId ?? index}><legend>Original reissue group {index + 1}</legend>
      <Fields fields={bondReissueGroupFields} record={group} change={(key, value) => groupChange(index, { [key]: value })} />
      {(group.successors ?? []).map((successor, offset) => <fieldset className="guided-fieldset" key={successor.sourceId ?? offset}><legend>Successor bond {offset + 1}</legend>
        <Fields fields={bondReissueSuccessorFields} record={successor} change={(key, value) => groupChange(index, { successors: group.successors?.map((item, i) => i === offset ? { ...item, [key]: value } : item) })} />
        <label className="guided-field"><span className="guided-field-label">Matching current redemption record</span><select className="guided-input" value={successor.redemptionSourceId ?? ""} onChange={event => groupChange(index, { successors: group.successors?.map((item, i) => i === offset ? { ...item, redemptionSourceId: event.target.value || undefined } : item) })}><option value="">No redemption selected</option>{(redemptions ?? []).map((row, i) => <option key={String(row.sourceId ?? i)} value={String(row.sourceId ?? "")}>Bond {i + 1}{row.bondIdentifier ? `: ${row.bondIdentifier}` : ""}</option>)}</select></label>
        <button type="button" className="utility-button" onClick={() => groupChange(index, { successors: group.successors?.filter((_, i) => i !== offset) })}>Remove successor bond {offset + 1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={() => groupChange(index, { successors: [...(group.successors ?? []), { sourceId: `bond-successor:${crypto.randomUUID()}` }] })}>Add successor bond</button>
      <button type="button" className="utility-button" onClick={() => update({ groups: data.groups?.filter((_, i) => i !== index) })}>Remove original reissue group {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => update({ groups: [...(data.groups ?? []), { sourceId: `bond-history:${crypto.randomUUID()}` }] })}>Add original reissue group</button>
    {(data.statements ?? []).map((statement, index) => <fieldset className="guided-fieldset" key={statement.sourceId ?? index}><legend>Reissue interest statement {index + 1}</legend>
      <TextFact label="Form 1099-INT number in investment income (first is 1)" value={statement.originalIndex === undefined ? "" : String(Number(statement.originalIndex) + 1)} onChange={value => statementChange(index, { originalIndex: /^\d+$/.test(value) && Number(value) > 0 ? String(Number(value) - 1) : "" })} />
      <Fields fields={bondReissueStatementFields} record={statement} change={(key, value) => statementChange(index, { [key]: value })} />
      <fieldset className="guided-fieldset"><legend>Redemptions included in this statement</legend>
        {(redemptions ?? []).map((row, i) => { const id = String(row.sourceId ?? ""); return <label key={id}><input type="checkbox" checked={statement.redemptionSourceIds?.includes(id) ?? false} onChange={event => statementChange(index, { redemptionSourceIds: event.target.checked ? [...(statement.redemptionSourceIds ?? []), id] : statement.redemptionSourceIds?.filter(value => value !== id) })} /> Bond {i + 1}{row.bondIdentifier ? `: ${row.bondIdentifier}` : ""}</label>; })}
        {statement.redemptionSourceIds === undefined && <button type="button" className="utility-button" onClick={() => statementChange(index, { redemptionSourceIds: [] })}>Confirm no redemptions in this statement</button>}
      </fieldset>
      {(statement.currentTransfers ?? []).map((transfer, offset) => <fieldset className="guided-fieldset" key={offset}><legend>Current transfer {offset + 1}</legend>
        <label className="guided-field"><span className="guided-field-label">Original reissue group for this current transfer</span><select className="guided-input" value={transfer.groupSourceId ?? ""} onChange={event => statementChange(index, { currentTransfers: statement.currentTransfers?.map((row, i) => i === offset ? { ...row, groupSourceId: event.target.value } : row) })}><option value="">Choose the actual reissue</option>{(data.groups ?? []).map((group, i) => <option key={group.sourceId ?? i} value={group.sourceId ?? ""}>Group {i + 1}{group.originalBondIdentifier ? `: ${group.originalBondIdentifier}` : ""}</option>)}</select></label>
        <Fields fields={ownerChoices} record={transfer} change={(key, value) => statementChange(index, { currentTransfers: statement.currentTransfers?.map((row, i) => i === offset ? { ...row, [key]: value } : row) })} />
        <button type="button" className="utility-button" onClick={() => statementChange(index, { currentTransfers: statement.currentTransfers?.filter((_, i) => i !== offset) })}>Remove current transfer {offset + 1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={() => statementChange(index, { currentTransfers: [...(statement.currentTransfers ?? []), {}] })}>Add current transfer to statement</button>
      {statement.currentTransfers === undefined && <button type="button" className="utility-button" onClick={() => statementChange(index, { currentTransfers: [] })}>Confirm no current transfers in this statement</button>}
      <button type="button" className="utility-button" onClick={() => update({ statements: data.statements?.filter((_, i) => i !== index) })}>Remove reissue interest statement {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => update({ statements: [...(data.statements ?? []), { sourceId: `bond-statement:${crypto.randomUUID()}` }] })}>Add original reissue interest statement</button>
    <BooleanFact label="Original reissue history checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove original bond reissue history</button>
  </fieldset>;
}
