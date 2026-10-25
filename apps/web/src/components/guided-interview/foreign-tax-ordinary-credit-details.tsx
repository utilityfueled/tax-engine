"use client";
import type { ForeignOrdinaryCreditData, ForeignOrdinaryIncomeData, ForeignOrdinaryPriorData } from '@/lib/guided-foreign-tax-ordinary-credit';
import { foreignCarryoverStatements, snapshotForeignCarryoverIncome } from '@/lib/guided-foreign-tax-carryover';
import type { InvestmentData } from '@/lib/guided-investment-facts';
import { ForeignTaxDirectCreditDetails } from './foreign-tax-direct-credit-details';
import { ForeignTaxItemizedAllocationDetails } from './foreign-tax-itemized-allocation-details';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';
function Choice({ label, value, options, onChange }: { label: string; value?: string; options: readonly (readonly [string, string])[]; onChange: (value: string | undefined) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value || undefined)}><option value="">Not answered</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
export function ForeignTaxOrdinaryCreditDetails({ data, investment, onChange }: { data?: ForeignOrdinaryCreditData; investment?: InvestmentData; onChange: (data: ForeignOrdinaryCreditData | undefined) => void }) {
  if (!data) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add ordinary Form 1116 worksheet</button>;
  const update = (patch: Partial<ForeignOrdinaryCreditData>) => {
    const next = { ...data, ...patch, sourceFactsConfirmed: null };
    if ('incomeSources' in patch && next.itemizedAllocation) next.itemizedAllocation = { ...next.itemizedAllocation, sourceFactsConfirmed: undefined,
      stateAllocation: next.itemizedAllocation.stateAllocation ? { ...next.itemizedAllocation.stateAllocation, sourceFactsConfirmed: undefined } : undefined,
      stateIncomeTaxes: next.itemizedAllocation.stateIncomeTaxes?.map(row => ({ ...row, countryIncomeConfirmed: undefined })) };
    onChange(next);
  };
  const statements = foreignCarryoverStatements(investment);
  const income = (index: number, patch: Partial<ForeignOrdinaryIncomeData>) => update({ incomeSources: data.incomeSources?.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const amt = data.amt;
  const updateAmt = (patch: Partial<NonNullable<typeof amt>>) => update({ amt: { ...amt, ...patch, sourceFactsConfirmed: undefined } });
  const capacity = (key: 'regularCarryback' | 'amtCarryback', title: 'Regular' | 'AMT') => {
    const record = data[key]; const edit = (patch: Partial<ForeignOrdinaryPriorData>) => update({ [key]: { ...record, ...patch, sourceFactsConfirmed: undefined } });
    if (!record) return <button type="button" className="utility-button" onClick={() => update({ [key]: {} })}>Add {title} prior-year capacity</button>;
    return <fieldset className="guided-fieldset"><legend>{title} actual prior-year capacity</legend>
      <p className="guided-hint">Required if current eligible tax exceeds this year&apos;s {title} limit. Use the completed preceding return, with all earlier claims and changes included. An absent worksheet is not zero capacity.</p>
      <TextFact label={`${title} prior capacity tax year`} value={record.taxYear ?? ''} onChange={taxYear => edit({ taxYear })} />
      <Choice label={`${title} prior capacity election`} value={record.election} options={[
        ['form1116_credit', 'Actual Form 1116 credit'], ['direct_credit_election', 'Actual election without Form 1116'], ['deduction', 'Deduction requiring separate hypothetical treatment'],
      ]} onChange={election => edit({ election: election as ForeignOrdinaryPriorData['election'] })} />
      {([['limitation', 'limitation'], ['currentTaxes', 'current taxes'], ['priorCarryoversUsed', 'prior credits used']] as const).map(([field, label]) => <CurrencyField key={field} label={`${title} prior capacity ${label}`} value={record[field] ?? ''} onChange={value => edit({ [field]: value })} />)}
      <TextFact label={`${title} prior capacity source reference`} value={record.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
      <BooleanFact label={`${title} prior capacity includes all prior use`} value={record.allPriorUseIncludedConfirmed} onChange={value => edit({ allPriorUseIncludedConfirmed: value ?? undefined })} />
      <BooleanFact label={`${title} prior capacity sources checked`} value={record.sourceFactsConfirmed} onChange={value => update({ [key]: { ...record, sourceFactsConfirmed: value ?? undefined } })} />
      <button type="button" className="utility-button" onClick={() => update({ [key]: undefined })}>Remove {title} prior-year capacity</button>
    </fieldset>;
  };
  return <fieldset className="guided-fieldset"><legend>Actual ordinary Form 1116 sources</legend>
    <p className="guided-hint">Use actual ordinary passive income and paid-tax sources. Regular and AMT credits have separate limits and histories. The return calculates current limits; do not enter an estimated current limit. Preferential income, mixed passive groups and special source adjustments need their separate methods. See <a href="https://www.irs.gov/instructions/i1116" target="_blank" rel="noreferrer">IRS Form 1116 instructions</a>.</p>
    <ForeignTaxDirectCreditDetails mode="ordinary" data={data} onChange={common => common && update(common)} />
    <TextFact label="Ordinary credit source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => update({ sourceTaxYear })} />
    <Choice label="Ordinary credit calculation method" value={data.method} options={[["ordinary_passive", "Ordinary passive qualified-payee sources"]]} onChange={method => update({ method: method as ForeignOrdinaryCreditData['method'] })} />
    {([
      ['allForeignIncomeSourcesIncludedConfirmed', 'All foreign income sources are recorded in this worksheet'],
      ['noForeignOrDomesticLossAccountsConfirmed', 'No foreign or domestic loss-account adjustments apply'],
      ['noCfcOrQbuIncomeConfirmed', 'No CFC or qualified business-unit sources apply'],
    ] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={data[key]} onChange={value => update({ [key]: value ?? undefined })} />)}
    <fieldset className="guided-fieldset"><legend>Actual ordinary foreign income</legend>
      <p className="guided-hint">Select each original statement, including foreign income with no foreign tax. Enter its actual foreign portion and prescribed passive group. A statement total does not establish the foreign portion or grouping.</p>
      {(data.incomeSources ?? []).map((row, index) => <fieldset className="guided-fieldset" key={index}><legend>Ordinary income {index + 1}</legend>
        <Choice label={`Ordinary income statement ${index + 1}`} value={row.sourceId} options={statements.map(source => [source.sourceId, `${source.entry.payer} — ${source.entry.accountReference ?? 'Account reference missing'}`])} onChange={sourceId => {
          const source = statements.find(item => item.sourceId === sourceId); update({ incomeSources: data.incomeSources?.map((item, i) => i === index ? source ? snapshotForeignCarryoverIncome(source) : {} : item) });
        }} />
        <CurrencyField label={`Ordinary income ${index + 1} foreign amount`} value={row.foreignIncome ?? ''} onChange={foreignIncome => income(index, { foreignIncome })} />
        <Choice label={`Ordinary income ${index + 1} passive group`} value={row.passiveGroup} options={[
          ['withholding_15_or_more', 'Subject to foreign withholding of at least 15%'], ['withholding_under_15', 'Subject to foreign withholding below 15%'],
          ['no_foreign_tax', 'Not subject to foreign tax'], ['other_foreign_tax', 'Subject to other foreign tax'],
        ]} onChange={passiveGroup => income(index, { passiveGroup: passiveGroup as ForeignOrdinaryIncomeData['passiveGroup'] })} />
        <TextFact label={`Ordinary income ${index + 1} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => income(index, { sourceReference })} />
        <button type="button" className="utility-button" onClick={() => update({ incomeSources: data.incomeSources?.filter((_, i) => i !== index) })}>Remove ordinary income {index + 1}</button>
      </fieldset>)}
      <button type="button" className="utility-button" onClick={() => update({ incomeSources: [...(data.incomeSources ?? []), {}] })}>Add ordinary foreign income statement</button>
    </fieldset>
    <fieldset className="guided-fieldset"><legend>Actual AMT sources and election history</legend>
      <BooleanFact label="AMT foreign amounts match the actual regular source amounts" value={amt?.foreignAmountsSameAsRegularConfirmed} onChange={value => updateAmt({ foreignAmountsSameAsRegularConfirmed: value ?? undefined })} />
      <TextFact label="First post-1997 AMT foreign-credit claim year" value={amt?.firstPost1997CreditClaimTaxYear ?? ''} onChange={firstPost1997CreditClaimTaxYear => updateAmt({ firstPost1997CreditClaimTaxYear })} />
      <BooleanFact label="Simplified AMT election was made in the first claim year" value={amt?.simplifiedElectionMadeInFirstClaimYear} onChange={value => updateAmt({ simplifiedElectionMadeInFirstClaimYear: value ?? undefined })} />
      <BooleanFact label="No revocation of that AMT election applies" value={amt?.noRevocationConfirmed} onChange={value => updateAmt({ noRevocationConfirmed: value ?? undefined })} />
      <TextFact label="AMT source and election history reference" value={amt?.sourceReference ?? ''} onChange={sourceReference => updateAmt({ sourceReference })} />
      <BooleanFact label="AMT source history checked after the last edit" value={amt?.sourceFactsConfirmed} onChange={value => update({ amt: { ...amt, sourceFactsConfirmed: value ?? undefined } })} />
    </fieldset>
    {capacity('regularCarryback', 'Regular')}{capacity('amtCarryback', 'AMT')}
    <ForeignTaxItemizedAllocationDetails purpose="credit" allocation={data.itemizedAllocation} onChange={itemizedAllocation => update({ itemizedAllocation })} />
    <BooleanFact label="Ordinary credit sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove ordinary Form 1116 worksheet</button>
  </fieldset>;
}
