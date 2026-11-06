"use client";

import type { ForeignDirectCreditData, ForeignDirectCarryData } from '@/lib/guided-foreign-tax-direct-credit';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

export function ForeignTaxDirectCreditDetails({ data, onChange, mode = 'direct' }: {
  data?: ForeignDirectCreditData;
  mode?: 'direct' | 'ordinary';
  onChange: (data: ForeignDirectCreditData | undefined) => void;
}) {
  if (!data) return <div className="guided-w2-card" style={{ padding: '12px' }}>
    <h4 className="guided-w2-card-title">Credit without Form 1116</h4>
    <p className="guided-hint">A small tax amount does not make the election automatically. Record the actual election and eligibility from the original return and source records.</p>
    <button type="button" className="utility-button" onClick={() => onChange({})}>Add election without Form 1116</button>
  </div>;
  const update = (changes: Partial<ForeignDirectCreditData>) => onChange({ ...data, ...changes, sourceFactsConfirmed: null });
  const history = (key: 'carryovers' | 'amtCarryovers', title: 'Regular' | 'AMT') => {
    const updateRow = (index: number, changes: Partial<ForeignDirectCarryData>) => update({ [key]: data[key]?.map((row, offset) => offset === index ? { ...row, ...changes } : row) });
    return <fieldset className="guided-fieldset"><legend>{title} prior credits</legend>
      {(data[key] ?? []).map((row, index) => <fieldset className="guided-fieldset" key={index}><legend>{title} prior credit {index + 1}</legend>
        <TextFact label={`${title} prior credit ${index + 1} origin year`} value={row.originTaxYear ?? ''} onChange={originTaxYear => updateRow(index, { originTaxYear })} />
        <label className="guided-field"><span className="guided-field-label">{title} prior credit {index + 1} category</span><select className="guided-input" value={row.category ?? ''} onChange={event => updateRow(index, { category: (event.target.value || undefined) as ForeignDirectCarryData['category'] })}><option value="">Not answered</option><option value="passive">Passive income</option><option value="general">General income</option></select></label>
        <CurrencyField label={`${title} prior credit ${index + 1} adjusted balance`} value={row.amount ?? ''} onChange={amount => updateRow(index, { amount })} />
        <TextFact label={`${title} prior credit ${index + 1} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => updateRow(index, { sourceReference })} />
        <button type="button" className="utility-button" onClick={() => update({ [key]: data[key]?.filter((_, offset) => offset !== index) })}>Remove {title.toLowerCase()} prior credit {index + 1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={() => update({ [key]: [...(data[key] ?? []), {}] })}>Add {title === 'AMT' ? 'AMT' : 'regular'} prior credit</button>
      {data[key] === undefined && <button type="button" className="utility-button" onClick={() => update({ [key]: [] })}>Confirm no {title === 'AMT' ? 'AMT' : 'regular'} prior credits</button>}
      {data[key]?.length === 0 && <p className="guided-hint">The actual {title} ledger is recorded as empty. Keep the supporting history reference.</p>}
    </fieldset>;
  };
  return <fieldset className="guided-fieldset"><legend>{mode === 'direct' ? 'Actual election without Form 1116' : 'Ordinary credit eligibility and prior records'}</legend>
    {mode === 'direct' && <p className="guided-hint">This method covers eligible passive income on qualified payee statements, with combined actual tax no more than $300, or $600 for a married joint return. Prior regular and AMT credits cannot be used this year, and unused current tax creates no carry. Existing prior balances still age and expire. See <a href="https://www.irs.gov/instructions/i1116" target="_blank" rel="noreferrer">IRS Form 1116 instructions</a>.</p>}
    <BooleanFact label={mode === 'direct' ? 'The taxpayer elects the credit without Form 1116' : 'The taxpayer elects the ordinary Form 1116 credit'} value={data.electionConfirmed} onChange={value => update({ electionConfirmed: value ?? undefined })} />
    <label className="guided-field"><span className="guided-field-label">Return on which the election is made</span><select className="guided-input" value={data.filingContext ?? ''} onChange={event => update({ filingContext: (event.target.value || undefined) as ForeignDirectCreditData['filingContext'] })}><option value="">Not answered</option><option value="original_return">Original return</option><option value="amended_return">Amended return requiring separate treatment</option></select></label>
    <TextFact label={mode === 'direct' ? 'Direct-credit election source reference' : 'Ordinary credit source reference'} value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
    {([
      ['allForeignGrossIncomePassiveConfirmed', 'All foreign gross income is passive income'],
      ['allForeignIncomeOnQualifiedPayeeStatementsConfirmed', 'All foreign income and taxes are on qualified payee statements'],
      ['noRequiredTaxReductionsConfirmed', 'No required foreign-credit reduction applies'],
      ['carryoverHistoryConfirmed', 'Prior regular and AMT credit history is complete'],
    ] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={data[key]} onChange={value => update({ [key]: value ?? undefined })} />)}
    <fieldset className="guided-fieldset"><legend>Actual taxpayer status</legend>
      <p className="guided-hint">Record the primary taxpayer and, on a joint return, the spouse. Do not infer residency or citizenship from filing status.</p>
      {(data.taxpayers ?? []).map((row, index) => <fieldset className="guided-fieldset" key={index}><legend>Taxpayer status {index + 1}</legend>
        <label className="guided-field"><span className="guided-field-label">Taxpayer status {index + 1} owner</span><select className="guided-input" value={row.owner ?? ''} onChange={event => update({ taxpayers: data.taxpayers?.map((item, offset) => offset === index ? { ...item, owner: (event.target.value || undefined) as typeof row.owner } : item) })}><option value="">Not answered</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse</option></select></label>
        <label className="guided-field"><span className="guided-field-label">Taxpayer status {index + 1} actual status</span><select className="guided-input" value={row.status ?? ''} onChange={event => update({ taxpayers: data.taxpayers?.map((item, offset) => offset === index ? { ...item, status: (event.target.value || undefined) as typeof row.status } : item) })}><option value="">Not answered</option><option value="us_citizen">U.S. citizen</option><option value="full_year_resident_alien">Full-year resident alien</option><option value="other">Other status requiring separate treatment</option></select></label>
        <TextFact label={`Taxpayer status ${index + 1} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => update({ taxpayers: data.taxpayers?.map((item, offset) => offset === index ? { ...item, sourceReference } : item) })} />
        <button type="button" className="utility-button" onClick={() => update({ taxpayers: data.taxpayers?.filter((_, offset) => offset !== index) })}>Remove taxpayer status {index + 1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={() => update({ taxpayers: [...(data.taxpayers ?? []), {}] })}>Add taxpayer status</button>
    </fieldset>
    <TextFact label="Prior credits adjusted through tax year" value={data.adjustedThroughTaxYear ?? ''} onChange={adjustedThroughTaxYear => update({ adjustedThroughTaxYear })} />
    <label className="guided-field"><span className="guided-field-label">Prior credit filing history</span><select className="guided-input" value={data.filingHistory ?? ''} onChange={event => update({ filingHistory: (event.target.value || undefined) as ForeignDirectCreditData['filingHistory'] })}><option value="">Not answered</option><option value="continuous_individual">Continuous individual history</option><option value="continuous_joint_same_spouse">Continuous joint history with the same spouse</option><option value="changed">Changed filing history requiring allocation</option></select></label>
    {history('carryovers', 'Regular')}{history('amtCarryovers', 'AMT')}
    {mode === 'direct' && <><BooleanFact label="Direct-credit election facts checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove election without Form 1116</button></>}
  </fieldset>;
}
