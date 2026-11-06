"use client";

import type { InvestmentData } from '@/lib/guided-investment-facts';
import { captureCurrentCapitalRecords, type CurrentCapitalSourceData, type CurrentCapitalTransactionData, type CurrentCapitalDistributionData } from '@/lib/guided-current-capital-origin';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}><option value="">Choose from actual records</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
const owners: [string, string][] = [['primary', 'Primary taxpayer'], ['spouse', 'Spouse on the actual joint return']];

export function CurrentCapitalOriginDetails({ data, investments, onChange }: { data?: CurrentCapitalSourceData; investments?: InvestmentData; onChange: (data: CurrentCapitalSourceData | undefined) => void }) {
  const change = (patch: Partial<CurrentCapitalSourceData>) => onChange({ ...data, ...patch });
  const changeTransaction = (index: number, patch: Partial<CurrentCapitalTransactionData>) => change({ transactions: data?.transactions?.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const changeDistribution = (index: number, patch: Partial<CurrentCapitalDistributionData>) => change({ distributions: data?.distributions?.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const prior = data?.priorCapitalLosses, alternative = data?.alternativeTax;
  return <details className="guided-expand"><summary className="guided-expand-trigger">Current loss capital sources</summary><div className="guided-expand-body">
    <p className="guided-hint">Use the original brokerage and fund records, the filed capital-loss carry worksheet, and an independent AMT comparison. Copying records does not confirm their investment classification. A blank history is unknown; enter known zero explicitly.</p>
    <p className="guided-hint">Ordinary investments and supported qualified-small-business-stock exclusions use these records. Complete any stock issuer and ownership history in the investments section. Digital assets, collectibles, business or property dispositions, different AMT treatment, and a negative capital net with a positive stock exclusion need separate origin methods.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add current capital source packet</button> : <>
      <div className="guided-form-grid">
        <TextFact label="Current capital source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => change({ sourceTaxYear })} />
        <TextFact label="Current capital packet reference" value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
        <BooleanFact label="All original current capital sources included" value={data.allCapitalSourcesIncluded} onChange={allCapitalSourcesIncluded => change({ allCapitalSourcesIncluded })} />
      </div>
      <button type="button" className="utility-button" onClick={() => change(captureCurrentCapitalRecords(investments))}>Copy original investment capital records</button>
      {(data.transactions === undefined || data.distributions === undefined) && <p role="status">The original capital source lists are unknown.</p>}
      {data.transactions?.length === 0 && <p>Explicitly recorded: no original brokerage dispositions.</p>}
      {data.distributions?.length === 0 && <p>Explicitly recorded: no original fund capital records.</p>}
      {(data.transactions ?? []).map((row, index) => {
        const prefix = `Capital disposition ${index + 1}`, transaction = row.transaction;
        const changeOriginal = (patch: Partial<NonNullable<CurrentCapitalTransactionData['transaction']>>) => changeTransaction(index, { transaction: { ...transaction, ...patch } });
        return <details className="guided-expand" key={index}><summary className="guided-expand-trigger">{prefix}</summary><div className="guided-expand-body"><div className="guided-form-grid">
          {([['sourceId', 'original source link'], ['sourceTaxYear', 'source tax year'], ['sourceReference', 'source reference'], ['statementSourceId', 'original statement identity'], ['payerName', 'original payer name'], ['accountReference', 'original account reference']] as const).map(([key, label]) => <TextFact key={key} label={`${prefix} ${label}`} value={row[key] ?? ''} onChange={value => changeTransaction(index, { [key]: value })} />)}
          <Choice label={`${prefix} original owner`} value={row.accountHolder} options={owners} onChange={value => changeTransaction(index, { accountHolder: value ? value as 'primary' | 'spouse' : undefined })} />
          <Choice label={`${prefix} actual character`} value={row.capitalCharacter} options={[
            ['ordinary_investment', 'Ordinary investment'], ['section1202', 'Qualified small business stock with actual issuer history'], ['collectible', 'Collectible — separate origin method required'],
          ]} onChange={value => changeTransaction(index, { capitalCharacter: value ? value as CurrentCapitalTransactionData['capitalCharacter'] : undefined })} />
          <BooleanFact label={`${prefix} is a nonbusiness investment`} value={row.nonbusinessInvestmentConfirmed} onChange={nonbusinessInvestmentConfirmed => changeTransaction(index, { nonbusinessInvestmentConfirmed })} />
          {([['description', 'original description'], ['dateAcquired', 'original acquisition date'], ['dateSold', 'original sale date']] as const).map(([key, label]) => <TextFact key={key} label={`${prefix} ${label}`} value={transaction?.[key] ?? ''} onChange={value => changeOriginal({ [key]: value })} />)}
          {([['proceeds', 'original proceeds'], ['costBasis', 'original basis'], ['adjustments', 'original other adjustments'], ['washSaleDisallowed', 'original disallowed wash loss']] as const).map(([key, label]) => <CurrencyField key={key} label={`${prefix} ${label}`} value={transaction?.[key] ?? ''} allowNegative={key === 'adjustments'} onChange={value => changeOriginal({ [key]: value })} />)}
          <Choice label={`${prefix} original holding period`} value={transaction?.holdingPeriod} options={[[ 'short', 'Short-term' ], [ 'long', 'Long-term' ]]} onChange={value => changeOriginal({ holdingPeriod: value ? value as 'short' | 'long' : undefined })} />
          {([['basisReportedToIRS', 'basis reported to the IRS'], ['washSale', 'has a wash sale'], ['digitalAsset', 'is a digital asset']] as const).map(([key, label]) => <BooleanFact key={key} label={`${prefix} ${label}`} value={transaction?.[key]} onChange={value => changeOriginal({ [key]: value })} />)}
        </div><button type="button" className="utility-button" onClick={() => change({ transactions: data.transactions?.filter((_, i) => i !== index) })}>Remove capital disposition {index + 1}</button></div></details>;
      })}
      {(data.distributions ?? []).map((row, index) => {
        const prefix = `Capital fund ${index + 1}`;
        return <details className="guided-expand" key={index}><summary className="guided-expand-trigger">{prefix}</summary><div className="guided-expand-body"><div className="guided-form-grid">
          {([['sourceId', 'original source link'], ['sourceTaxYear', 'source tax year'], ['sourceReference', 'source reference'], ['payerName', 'original payer name'], ['accountReference', 'original account reference']] as const).map(([key, label]) => <TextFact key={key} label={`${prefix} ${label}`} value={row[key] ?? ''} onChange={value => changeDistribution(index, { [key]: value })} />)}
          <Choice label={`${prefix} original owner`} value={row.accountHolder} options={owners} onChange={value => changeDistribution(index, { accountHolder: value ? value as 'primary' | 'spouse' : undefined })} />
          {([['totalCapitalGainDistributions', 'original Box 2a capital distributions'], ['section1250Gain', 'original Box 2b unrecaptured gain'], ['section1202Gain', 'original Box 2c stock gain'], ['collectiblesGain', 'original Box 2d collectibles gain']] as const).map(([key, label]) => <CurrencyField key={key} label={`${prefix} ${label}`} value={row[key] ?? ''} onChange={value => changeDistribution(index, { [key]: value })} />)}
          <BooleanFact label={`${prefix} is a nonbusiness investment`} value={row.nonbusinessInvestmentConfirmed} onChange={nonbusinessInvestmentConfirmed => changeDistribution(index, { nonbusinessInvestmentConfirmed })} />
        </div><button type="button" className="utility-button" onClick={() => change({ distributions: data.distributions?.filter((_, i) => i !== index) })}>Remove capital fund {index + 1}</button></div></details>;
      })}
      {!prior ? <button type="button" className="utility-button" onClick={() => change({ priorCapitalLosses: {} })}>Add filed capital carry history</button> : <fieldset><legend>Filed capital carry history</legend><div className="guided-form-grid">
        <TextFact label="Filed capital carry source tax year" value={prior.sourceTaxYear ?? ''} onChange={sourceTaxYear => change({ priorCapitalLosses: { ...prior, sourceTaxYear } })} />
        <TextFact label="Filed capital carry source reference" value={prior.sourceReference ?? ''} onChange={sourceReference => change({ priorCapitalLosses: { ...prior, sourceReference } })} />
        <CurrencyField label="Filed prior short-term capital loss" hint="Use the actual signed filed loss, or known zero." value={prior.shortTermCapitalLoss ?? ''} allowNegative onChange={shortTermCapitalLoss => change({ priorCapitalLosses: { ...prior, shortTermCapitalLoss } })} />
        <CurrencyField label="Filed prior long-term capital loss" hint="Use the actual signed filed loss, or known zero." value={prior.longTermCapitalLoss ?? ''} allowNegative onChange={longTermCapitalLoss => change({ priorCapitalLosses: { ...prior, longTermCapitalLoss } })} />
        {([['allCarryoversIncluded', 'All filed capital carry sources included'], ['sameReturnMembershipConfirmed', 'Prior capital carry represents the same return members'], ['nonbusinessInvestmentConfirmed', 'Prior capital carry is nonbusiness investment loss']] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={prior[key]} onChange={value => change({ priorCapitalLosses: { ...prior, [key]: value } })} />)}
      </div><BooleanFact label="Filed capital carry checked after the last edit" value={prior.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ priorCapitalLosses: { ...prior, sourceFactsConfirmed } })} />
        <button type="button" className="utility-button" onClick={() => change({ priorCapitalLosses: undefined })}>Remove filed capital carry history</button>
      </fieldset>}
      {!alternative ? <button type="button" className="utility-button" onClick={() => change({ alternativeTax: {} })}>Add independent capital AMT comparison</button> : <fieldset><legend>Independent capital AMT comparison</legend><div className="guided-form-grid">
        <TextFact label="Capital AMT comparison source reference" value={alternative.sourceReference ?? ''} onChange={sourceReference => change({ alternativeTax: { ...alternative, sourceReference } })} />
        <BooleanFact label="Capital regular and AMT basis and adjustments are the same" value={alternative.currentBasisAndAdjustmentsSameConfirmed} onChange={currentBasisAndAdjustmentsSameConfirmed => change({ alternativeTax: { ...alternative, currentBasisAndAdjustmentsSameConfirmed } })} />
        <BooleanFact label="Filed regular and AMT capital carry amounts are the same" value={alternative.priorCapitalLossesSameConfirmed} onChange={priorCapitalLossesSameConfirmed => change({ alternativeTax: { ...alternative, priorCapitalLossesSameConfirmed } })} />
      </div><BooleanFact label="Capital AMT comparison checked after the last edit" value={alternative.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ alternativeTax: { ...alternative, sourceFactsConfirmed } })} />
        <button type="button" className="utility-button" onClick={() => change({ alternativeTax: undefined })}>Remove independent capital AMT comparison</button>
      </fieldset>}
      <BooleanFact label="Current capital sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove current capital source packet</button>
    </>}
  </div></details>;
}
