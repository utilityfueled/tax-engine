"use client";

import type { HealthInsuranceSourceOption } from '@/lib/guided-health-insurance-facts';
import type { PartnershipHealthGrossData, PartnershipHealthGrossStatementData } from '@/lib/guided-health-business-gross';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

export function PartnershipHealthGrossDetails({ data, sources, onChange }: {
  data?: PartnershipHealthGrossData; sources: HealthInsuranceSourceOption[]; onChange: (data: PartnershipHealthGrossData | undefined) => void;
}) {
  const partnerships = sources.filter(source => source.kind === 'partnership');
  if (!data) return partnerships.length ? <button type="button" onClick={() => onChange({ sourceTaxYear: '', sourceReference: '', sourceFactsConfirmed: null, statements: [] })}>Add partnership gross-income statements</button> : null;
  const update = (patch: Partial<PartnershipHealthGrossData>) => onChange({ ...data, ...patch });
  return <fieldset><legend>Actual partnership gross-income statements</legend>
    <p className="guided-hint">For a health deduction spanning businesses, use the partnership's attached statement of your share of business gross income. Net ordinary income and Box14 earnings are separate amounts. Select the original partnership to retain its identity and enter the actual gross statement.</p>
    <div className="guided-form-grid">
      <TextFact label="Gross statements source tax year" value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label="Gross statements source reference" value={data.sourceReference} onChange={sourceReference => update({ sourceReference })} />
    </div>
    {data.statements.map((row, index) => {
      const prefix = `Gross statement ${index + 1}`;
      const set = (patch: Partial<PartnershipHealthGrossStatementData>) => update({ statements: data.statements.map((entry, position) => position === index ? { ...entry, ...patch } : entry) });
      return <fieldset key={index}><legend>{prefix}</legend><div className="guided-form-grid">
        <label className="guided-field"><span className="guided-field-label">{prefix}: Original partnership</span><select className="guided-input" value={row.businessSourceId} onChange={event => {
          const source = partnerships.find(option => option.sourceId === event.target.value);
          set({ businessSourceId: event.target.value, accountHolder: source?.accountHolder ?? '', originalK1: source?.partnershipGrossOriginal ? structuredClone(source.partnershipGrossOriginal) : undefined });
        }}><option value="">Select the actual original</option>{row.businessSourceId && !partnerships.some(source => source.sourceId === row.businessSourceId) && <option value={row.businessSourceId}>Saved source needs reconciliation</option>}{partnerships.map(source => <option key={source.sourceId} value={source.sourceId}>{source.label} ({source.accountHolder === 'primary' ? 'you' : 'spouse'})</option>)}</select></label>
        <TextFact label={`${prefix}: Attachment reference`} value={row.sourceReference} onChange={sourceReference => set({ sourceReference })} />
        <CurrencyField label={`${prefix}: Actual business gross income`} value={row.grossIncome} onChange={grossIncome => set({ grossIncome })} />
        <BooleanFact label={`${prefix}: Statement covers only this ordinary business activity`} value={row.ordinaryActivityOnlyConfirmed} onChange={ordinaryActivityOnlyConfirmed => set({ ordinaryActivityOnlyConfirmed })} />
        <BooleanFact label={`${prefix}: All gross income for this activity is included`} value={row.allGrossIncomeIncludedConfirmed} onChange={allGrossIncomeIncludedConfirmed => set({ allGrossIncomeIncludedConfirmed })} />
        <BooleanFact label={`${prefix}: Statement checked after the last edit`} value={row.sourceFactsConfirmed} onChange={sourceFactsConfirmed => set({ sourceFactsConfirmed })} />
      </div>
      {row.originalK1 && <p className="guided-hint">Retained original: {row.originalK1.taxYear || 'Year unknown'}, {row.originalK1.partnershipName || 'Name unknown'}, {row.originalK1.accountHolder === 'primary' ? 'you' : row.originalK1.accountHolder === 'spouse' ? 'spouse' : 'owner unknown'}; ordinary income {row.originalK1.ordinaryIncome || 'unknown'}, Box14 {row.originalK1.selfEmploymentEarnings || 'unknown'}. Re-select the original after reconciling a changed source.</p>}
      <button type="button" onClick={() => update({ statements: data.statements.filter((_, position) => position !== index) })}>{prefix}: Remove statement</button></fieldset>;
    })}
    <button type="button" onClick={() => update({ statements: [...data.statements, { businessSourceId: '', accountHolder: '', sourceReference: '', sourceFactsConfirmed: null, grossIncome: '', ordinaryActivityOnlyConfirmed: null, allGrossIncomeIncludedConfirmed: null }] })}>Add actual partnership gross statement</button>
    <BooleanFact label="Gross statements checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    <button type="button" onClick={() => onChange(undefined)}>Remove partnership gross-income statements</button>
  </fieldset>;
}
