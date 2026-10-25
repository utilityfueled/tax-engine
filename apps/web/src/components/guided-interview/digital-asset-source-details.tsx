"use client";
import { digitalAmountFields, digitalBooleanFields, updateDigitalAssetEntry, updateDigitalAssetTransaction, type DigitalAssetEntryData, type DigitalAssetTransactionData } from '@/lib/guided-digital-asset-facts';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({ label, value, options, onChange }: { label: string; value: string | undefined; options: ReadonlyArray<readonly [string, string]>; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
function Disposition({ row, prefix, stateCode, onChange, onRemove }: { row: DigitalAssetTransactionData; prefix: string; stateCode?: string | null; onChange: (patch: Partial<DigitalAssetTransactionData>) => void; onRemove: () => void }) {
  return <fieldset className="guided-w2-card"><legend>{prefix} — original disposition</legend>
    <p className="guided-hint">Copy the original boxes first. If the broker left acquisition or basis blank, preserve that answer and enter the separate taxpayer records below. Enter known zeros after checking the source.</p>
    <div className="guided-form-grid">
      {([['sourceId', 'Original disposition ID'], ['digitalAssetCode', 'Box 1a digital asset code'], ['digitalAssetName', 'Box 1b digital asset name'], ['ticker', 'Ticker, if shown'], ['quantity', 'Box 1c units']] as const).map(([key, label]) => <TextFact key={key} label={`${prefix} — ${label}`} value={row[key] ?? ''} onChange={value => onChange({ [key]: value })} />)}
      <TextFact label={`${prefix} — Box 1e sale date`} type="date" value={row.dateSold ?? ''} onChange={dateSold => onChange({ dateSold })} />
      <BooleanFact label={`${prefix} — Original Box 1d is blank`} value={row.reportedDateAcquiredBlank} onChange={reportedDateAcquiredBlank => onChange({ reportedDateAcquiredBlank })} />
      <TextFact label={`${prefix} — Original Box 1d acquisition date`} type="date" value={row.reportedDateAcquired ?? ''} onChange={reportedDateAcquired => onChange({ reportedDateAcquired })} />
      <BooleanFact label={`${prefix} — Original Box 1g is blank`} value={row.reportedCostBasisBlank} onChange={reportedCostBasisBlank => onChange({ reportedCostBasisBlank })} />
      <CurrencyField label={`${prefix} — Original Box 1g reported basis`} value={row.reportedCostBasis ?? ''} onChange={reportedCostBasis => onChange({ reportedCostBasis })} />
      {digitalAmountFields.map(([key, label]) => <CurrencyField key={key} label={`${prefix} — ${label}`} value={row[key] ?? ''} allowNegative={key === 'adjustments'} onChange={value => onChange({ [key]: value })} />)}
      <CurrencyField label={`${prefix} — Signed statement gain or loss, if shown`} value={row.gainOrLoss ?? ''} allowNegative onChange={gainOrLoss => onChange({ gainOrLoss })} />
      <TextFact label={`${prefix} — Completed acquisition date`} type="date" value={row.dateAcquired ?? ''} onChange={dateAcquired => onChange({ dateAcquired })} />
      <Choice label={`${prefix} — Actual basis record`} value={row.basisSource} options={[['broker_statement', 'Original broker statement'], ['taxpayer_records', 'Actual taxpayer acquisition records']]} onChange={value => onChange({ basisSource: value as DigitalAssetTransactionData['basisSource'] })} />
      <TextFact label={`${prefix} — Basis record reference`} value={row.basisSourceReference ?? ''} onChange={basisSourceReference => onChange({ basisSourceReference })} />
      <Choice label={`${prefix} — Actual holding period`} value={row.holdingPeriod} options={[['short', 'Short term'], ['long', 'Long term']]} onChange={value => onChange({ holdingPeriod: value as DigitalAssetTransactionData['holdingPeriod'] })} />
      <Choice label={`${prefix} — Actual disposition type`} value={row.transactionType} options={[['sale', 'Sale'], ['exchange', 'Exchange'], ['payment', 'Payment — separate method'], ['other', 'Other — separate method']]} onChange={value => onChange({ transactionType: value as DigitalAssetTransactionData['transactionType'] })} />
      <Choice label={`${prefix} — Box 3a proceeds type`} value={row.proceedsType} options={[['gross', 'Gross proceeds'], ['net', 'Net proceeds']]} onChange={value => onChange({ proceedsType: value as DigitalAssetTransactionData['proceedsType'] })} />
      <Choice label={`${prefix} — Actual original acquisition`} value={row.assetOrigin} options={[['purchase', 'Purchase'], ['mining', 'Mining'], ['staking', 'Staking'], ['airdrop', 'Airdrop'], ['gift', 'Gift'], ['inheritance', 'Inheritance'], ['other', 'Other']]} onChange={value => onChange({ assetOrigin: value as DigitalAssetTransactionData['assetOrigin'] })} />
      <Choice label={`${prefix} — Original optional aggregate reporting`} value={row.optionalReportingMethod} options={[['none', 'Individual disposition; no aggregate method'], ['stablecoins', 'Qualifying stablecoin aggregate'], ['specified_nfts', 'Specified NFT aggregate']]} onChange={value => onChange({ optionalReportingMethod: value as DigitalAssetTransactionData['optionalReportingMethod'] })} />
    </div>
    <details className="guided-expand"><summary className="guided-expand-trigger">{prefix} — source classifications</summary><div className="guided-expand-body guided-form-grid">
      {digitalBooleanFields.map(([key, label]) => <BooleanFact key={key} label={`${prefix} — ${label}`} value={row[key]} onChange={value => onChange({ [key]: value })} />)}
    </div></details>
    {(row.assetOrigin && row.assetOrigin !== 'purchase' || row.nftOrCollectible || row.qof || row.ordinaryIncome || row.lossNotAllowed || row.optionalReportingMethod && row.optionalReportingMethod !== 'none') && <p role="status" className="guided-hint">These actual answers are saved. This source needs its separate acquisition, special-tax or aggregate reporting method before a preview is available.</p>}
    {stateCode === 'PA' && <fieldset className="guided-w2-card"><legend>{prefix} — Pennsylvania source records</legend>
      <p className="guided-hint">Enter the adjusted basis from the actual Pennsylvania records. It can differ from federal basis. An unanswered amount or confirmation stays unknown.</p>
      <div className="guided-form-grid">
        <CurrencyField label={`${prefix} — Actual Pennsylvania adjusted basis`} value={row.paCostBasis ?? ''} onChange={paCostBasis => onChange({ paCostBasis })} />
        <TextFact label={`${prefix} — Pennsylvania basis reference`} value={row.paBasisSourceReference ?? ''} onChange={paBasisSourceReference => onChange({ paBasisSourceReference })} />
        <BooleanFact label={`${prefix} — Transaction was entered into for profit`} value={row.paTransactionForProfitConfirmed} onChange={paTransactionForProfitConfirmed => onChange({ paTransactionForProfitConfirmed })} />
        <BooleanFact label={`${prefix} — Pennsylvania basis checked after the last edit`} value={row.paBasisFactsConfirmed} onChange={paBasisFactsConfirmed => onChange({ paBasisFactsConfirmed })} />
      </div>
    </fieldset>}
    <BooleanFact label={`${prefix} — Basis records checked after the last edit`} value={row.basisFactsConfirmed} onChange={basisFactsConfirmed => onChange({ basisFactsConfirmed })} />
    <button type="button" className="utility-button utility-button-small" onClick={onRemove}>Remove {prefix}</button>
  </fieldset>;
}
function Statement({ entry, index, stateCode, onChange, onRemove }: { entry: DigitalAssetEntryData; index: number; stateCode?: string | null; onChange: (patch: Partial<DigitalAssetEntryData>) => void; onRemove: () => void }) {
  const prefix = `DA statement ${index + 1}`, rows = entry.transactions ?? [];
  return <div className="guided-w2-card"><div className="guided-w2-card-header"><strong className="guided-w2-card-title">{prefix}{entry.brokerName ? ` — ${entry.brokerName}` : ''}</strong><button type="button" className="utility-button utility-button-small" onClick={onRemove}>Remove {prefix}</button></div>
    <div className="guided-form-grid">
      {([['sourceId', 'Original statement ID'], ['sourceReference', 'Original source reference'], ['taxYear', 'Actual source tax year'], ['brokerName', 'Broker name'], ['brokerTin', 'Broker taxpayer ID, if shown'], ['accountReference', 'Account reference, if shown']] as const).map(([key, label]) => <TextFact key={key} label={`${prefix} — ${label}`} value={entry[key] ?? ''} onChange={value => onChange({ [key]: value })} />)}
      <Choice label={`${prefix} — Actual taxpayer owner`} value={entry.accountHolder} options={[['primary', 'Primary taxpayer'], ['spouse', 'Spouse'], ['joint', 'Joint or nominee — needs allocation']]} onChange={value => onChange({ accountHolder: value as DigitalAssetEntryData['accountHolder'] })} />
      <CurrencyField label={`${prefix} — Box 4 federal withholding`} value={entry.federalWithheld ?? ''} onChange={federalWithheld => onChange({ federalWithheld })} />
      <Choice label={`${prefix} — Actual state reporting`} value={entry.stateTaxReporting} options={[['none', 'No state row'], ['single', 'One state'], ['multiple', 'Multiple states — needs allocation']]} onChange={value => onChange({ stateTaxReporting: value as DigitalAssetEntryData['stateTaxReporting'] })} />
      <TextFact label={`${prefix} — Original state code`} value={entry.state ?? ''} onChange={state => onChange({ state })} />
      <CurrencyField label={`${prefix} — Original state withholding`} value={entry.stateWithheld ?? ''} onChange={stateWithheld => onChange({ stateWithheld })} />
    </div>
    {rows.map((row, rowIndex) => <Disposition key={rowIndex} row={row} stateCode={stateCode} prefix={`DA ${index + 1} sale ${rowIndex + 1}`} onChange={patch => onChange({ transactions: rows.map((value, i) => i === rowIndex ? updateDigitalAssetTransaction(value, patch) : value) })} onRemove={() => onChange({ transactions: rows.filter((_, i) => i !== rowIndex) })} />)}
    <button type="button" className="utility-button" onClick={() => onChange({ transactions: [...rows, {}] })}>Add individual disposition to {prefix}</button>
    <BooleanFact label={`${prefix} — Every original disposition is included`} value={entry.allTransactionsIncluded} onChange={allTransactionsIncluded => onChange({ allTransactionsIncluded })} />
    <BooleanFact label={`${prefix} — Sources checked after the last edit`} value={entry.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ sourceFactsConfirmed })} />
  </div>;
}
export function DigitalAssetSourceCards({ entries = [], stateCode, onChange }: { entries?: DigitalAssetEntryData[]; stateCode?: string | null; onChange: (entries: DigitalAssetEntryData[]) => void }) {
  return <details className="guided-expand"><summary className="guided-expand-trigger">Original digital assets (1099-DA)</summary><div className="guided-expand-body">
    <p className="guided-hint">Use actual 1099-DA statements here. Enter actual 1099-B statements in Brokerage Sales. Dispositions with no information statement need a separate source entry method. These review controls do not establish filing readiness.</p>
    <div className="guided-w2-stack">{entries.map((entry, index) => <Statement key={index} entry={entry} index={index} stateCode={stateCode} onChange={patch => onChange(entries.map((value, i) => i === index ? updateDigitalAssetEntry(value, patch) : value))} onRemove={() => onChange(entries.filter((_, i) => i !== index))} />)}</div>
    <button type="button" className="utility-button" onClick={() => onChange([...entries, {}])}>Add actual 1099-DA statement</button>
  </div></details>;
}
