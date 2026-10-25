"use client";

import { captureIraBasisDistributions, iraOrdinaryQuestions, type GuidedIraBasisData, type IraBasisOwnerData, type IraBasisHistoryData, type IraBasisAccountData } from '@/lib/guided-ira-basis';
import type { RetirementEntryData } from '@/lib/guided-interview-flow';
import { CurrencyField } from './currency-field';

function Text({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)} /></label>;
}
function Choice({ label, value, choices, onChange }: { label: string; value?: string; choices: ReadonlyArray<readonly [string, string]>; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}><option value="">Choose from actual records</option>{choices.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
function Fact({ label, value, onChange }: { label: string; value?: boolean | null; onChange: (value: boolean | null) => void }) {
  return <Choice label={label} value={value == null ? '' : String(value)} choices={[["true", "Yes"], ["false", "No"]]} onChange={value => onChange(value === '' ? null : value === 'true')} />;
}

export function IraBasisSourceFields({ data, entries, onChange }: { data?: GuidedIraBasisData; entries: RetirementEntryData[]; onChange: (value: GuidedIraBasisData | undefined) => void }) {
  if (!data) return <div className="guided-question"><p className="guided-hint">Ordinary traditional, SEP and SIMPLE IRA distributions can use actual separate-owner basis history and December 31 account values. Keep unknown printed taxable amounts blank.</p><button type="button" className="utility-button" onClick={() => onChange({})}>Add ordinary IRA basis records</button></div>;
  function update(patch: Partial<GuidedIraBasisData>) { onChange({ ...data, sourceFactsConfirmed: null, ...patch }); }
  function owner(index: number, patch: Partial<IraBasisOwnerData>) { update({ owners: data?.owners?.map((row, i) => i === index ? { ...row, ...patch } : row) }); }
  function history(index: number, patch: Partial<IraBasisHistoryData>) { owner(index, { basisHistory: { ...data?.owners?.[index]?.basisHistory, ...patch } }); }
  function account(ownerIndex: number, index: number, patch: Partial<IraBasisAccountData>) { owner(ownerIndex, { accounts: data?.owners?.[ownerIndex]?.accounts?.map((row, i) => i === index ? { ...row, ...patch } : row) }); }
  return <details className="guided-expand" open>
    <summary className="guided-expand-trigger">Ordinary IRA basis and account sources</summary>
    <div className="guided-expand-body">
      <p className="guided-hint">Enter each owner separately and include every traditional, SEP and SIMPLE account, including accounts with no distributions. Prior basis comes from actual reviewed records. Contributions, conversions, inherited accounts and other special methods require their own worksheets.</p>
      <Text label="IRA basis packet tax year" value={data.sourceTaxYear} onChange={value => update({ sourceTaxYear: value })} />
      <Text label="IRA basis packet source reference" value={data.sourceReference} onChange={value => update({ sourceReference: value })} />
      {(data.owners ?? []).map((row, index) => {
        const prefix = `Owner #${index + 1}`;
        return <fieldset className="guided-question" key={index}><legend>{prefix} IRA history</legend>
          <Choice label={`IRA owner #${index + 1}`} value={row.accountHolder} choices={[["primary", "Primary taxpayer"], ["spouse", "Spouse"]]} onChange={value => owner(index, { accountHolder: value as IraBasisOwnerData['accountHolder'] })} />
          {([['firstName', 'first name as filed'], ['lastName', 'last name as filed'], ['dateOfBirth', 'date of birth (YYYY-MM-DD)'], ['ssnLast4', 'SSN last four digits']] as const).map(([key, label]) => <Text key={key} label={`${prefix} ${label}`} value={row.identity?.[key]} onChange={value => owner(index, { identity: { ...row.identity, [key]: value } })} />)}
          <Choice label={`${prefix} prior basis method`} value={row.basisHistory?.method} choices={[["confirmed_zero", "Complete prior records establish zero basis"], ["prior_form_8606", "Most recent prior Form 8606"]]} onChange={value => history(index, { method: value as IraBasisHistoryData['method'] })} />
          <Text label={`${prefix} prior basis source reference`} value={row.basisHistory?.sourceReference} onChange={value => history(index, { sourceReference: value })} />
          {row.basisHistory?.method === 'prior_form_8606' && <>
            <Text label={`${prefix} prior Form 8606 tax year`} value={row.basisHistory.sourceTaxYear} onChange={value => history(index, { sourceTaxYear: value })} />
            <CurrencyField label={`${prefix} prior Form 8606 line 14`} value={row.basisHistory.line14 ?? ''} onChange={value => history(index, { line14: value })} required />
            <CurrencyField label={`${prefix} prior line 15c worksheet adjustment`} value={row.basisHistory.line15cWorksheetAdjustment ?? ''} onChange={value => history(index, { line15cWorksheetAdjustment: value })} required />
            <Fact label={`${prefix} this is the most recent applicable Form 8606`} value={row.basisHistory.mostRecentFormConfirmed} onChange={value => history(index, { mostRecentFormConfirmed: value })} />
          </>}
          {row.basisHistory?.method === 'confirmed_zero' && [row.basisHistory.sourceTaxYear, row.basisHistory.line14, row.basisHistory.line15cWorksheetAdjustment].some(value => value?.trim()) && <div><p className="guided-hint">Saved prior-form fields still need reconciliation with the zero-basis method. Switch back to review them, or explicitly clear them after checking the records.</p><button type="button" className="utility-button" onClick={() => history(index, { sourceTaxYear: '', line14: '', line15cWorksheetAdjustment: '', mostRecentFormConfirmed: null })}>Clear saved prior-form fields for owner #{index + 1}</button></div>}
          <Fact label={`${prefix} all prior basis records reviewed`} value={row.basisHistory?.allPriorRecordsReviewed} onChange={value => history(index, { allPriorRecordsReviewed: value })} />
          <Fact label={`${prefix} any basis changes since that return or reviewed history`} value={row.basisHistory?.basisChangesSinceThatReturn} onChange={value => history(index, { basisChangesSinceThatReturn: value })} />
          {iraOrdinaryQuestions.map(([key, label]) => <Fact key={key} label={`${prefix}: ${label}`} value={row.ordinaryFacts?.[key]} onChange={value => owner(index, { ordinaryFacts: { ...row.ordinaryFacts, [key]: value } })} />)}
          {(row.accounts ?? []).map((record, accountIndex) => {
            const name = `${prefix} account #${accountIndex + 1}`;
            return <fieldset className="guided-question" key={accountIndex}><legend>{name}</legend>
              {([['accountId', 'local account ID'], ['sourceTaxYear', 'statement tax year'], ['custodian', 'custodian name'], ['custodianTin', 'custodian TIN'], ['accountReference', 'account reference'], ['sourceReference', 'December 31 statement reference']] as const).map(([key, label]) => <Text key={key} label={`${name} ${label}`} value={record[key]} onChange={value => account(index, accountIndex, { [key]: value })} />)}
              <Choice label={`${name} IRA type`} value={record.accountType} choices={[["traditional", "Traditional IRA"], ["sep", "SEP IRA"], ["simple", "SIMPLE IRA"]]} onChange={value => account(index, accountIndex, { accountType: value as IraBasisAccountData['accountType'] })} />
              <CurrencyField label={`${name} year-end value`} value={record.yearEndValue ?? ''} onChange={value => account(index, accountIndex, { yearEndValue: value })} required />
              <button type="button" className="utility-button" onClick={() => owner(index, { accounts: row.accounts?.filter((_, i) => i !== accountIndex) })}>Remove account #{accountIndex + 1} for owner #{index + 1}</button>
            </fieldset>;
          })}
          <button type="button" className="utility-button" onClick={() => owner(index, { accounts: [...(row.accounts ?? []), {}] })}>Add account for owner #{index + 1}</button>
          <button type="button" className="utility-button" onClick={() => update({ owners: data.owners?.filter((_, i) => i !== index) })}>Remove IRA owner #{index + 1}</button>
        </fieldset>;
      })}
      <button type="button" className="utility-button" disabled={(data.owners?.length ?? 0) >= 2} onClick={() => update({ owners: [...(data.owners ?? []), {}] })}>Add IRA owner</button>
      <p className="guided-hint">Copy the entered IRA source forms below, then link each original statement to its actual account. Replacing links preserves the original printed amounts and clears saved account links for review.</p>
      <button type="button" className="utility-button" onClick={() => update({ distributions: captureIraBasisDistributions(entries), allDistributionsIncluded: null })}>Replace distribution links from current 1099-R sources</button>
      {(data.distributions ?? []).map((record, index) => <fieldset className="guided-question" key={index}><legend>IRA distribution link #{index + 1}</legend>
        <p className="guided-hint">{record.sourceId || 'Unknown original source'} · {record.accountHolder || 'Unknown owner'} · {record.payer || 'Unknown payer'} · {record.sourceTaxYear || 'Unknown year'}. Gross: {record.grossDistribution || 'Unknown'}; printed Box 2a: {record.taxableAmount?.trim() || 'Unknown'}. Update the original 1099-R and replace links to change these amounts.</p>
        <Choice label={`Distribution #${index + 1} actual account ID`} value={record.accountId} choices={(data.owners ?? []).filter(item => item.accountHolder === record.accountHolder).flatMap(item => (item.accounts ?? []).filter(item => item.accountId?.trim()).map(item => [item.accountId!, `${item.accountId} — ${item.custodian ?? ''} ${item.accountReference ?? ''}`] as const))} onChange={value => update({ distributions: data.distributions?.map((row, i) => i === index ? { ...row, accountId: value } : row) })} />
        <Text label={`Distribution #${index + 1} original statement reference`} value={record.sourceReference} onChange={value => update({ distributions: data.distributions?.map((row, i) => i === index ? { ...row, sourceReference: value } : row) })} />
      </fieldset>)}
      <Fact label="All IRA owners and accounts included" value={data.allIraOwnersAndAccountsIncluded} onChange={value => update({ allIraOwnersAndAccountsIncluded: value })} />
      <Fact label="All original IRA distributions linked" value={data.allDistributionsIncluded} onChange={value => update({ allDistributionsIncluded: value })} />
      <Fact label="All IRA basis sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={value => update({ sourceFactsConfirmed: value })} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove ordinary IRA basis records</button>
    </div>
  </details>;
}
