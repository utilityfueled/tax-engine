'use client';
import type { DigitalAssetEntryData, DigitalAssetTransactionData } from '@/lib/guided-digital-asset-facts';
import { confirmMarketDiscount, marketDiscountConfirmationCurrent, marketDiscountAmountFields, marketDiscountBooleanFields, invalidateMarketDiscount, type MarketDiscountContext, type MarketDiscountDraft } from '@/lib/guided-market-discount-sources';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

export function MarketDiscountSourceDetails({ entry, row, prefix, context, onChange }: {
  entry: DigitalAssetEntryData; row: DigitalAssetTransactionData; prefix: string; context: MarketDiscountContext;
  onChange: (patch: Partial<DigitalAssetTransactionData>) => void;
}) {
  const facts = row.marketDiscountFacts;
  if (!facts) return row.ordinaryIncome === true ? <button type="button" className="utility-button" onClick={() => onChange({ marketDiscountFacts: {} })}>Add original market discount sources for {prefix}</button> : null;
  const update = (patch: Partial<MarketDiscountDraft>) => onChange({ marketDiscountFacts: invalidateMarketDiscount({ ...facts, ...patch }) });
  return <fieldset className="guided-w2-card"><legend>{prefix} — original market discount records</legend>
    <p className="guided-hint">Use original taxable corporate debt records for a full US-dollar cash sale. Keep the original Ordinary and noncovered answers. Elections, prior inclusions, partial principal, OID or premium and other ordinary-income causes need their separate methods. Check every original INT/OID statement to avoid including the same discount twice.</p>
    <div className="guided-form-grid">
      <TextFact label={`${prefix} — Actual debt security identifier`} value={row.securityIdentifier ?? ''} onChange={securityIdentifier => onChange({ securityIdentifier })} />
      {([['sourceReference','Original debt and election record reference'],['originalDispositionReference','Original full sale record reference'],['issueDate','Original debt issue date'],['maturityDate','Original debt maturity date'],['interestReconciliationReference','Original INT/OID reconciliation reference']] as const).map(([key,label]) => <TextFact key={key} type={key === 'issueDate' || key === 'maturityDate' ? 'date' : 'text'} label={`${prefix} — ${label}`} value={facts[key] ?? ''} onChange={value => update({ [key]: value })} />)}
      <label className="guided-field"><span className="guided-field-label">{prefix} — Actual issuer tax treatment</span><select className="guided-input" value={facts.issuerTaxTreatment ?? ''} onChange={event => update({ issuerTaxTreatment: event.target.value as MarketDiscountDraft['issuerTaxTreatment'] })}><option value="">Confirm from actual records</option><option value="taxable_corporate">Taxable corporate debt</option><option value="other">Other — separate method</option></select></label>
      <label className="guided-field"><span className="guided-field-label">{prefix} — Actual cause of ordinary income</span><select className="guided-input" value={facts.ordinaryIncomeCause ?? ''} onChange={event => update({ ordinaryIncomeCause: event.target.value as MarketDiscountDraft['ordinaryIncomeCause'] })}><option value="">Confirm from actual records</option><option value="market_discount_only">Market discount only</option><option value="other">Other or additional cause — separate method</option></select></label>
      {marketDiscountAmountFields.map(([key,label]) => <CurrencyField key={key} label={`${prefix} — ${label}`} value={facts[key] ?? ''} onChange={value => update({ [key]: value })} />)}
      {marketDiscountBooleanFields.map(([key,label]) => <BooleanFact key={key} label={`${prefix} — ${label}`} value={facts[key]} onChange={value => update({ [key]: value })} />)}
      <BooleanFact label={`${prefix} — Debt, election, history and interest originals checked after the last edit`} value={marketDiscountConfirmationCurrent(entry,row,context) ? true : facts.sourceFactsConfirmed === false ? false : null} onChange={value => onChange({ marketDiscountFacts: confirmMarketDiscount(entry,row,context,value) })} />
    </div>
    <button type="button" className="utility-button utility-button-small" onClick={() => onChange({ marketDiscountFacts: undefined })}>Remove market discount records for {prefix}</button>
  </fieldset>;
}
