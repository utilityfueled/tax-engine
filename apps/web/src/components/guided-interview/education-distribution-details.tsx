"use client";

import {
  educationCollectionFields,
  educationStatementFields,
  educationTransferFields,
  type EducationDistributionData,
  type EducationSourceCollection,
  type EducationSourceField,
  type EducationSourceRecord,
} from "@/lib/guided-education-distributions";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

const collections: ReadonlyArray<{ key: EducationSourceCollection; singular: string; plural: string; hint: string }> = [
  { key: "beneficiaries", singular: "beneficiary", plural: "beneficiaries", hint: "Include each designated beneficiary. Enter actual outside-plan K-12 distributions, including a confirmed zero when none apply." },
  { key: "expenses", singular: "expense", plural: "expenses", hint: "Record actual payments and the amounts used for assistance, refunds, credits or another deduction. A statement withdrawal is not evidence of an eligible expense." },
  { key: "allocations", singular: "expense allocation", plural: "expense allocations", hint: "Link each distribution to its actual net eligible expenses. Record credit expenses separately; do not assign the same expense twice. For loan payments, identify the interest within the allocated payment." },
  { key: "inKindBenefits", singular: "in-kind benefit", plural: "in-kind benefits", hint: "Link each provided benefit to its statement and expense. Record its actual cost and the expense allocations, including assistance and credits. K-12 benefits also require the qualified prepaid program records and confirmation that outside-plan amounts include only cash distributions." },
  { key: "loanBorrowers", singular: "loan borrower", plural: "loan borrowers", hint: "Enter the borrower's actual lifetime and current-year qualified 529 loan-payment history. Only tax-free earnings used for interest reduce the student-loan interest deduction." },
  { key: "coverdellAccounts", singular: "Coverdell account history", plural: "Coverdell account histories", hint: "Use the actual account-basis worksheet and year-end records. A blank statement earnings box does not mean zero earnings." },
  { key: "penaltyExceptions", singular: "additional-tax exception", plural: "additional-tax exceptions", hint: "Identify the actual qualifying event and the distinct distribution covered by it. A source code alone does not establish the exception." },
];

function stringValue(value: EducationSourceRecord[string]): string {
  return typeof value === "string" ? value : "";
}

function linkChoices(data: EducationDistributionData, link: EducationSourceField["link"]): ReadonlyArray<readonly [string, string]> {
  if (link === "source") return (data.forms ?? []).map((entry, index) => [stringValue(entry.fields.sourceId), stringValue(entry.fields.payerName) || `Statement ${index + 1}`]);
  const rows = link === "beneficiary" ? data.beneficiaries : link === "expense" ? data.expenses : data.loanBorrowers;
  return (rows ?? []).map((entry, index) => [stringValue(entry.id), stringValue(entry.name) || `${link === "expense" ? "Expense" : link === "borrower" ? "Borrower" : "Beneficiary"} ${index + 1}`]);
}

function SourceFields({ fields, record, data, onChange }: {
  fields: EducationSourceField[];
  record: EducationSourceRecord;
  data: EducationDistributionData;
  onChange: (key: string, value: string | boolean | null) => void;
}) {
  return fields.filter(field => !field.when || field.when(record)).map(field => {
    const value = record[field.key];
    if (field.kind === "boolean") return <BooleanFact key={field.key} label={field.label} value={typeof value === "boolean" ? value : null} onChange={next => onChange(field.key, next)} />;
    if (field.kind === "money") return <CurrencyField key={field.key} label={field.label} value={stringValue(value)} allowNegative={field.signed} onChange={next => onChange(field.key, next)} />;
    if (field.kind === "choice") {
      const choices = field.link ? linkChoices(data, field.link) : field.choices ?? [];
      return <label className="guided-field" key={field.key}><span className="guided-field-label">{field.label}</span>
        <select className="guided-input" value={stringValue(value)} onChange={event => onChange(field.key, event.target.value)}>
          <option value="">Choose from actual records</option>
          {choices.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
      </label>;
    }
    return <TextFact key={field.key} label={field.label} value={stringValue(value)} type={field.kind === "date" ? "date" : "text"} onChange={next => onChange(field.key, next)} />;
  });
}

export function EducationDistributionDetails({ data, onChange }: {
  data?: EducationDistributionData;
  onChange: (next: EducationDistributionData | undefined) => void;
}) {
  if (!data) return <div className="guided-w2-card" style={{ padding: "12px" }}>
    <h3 className="guided-w2-card-title">Education distributions (Form 1099-Q)</h3>
    <p className="guided-hint">Add 529 or Coverdell statements, expense allocations and any actual transfers or exceptions.</p>
    <button type="button" className="utility-button" onClick={() => onChange({})}>Add education distribution records</button>
  </div>;

  const update = (next: Partial<EducationDistributionData>) => onChange({ ...data, ...next, sourceFactsConfirmed: null });
  const statement = (index: number, group: "fields" | "transfer", key: string, value: string | boolean | null) => update({
    forms: data.forms?.map((entry, row) => row === index ? {
      ...entry,
      [group]: { ...entry[group], [key]: value },
      fields: { ...entry.fields, ...(group === "fields" ? { [key]: value } : {}), sourceFactsConfirmed: group === "fields" && key === "sourceFactsConfirmed" ? value : null },
    } : entry),
  });

  return <div className="guided-w2-card" style={{ padding: "12px" }}>
    <h3 className="guided-w2-card-title">Education distributions (Form 1099-Q)</h3>
    <p className="guided-hint">Use actual statements, expense records and account histories. Leave an unknown answer blank. Confirm an empty list only after checking that no records apply. Review eligibility and coordination in <a href="https://www.irs.gov/publications/p970" target="_blank" rel="noreferrer">IRS Publication 970</a>.</p>
    <TextFact label="Education distribution source tax year" value={data.taxYear ?? ""} onChange={taxYear => update({ taxYear })} />

    {collections.filter(collection => collection.key === "beneficiaries").map(collection => renderCollection(collection))}
    <fieldset className="guided-fieldset"><legend>Distribution statements</legend>
      {(data.forms ?? []).map((entry, index) => <fieldset className="guided-fieldset" key={stringValue(entry.fields.sourceId) || index}><legend>Statement {index + 1}</legend>
        {entry.fields.distributionCode === "6" && <p className="guided-hint">A whole-account disqualification can be calculated here only with actual January 1 value and basis, zero qualified education expenses including eligible 529 contributions, and no later income, gains or losses. Pledged portions, education expenses, losses or later account activity require a separate calculation. You can keep their actual source records here.</p>}
        <SourceFields fields={educationStatementFields} record={entry.fields} data={data} onChange={(key, value) => statement(index, "fields", key, value)} />
        <SourceFields fields={educationTransferFields} record={entry.transfer} data={data} onChange={(key, value) => statement(index, "transfer", key, value)} />
        <button type="button" className="utility-button" onClick={() => update({ forms: data.forms?.filter((_, row) => row !== index) })}>Remove statement {index + 1}</button>
      </fieldset>)}
      {data.forms?.length === 0 && <p className="guided-hint">No distribution statements entered.</p>}
      <button type="button" className="utility-button" onClick={() => update({ forms: [...(data.forms ?? []), { fields: { sourceId: `distribution:${crypto.randomUUID()}` }, transfer: {} }] })}>Add statement</button>
      {data.forms === undefined && <button type="button" className="utility-button" onClick={() => update({ forms: [] })}>Confirm no statements</button>}
    </fieldset>
    {collections.filter(collection => collection.key !== "beneficiaries").map(collection => renderCollection(collection))}

    <BooleanFact label="All distributions and relevant account histories for these beneficiaries reconciled" value={data.allDistributionsReconciled} onChange={allDistributionsReconciled => update({ allDistributionsReconciled })} />
    <BooleanFact label="Additional-tax exception distributions are distinct from education-credit exceptions" value={data.exceptionsDistinctFromCreditConfirmed} onChange={exceptionsDistinctFromCreditConfirmed => update({ exceptionsDistinctFromCreditConfirmed })} />
    <BooleanFact label="All education sources and allocations checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove education distribution records</button>
  </div>;

  function renderCollection(collection: typeof collections[number]) {
    if (!data) return null;
    const rows = data[collection.key];
    return <fieldset className="guided-fieldset" key={collection.key}><legend>{collection.plural[0]?.toUpperCase()}{collection.plural.slice(1)}</legend>
      <p className="guided-hint">{collection.hint}</p>
      {(rows ?? []).map((record, index) => <fieldset className="guided-fieldset" key={stringValue(record.id) || index}><legend>{collection.singular} {index + 1}</legend>
        <SourceFields fields={educationCollectionFields[collection.key]} record={record} data={data} onChange={(key, value) => update({ [collection.key]: rows?.map((item, row) => row === index ? { ...item, [key]: value } : item) })} />
        <button type="button" className="utility-button" onClick={() => update({ [collection.key]: rows?.filter((_, row) => row !== index) })}>Remove {collection.singular} {index + 1}</button>
      </fieldset>)}
      {rows?.length === 0 && <p className="guided-hint">No {collection.plural} entered.</p>}
      <button type="button" className="utility-button" onClick={() => update({ [collection.key]: [...(rows ?? []), { id: `${collection.key}:${crypto.randomUUID()}` }] })}>Add {collection.singular}</button>
      {rows === undefined && <button type="button" className="utility-button" onClick={() => update({ [collection.key]: [] })}>Confirm no {collection.plural}</button>}
    </fieldset>;
  }
}
