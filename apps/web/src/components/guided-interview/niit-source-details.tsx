"use client";

import type { RetirementEntryData } from '@/lib/guided-interview-flow';
import { niitTaxCategories, snapshotGuidedNiitAnnuity, type NiitAnnuityData, type NiitSourceData } from '@/lib/guided-niit-facts';
import { isStartedRetirement } from '@/lib/guided-retirement-facts';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

export function NiitSourceDetails({ data, entries, onChange }: { data?: NiitSourceData; entries?: RetirementEntryData[]; onChange: (data: NiitSourceData | undefined) => void }) {
  if (!data) return <div className="guided-w2-card" style={{ padding: '12px' }}><h3 className="guided-w2-card-title">Net investment income tax source worksheet</h3><p className="guided-hint">Add actual pension or annuity classifications and investment-related tax deductions when they apply.</p><button type="button" className="utility-button" onClick={() => onChange({})}>Add NIIT source worksheet</button></div>;
  const statements = (entries ?? []).filter(isStartedRetirement);
  const update = (changes: Partial<NiitSourceData>) => onChange({ ...data, ...changes, sourceFactsConfirmed: null });
  const changeAnnuity = (index: number, changes: Partial<NiitAnnuityData>) => update({ annuities: data.annuities?.map((source, offset) => offset === index ? { ...source, ...changes } : source) });
  return <div className="guided-w2-card" style={{ padding: '12px' }}>
    <h3 className="guided-w2-card-title">Net investment income tax source worksheet</h3>
    <p className="guided-hint">Use actual statements, plan documents and completed tax allocations. Leave unknown answers blank. Enter 0 only when records establish zero. Source amounts are reconciled with the return before calculation. See <a href="https://www.irs.gov/instructions/i8960" target="_blank" rel="noreferrer">Form 8960 instructions</a>.</p>
    <TextFact label="NIIT source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => update({ sourceTaxYear })} />
    <TextFact label="NIIT source worksheet reference" value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
    <fieldset className="guided-fieldset"><legend>Pension and annuity classifications</legend>
      <p className="guided-hint">Code 7 alone does not show whether a pension or annuity comes from an excluded retirement plan. Code D identifies a nonqualified annuity or insurance distribution; its taxable amount can be subject to NIIT.</p>
      {(data.annuities ?? []).map((source, index) => <fieldset className="guided-fieldset" key={index}><legend>Statement {index + 1}</legend>
        <label className="guided-field"><span className="guided-field-label">Actual retirement statement {index + 1}</span><select className="guided-input" value={source.sourceId ?? ''} onChange={event => {
          const sourceIndex = statements.findIndex((_, offset) => `form1099R:${offset}` === event.target.value);
          const entry = statements[sourceIndex];
          update({ annuities: data.annuities?.map((row, offset) => offset === index ? (entry ? snapshotGuidedNiitAnnuity(entry, sourceIndex) : {}) : row) });
        }}><option value="">Select an actual statement</option>{statements.map((entry, offset) => <option key={offset} value={`form1099R:${offset}`}>{offset + 1}: {entry.payer} — {entry.accountHolder === 'primary' ? 'You' : entry.accountHolder === 'spouse' ? 'Spouse' : 'Owner unresolved'} — {entry.accountReference}</option>)}</select></label>
        {source.sourceId && <p className="guided-hint">Selected source: {source.payerName}; gross {source.grossDistribution ?? 'unknown'}; taxable {source.taxableAmount ?? 'unknown'}. Changes to this statement require reconfirmation.</p>}
        <label className="guided-field"><span className="guided-field-label">Statement {index + 1} NIIT classification</span><select className="guided-input" value={source.classification ?? ''} onChange={event => changeAnnuity(index, { classification: (event.target.value || undefined) as NiitAnnuityData['classification'], excludedPlanSection: undefined })}><option value="">Confirm from plan records</option><option value="nonqualified_annuity">Nonqualified annuity or insurance distribution</option><option value="excluded_retirement_plan">Excluded retirement plan</option></select></label>
        {source.classification === 'excluded_retirement_plan' && <label className="guided-field"><span className="guided-field-label">Statement {index + 1} actual plan section</span><select className="guided-input" value={source.excludedPlanSection ?? ''} onChange={event => changeAnnuity(index, { excludedPlanSection: (event.target.value || undefined) as NiitAnnuityData['excludedPlanSection'] })}><option value="">Confirm from plan records</option>{[['401', 'Section 401 (including 401(k))'], ['403a', 'Section 403(a)'], ['403b', 'Section 403(b)'], ['408', 'Section 408 IRA'], ['408A', 'Section 408A Roth IRA'], ['457b', 'Eligible governmental 457(b)']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <TextFact label={`Statement ${index + 1} contract or plan reference`} value={source.sourceReference ?? ''} onChange={sourceReference => changeAnnuity(index, { sourceReference })} />
        <button type="button" className="utility-button" onClick={() => update({ annuities: data.annuities?.filter((_, offset) => offset !== index) })}>Remove annuity classification {index + 1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={() => update({ annuities: [...(data.annuities ?? []), {}] })}>Add annuity classification</button>
    </fieldset>
    {data.ordinaryTaxAllocation ? <fieldset className="guided-fieldset"><legend>Tax expenses allocable to investment income</legend>
      <p className="guided-hint">Use a documented reasonable allocation. Enter each category's source amount and actual allowed deduction after the SALT limit. Allocations cannot reuse amounts deducted by a business or rental. Sales taxes do not reduce NIIT. Foreign taxes and recovery-year adjustments require separate source worksheets.</p>
      {niitTaxCategories.map(([key, label]) => <fieldset className="guided-fieldset" key={key}><legend>{label}</legend>{([['sourceAmount', 'source amount before SALT limit'], ['regularDeductibleAmount', 'allowed regular deduction after SALT limit'], ['investmentAllocableAmount', 'investment allocation']] as const).map(([field, suffix]) => <CurrencyField key={field} label={`${label} ${suffix}`} value={data.ordinaryTaxAllocation?.[key]?.[field] ?? ''} onChange={value => update({ ordinaryTaxAllocation: { ...data.ordinaryTaxAllocation, [key]: { ...data.ordinaryTaxAllocation?.[key], [field]: value } } })} />)}</fieldset>)}
      <TextFact label="Tax allocation method and source explanation" value={data.ordinaryTaxAllocation.allocationMethodDescription ?? ''} onChange={allocationMethodDescription => update({ ordinaryTaxAllocation: { ...data.ordinaryTaxAllocation, allocationMethodDescription } })} />
      <BooleanFact label="These tax expenses are not deducted elsewhere in the return" value={data.ordinaryTaxAllocation.noDuplicateDeductionConfirmed} onChange={noDuplicateDeductionConfirmed => update({ ordinaryTaxAllocation: { ...data.ordinaryTaxAllocation, noDuplicateDeductionConfirmed: noDuplicateDeductionConfirmed ?? undefined } })} />
      <button type="button" className="utility-button" onClick={() => update({ ordinaryTaxAllocation: undefined })}>Remove allocable tax worksheet</button>
    </fieldset> : <button type="button" className="utility-button" onClick={() => update({ ordinaryTaxAllocation: {} })}>Add allocable tax worksheet</button>}
    {data.itemizedAllocation ? <fieldset className="guided-fieldset"><legend>Final itemized deduction limit allocation</legend><p className="guided-hint">Complete this only when the final itemized deduction limit reduces multiple NIIT deductions. Use the actual allowed components from that worksheet.</p>{([['investmentInterest', 'Final investment interest allocation'], ['investmentIncomeTaxes', 'Final investment tax allocation'], ['ordinaryLoss', 'Final ordinary-loss allocation']] as const).map(([key, label]) => <CurrencyField key={key} label={label} value={data.itemizedAllocation?.[key] ?? ''} onChange={value => update({ itemizedAllocation: { ...data.itemizedAllocation, [key]: value } })} />)}<button type="button" className="utility-button" onClick={() => update({ itemizedAllocation: undefined })}>Remove final itemized allocation</button></fieldset> : <button type="button" className="utility-button" onClick={() => update({ itemizedAllocation: {} })}>Add final itemized allocation</button>}
    <BooleanFact label="NIIT sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove NIIT source worksheet</button>
  </div>;
}
