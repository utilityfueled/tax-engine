"use client";
import { MarketDiscountSourceDetails } from "./market-discount-source-details";
import { marketDiscountConfirmationCurrent, type MarketDiscountContext } from "@/lib/guided-market-discount-sources";
import { digitalAmountFields, digitalBooleanFields, updateDigitalAssetEntry, updateDigitalAssetTransaction, type DigitalAssetEntryData, type DigitalAssetNoticeLotDraft, type DigitalAssetTransactionData } from '@/lib/guided-digital-asset-facts';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({ label, value, options, onChange }: { label: string; value: string | undefined; options: ReadonlyArray<readonly [string, string]>; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
function NoticeLotDetails({ row, prefix, onChange }: { row: DigitalAssetTransactionData; prefix: string; onChange: (patch: Partial<DigitalAssetTransactionData>) => void }) {
  const proof = row.notice202620Lot ?? {};
  const update = (patch: Partial<DigitalAssetNoticeLotDraft>) => onChange({ notice202620Lot: { ...proof, ...patch } });
  return <fieldset className="guided-w2-card"><legend>{prefix} — Documented lot identification</legend>
    <p className="guided-hint">This worksheet supports a covered 2026 sale that the broker classified as short term and your purchase records show was long term. Use the dated record that identifies this exact lot before the calendar date of the sale. Use references you recognize without entering full account numbers.</p>
    <div className="guided-form-grid">
      <TextFact label={`${prefix} — Identified lot ID`} value={proof.lotId ?? ''} onChange={lotId => update({ lotId })} />
      <TextFact label={`${prefix} — Lot identification record reference`} value={proof.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
      <TextFact label={`${prefix} — Account reference in lot records`} value={proof.accountReference ?? ''} onChange={accountReference => update({ accountReference })} />
      <TextFact label={`${prefix} — Date the lot was identified in your records`} type="date" value={proof.dateIdentified ?? ''} onChange={dateIdentified => update({ dateIdentified })} />
      <TextFact label={`${prefix} — Units identified in your records`} value={proof.quantity ?? ''} onChange={quantity => update({ quantity })} />
      <BooleanFact label={`${prefix} — The same asset and lot stayed in this broker account from purchase through sale`} value={proof.sameAccountCustodyConfirmed} onChange={sameAccountCustodyConfirmed => update({ sameAccountCustodyConfirmed })} />
      <BooleanFact label={`${prefix} — The identified units match all units sold on this row`} value={proof.disposedUnitsConfirmed} onChange={disposedUnitsConfirmed => update({ disposedUnitsConfirmed })} />
      <BooleanFact label={`${prefix} — No conflicting lot instruction was given to the broker`} value={proof.noConflictingBrokerInstructionConfirmed} onChange={noConflictingBrokerInstructionConfirmed => update({ noConflictingBrokerInstructionConfirmed })} />
      <BooleanFact label={`${prefix} — The lot basis does not depend on the Rev. Proc. 2024-28 transition`} value={proof.noTransitionalBasisDependencyConfirmed} onChange={noTransitionalBasisDependencyConfirmed => update({ noTransitionalBasisDependencyConfirmed })} />
    </div>
    {row.notice202620Lot && <button type="button" className="utility-button utility-button-small" onClick={() => onChange({ notice202620Lot: undefined })}>Remove lot evidence from {prefix}</button>}
  </fieldset>;
}
function Disposition({ entry, context, row, prefix, stateCode, onChange, onRemove }: { entry: DigitalAssetEntryData; context: MarketDiscountContext; row: DigitalAssetTransactionData; prefix: string; stateCode?: string | null; onChange: (patch: Partial<DigitalAssetTransactionData>) => void; onRemove: () => void }) {
  return <fieldset className="guided-w2-card"><legend>{prefix} — original disposition</legend>
    <p className="guided-hint">Copy the original boxes first. If the broker left acquisition or basis blank, preserve that answer and enter the separate taxpayer records below. Enter known zeros after checking the source.</p>
    <div className="guided-form-grid">
      {([['sourceId', 'Original disposition ID'], ['digitalAssetCode', 'Box 1a digital asset code'], ['digitalAssetName', 'Box 1b digital asset name'], ['ticker', 'Ticker, if shown'], ['quantity', 'Box 1c units']] as const).map(([key, label]) => <TextFact key={key} label={`${prefix} — ${label}`} value={row[key] ?? ''} onChange={value => onChange({ [key]: value })} />)}
      <TextFact label={`${prefix} — Box 1e sale date`} type="date" value={row.dateSold ?? ''} onChange={dateSold => onChange({ dateSold })} />
      <BooleanFact label={`${prefix} — Original Box 1d is blank`} value={row.reportedDateAcquiredBlank} onChange={reportedDateAcquiredBlank => onChange({ reportedDateAcquiredBlank })} />
      <TextFact label={`${prefix} — Original Box 1d acquisition date`} type="date" value={row.reportedDateAcquired ?? ''} onChange={reportedDateAcquired => onChange({ reportedDateAcquired })} />
      <BooleanFact label={`${prefix} — Original Box 1g is blank`} value={row.reportedCostBasisBlank} onChange={reportedCostBasisBlank => onChange({ reportedCostBasisBlank })} />
      <CurrencyField label={`${prefix} — Original Box 1g reported basis`} value={row.reportedCostBasis ?? ''} onChange={reportedCostBasis => onChange({ reportedCostBasis })} />
      {(entry.taxYear === '2026' || row.reportedHoldingPeriod || row.notice202620Lot) && <Choice label={`${prefix} — Original Box 6 holding period`} value={row.reportedHoldingPeriod} options={[['short', 'Short term'], ['long', 'Long term']]} onChange={value => onChange({ reportedHoldingPeriod: value as DigitalAssetTransactionData['reportedHoldingPeriod'] })} />}
      {digitalAmountFields.map(([key, label]) => <CurrencyField key={key} label={`${prefix} — ${label}`} value={row[key] ?? ''} allowNegative={key === 'adjustments'} onChange={value => onChange({ [key]: value })} />)}
      <CurrencyField label={`${prefix} — Signed statement gain or loss, if shown`} value={row.gainOrLoss ?? ''} allowNegative onChange={gainOrLoss => onChange({ gainOrLoss })} />
      <TextFact label={`${prefix} — Completed acquisition date`} type="date" value={row.dateAcquired ?? ''} onChange={dateAcquired => onChange({ dateAcquired })} />
      <Choice label={`${prefix} — Actual basis record`} value={row.basisSource} options={[['broker_statement', 'Original broker statement'], ['taxpayer_records', 'Actual taxpayer acquisition records']]} onChange={value => onChange({ basisSource: value as DigitalAssetTransactionData['basisSource'] })} />
      <TextFact label={`${prefix} — Basis record reference`} value={row.basisSourceReference ?? ''} onChange={basisSourceReference => onChange({ basisSourceReference })} />
      <BooleanFact label={`${prefix} — My records correct a different broker Box 1g basis`} value={row.basisCorrectionConfirmed ?? null} onChange={basisCorrectionConfirmed => onChange({ basisCorrectionConfirmed })} />
      {row.assetOrigin === 'inheritance' && <BooleanFact label={`${prefix} — The basis above is the value at the decedent's death, or the elected alternate value`} value={row.inheritedBasisConfirmed ?? null} onChange={inheritedBasisConfirmed => onChange({ inheritedBasisConfirmed })} />}
      {row.assetOrigin === 'gift' && <>
        <BooleanFact label={`${prefix} — This came from a spouse, or a former spouse in a divorce`} value={row.giftFromSpouse ?? null} onChange={giftFromSpouse => onChange({ giftFromSpouse })} />
        <CurrencyField label={`${prefix} — Donor's adjusted basis, plus any gift tax you may add, or 0 if it cannot be documented`} value={row.giftDonorBasis ?? ''} onChange={giftDonorBasis => onChange({ giftDonorBasis })} />
        <CurrencyField label={`${prefix} — Value on the gift date`} value={row.giftFairMarketValue ?? ''} onChange={giftFairMarketValue => onChange({ giftFairMarketValue })} />
        <TextFact label={`${prefix} — Gift date`} type="date" value={row.giftDate ?? ''} onChange={giftDate => onChange({ giftDate })} />
        <BooleanFact label={`${prefix} — Records support the donor's basis, the value and the gift date`} value={row.giftSourceConfirmed ?? null} onChange={giftSourceConfirmed => onChange({ giftSourceConfirmed })} />
        <BooleanFact label={`${prefix} — Records show how long the donor held it`} value={row.giftHoldingDocumented ?? null} onChange={giftHoldingDocumented => onChange({ giftHoldingDocumented })} />
      </>}
      {['mining', 'staking', 'airdrop'].includes(row.assetOrigin ?? '') && <BooleanFact label={`${prefix} — Its value when received was reported as income, and that amount is the basis above`} value={row.originIncomeIncludedConfirmed ?? null} onChange={originIncomeIncludedConfirmed => onChange({ originIncomeIncludedConfirmed })} />}
      <BooleanFact label={`${prefix} — These selling costs are not already reflected in Box 1f, which brokers usually reduce by transaction costs`} value={row.sellingCostsNotInProceedsConfirmed ?? null} onChange={sellingCostsNotInProceedsConfirmed => onChange({ sellingCostsNotInProceedsConfirmed })} />
      <Choice label={`${prefix} — Actual holding period`} value={row.holdingPeriod} options={[['short', 'Short term'], ['long', 'Long term']]} onChange={value => onChange({ holdingPeriod: value as DigitalAssetTransactionData['holdingPeriod'] })} />
      <Choice label={`${prefix} — Actual disposition type`} value={row.transactionType} options={[['sale', 'Sale'], ['exchange', 'Exchange'], ['payment', 'Payment for goods or services'], ['other', 'Other — separate method']]} onChange={value => onChange({ transactionType: value as DigitalAssetTransactionData['transactionType'] })} />
      <Choice label={`${prefix} — Box 3a proceeds type`} value={row.proceedsType} options={[['gross', 'Gross proceeds'], ['net', 'Net proceeds']]} onChange={value => onChange({ proceedsType: value as DigitalAssetTransactionData['proceedsType'] })} />
      <Choice label={`${prefix} — Actual original acquisition`} value={row.assetOrigin} options={[['purchase', 'Purchase'], ['mining', 'Mining'], ['staking', 'Staking'], ['airdrop', 'Airdrop'], ['gift', 'Gift'], ['inheritance', 'Inheritance'], ['other', 'Other']]} onChange={value => onChange({ assetOrigin: value as DigitalAssetTransactionData['assetOrigin'] })} />
      <Choice label={`${prefix} — Original optional aggregate reporting`} value={row.optionalReportingMethod} options={[['none', 'Individual disposition; no aggregate method'], ['stablecoins', 'Qualifying stablecoin aggregate'], ['specified_nfts', 'Specified NFT aggregate']]} onChange={value => onChange({ optionalReportingMethod: value as DigitalAssetTransactionData['optionalReportingMethod'] })} />
    </div>
    <details className="guided-expand"><summary className="guided-expand-trigger">{prefix} — source classifications</summary><div className="guided-expand-body guided-form-grid">
      {digitalBooleanFields.map(([key, label]) => <BooleanFact key={key} label={`${prefix} — ${label}`} value={row[key]} onChange={value => onChange({ [key]: value })} />)}
    </div></details>
    {(row.notice202620Lot || row.reportedHoldingPeriod && row.holdingPeriod && row.reportedHoldingPeriod !== row.holdingPeriod) && <NoticeLotDetails row={row} prefix={prefix} onChange={onChange} />}
    {(row.assetOrigin && row.assetOrigin !== 'purchase' && !(['mining', 'staking', 'airdrop'].includes(row.assetOrigin) && row.originIncomeIncludedConfirmed === true) && !(row.assetOrigin === 'inheritance' && row.inheritedBasisConfirmed === true) && !(row.assetOrigin === 'gift' && row.giftSourceConfirmed === true) || row.nftOrCollectible || row.qof || (row.ordinaryIncome && !marketDiscountConfirmationCurrent(entry, row, context)) || row.lossNotAllowed || row.optionalReportingMethod && row.optionalReportingMethod !== 'none') && <p role="status" className="guided-hint">These actual answers are saved. This source needs its separate acquisition, special-tax or aggregate reporting method before a preview is available.</p>}
    <MarketDiscountSourceDetails entry={entry} row={row} context={context} prefix={prefix} onChange={onChange} />
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
function Statement({ entry, index, stateCode, context, onChange, onRemove }: { context: MarketDiscountContext; entry: DigitalAssetEntryData; index: number; stateCode?: string | null; onChange: (patch: Partial<DigitalAssetEntryData>) => void; onRemove: () => void }) {
  const prefix = `DA statement ${index + 1}`, rows = entry.transactions ?? [];
  return <div className="guided-w2-card"><div className="guided-w2-card-header"><strong className="guided-w2-card-title">{prefix}{entry.brokerName ? ` — ${entry.brokerName}` : ''}</strong><button type="button" className="utility-button utility-button-small" onClick={onRemove}>Remove {prefix}</button></div>
    <div className="guided-form-grid">
      {([['sourceId', 'Original statement ID'], ['sourceReference', 'Original source reference'], ['taxYear', 'Actual source tax year'], ['brokerName', 'Broker name'], ['brokerTin', 'Broker taxpayer ID, if shown'], ['accountReference', 'Account reference, if shown']] as const).map(([key, label]) => <TextFact key={key} label={`${prefix} — ${label}`} value={entry[key] ?? ''} onChange={value => onChange({ [key]: value })} />)}
      <Choice label={`${prefix} — Actual taxpayer owner`} value={entry.accountHolder} options={[['primary', 'Primary taxpayer'], ['spouse', 'Spouse'], ['joint', 'Joint or nominee — needs allocation']]} onChange={value => onChange({ accountHolder: value as DigitalAssetEntryData['accountHolder'] })} />
      <CurrencyField label={`${prefix} — Box 4 federal withholding`} value={entry.federalWithheld ?? ''} onChange={federalWithheld => onChange({ federalWithheld })} />
      <Choice label={`${prefix} — Actual state reporting`} value={entry.stateTaxReporting} options={[['none', 'No state row'], ['single', 'One state'], ['multiple', 'Two states — Pennsylvania and Ohio']]} onChange={value => onChange({ stateTaxReporting: value as DigitalAssetEntryData['stateTaxReporting'] })} />
      {(entry.stateTaxReporting === 'single' || entry.stateIdentificationNumber !== undefined) && <TextFact label={`${prefix} — Original single-state Box 15 filer state ID`} value={entry.stateIdentificationNumber ?? ''} onChange={stateIdentificationNumber => onChange({ stateIdentificationNumber })} />}
      <TextFact label={`${prefix} — Original state code`} value={entry.state ?? ''} onChange={state => onChange({ state })} />
      <CurrencyField label={`${prefix} — Original state withholding`} value={entry.stateWithheld ?? ''} onChange={stateWithheld => onChange({ stateWithheld })} />
    </div>
    {entry.stateTaxReporting === 'multiple' && entry.stateIdentificationNumber !== undefined && <div>
      <p className="guided-hint">Check the original state rows below, then remove the saved single-state ID if it is an obsolete copy.</p>
      <button type="button" className="utility-button utility-button-small" onClick={() => onChange({ stateIdentificationNumber: undefined })}>Remove single-state ID from {prefix}</button>
    </div>}
    {entry.stateTaxReporting === 'multiple' && <fieldset className="guided-w2-card"><legend>{prefix} — original state rows</legend>
      <p className="guided-hint">Copy each original state row separately. This records withholding and does not split investment income. Two-state source support currently covers Pennsylvania and Ohio.</p>
      {[0, 1].map(index => {
        const row = entry.stateWithholding?.[index] ?? {};
        const label = `${prefix} state row ${index + 1}`;
        const update = (patch: Partial<typeof row>) => onChange({ stateWithholding: [0, 1].map(i => i === index ? { ...row, ...patch } : (entry.stateWithholding?.[i] ?? {})) });
        return <div className="guided-form-grid" key={index}>
          <TextFact label={`${label} — Box 14 state code`} value={row.state ?? ''} onChange={state => update({ state })} />
          <BooleanFact label={`${label} — Original Box 15 state ID is blank`} value={row.stateIdentificationNumberBlank} onChange={stateIdentificationNumberBlank => update({ stateIdentificationNumberBlank })} />
          <TextFact label={`${label} — Box 15 filer state ID`} value={row.stateIdentificationNumber ?? ''} onChange={stateIdentificationNumber => update({ stateIdentificationNumber })} />
          <CurrencyField label={`${label} — Box 16 state withholding`} value={row.stateWithheld ?? ''} onChange={stateWithheld => update({ stateWithheld })} />
        </div>;
      })}
    </fieldset>}
    {rows.map((row, rowIndex) => <Disposition key={rowIndex} entry={entry} context={context} row={row} stateCode={stateCode} prefix={`DA ${index + 1} sale ${rowIndex + 1}`} onChange={patch => onChange({ transactions: rows.map((value, i) => i === rowIndex ? updateDigitalAssetTransaction(value, patch) : value) })} onRemove={() => onChange({ transactions: rows.filter((_, i) => i !== rowIndex) })} />)}
    <button type="button" className="utility-button" onClick={() => onChange({ transactions: [...rows, {}] })}>Add individual disposition to {prefix}</button>
    <BooleanFact label={`${prefix} — Every original disposition is included`} value={entry.allTransactionsIncluded} onChange={allTransactionsIncluded => onChange({ allTransactionsIncluded })} />
    <BooleanFact label={`${prefix} — Sources checked after the last edit`} value={entry.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ sourceFactsConfirmed })} />
  </div>;
}
export function DigitalAssetSourceCards({ entries = [], stateCode, context = {}, onChange }: { context?: MarketDiscountContext; entries?: DigitalAssetEntryData[]; stateCode?: string | null; onChange: (entries: DigitalAssetEntryData[]) => void }) {
  return <details className="guided-expand"><summary className="guided-expand-trigger">Original digital assets (1099-DA)</summary><div className="guided-expand-body">
    <p className="guided-hint">Use actual 1099-DA statements here. Enter actual 1099-B statements in Brokerage Sales. Dispositions with no information statement need a separate source entry method. These review controls do not establish filing readiness.</p>
    <div className="guided-w2-stack">{entries.map((entry, index) => <Statement key={index} context={context} entry={entry} index={index} stateCode={stateCode} onChange={patch => onChange(entries.map((value, i) => i === index ? updateDigitalAssetEntry(value, patch) : value))} onRemove={() => onChange(entries.filter((_, i) => i !== index))} />)}</div>
    <button type="button" className="utility-button" onClick={() => onChange([...entries, {}])}>Add actual 1099-DA statement</button>
  </div></details>;
}
