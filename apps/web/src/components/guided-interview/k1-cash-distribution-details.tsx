"use client";
import type { K1CashDistributionData } from '@/lib/guided-k1-cash-distribution';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

type Choices = readonly (readonly [string, string])[];
type Field = readonly [keyof K1CashDistributionData, string, 'text' | 'money' | 'boolean' | Choices];
const common: readonly Field[] = [
  ['sourceTaxYear', 'source year', 'text'], ['sourceReference', 'original source reference', 'text'],
  ['sourceFactsConfirmed', 'checked after the last edit', 'boolean'],
  ['originalBox', 'original K-1 box', [['19', 'Partnership box 19'], ['16', 'S-corporation box 16']]],
  ['originalCode', 'original distribution code', [['A', 'A — partnership cash'], ['D', 'D — S-corporation distributions']]],
  ['cashAmount', 'actual cash', 'money'], ['distributionDate', 'distribution date', 'text'], ['acquisitionDate', 'acquisition date', 'text'],
  ['acquisitionMethod', 'original acquisition method', [['cash_purchase', 'Cash purchase'], ['original_cash_contribution', 'Original cash contribution'], ['other', 'Other acquisition — separate method']]],
  ['singleUnchangedBlockConfirmed', 'one unchanged ownership block held before the year', 'boolean'],
  ['allAnnualDistributionsIncludedConfirmed', 'this record includes every distribution during the year', 'boolean'],
  ['cashOnlyConfirmed', 'cash only', 'boolean'], ['nonliquidatingConfirmed', 'ownership continued after this distribution', 'boolean'],
  ['noOtherReportingConfirmed', 'this distribution is not reported elsewhere as a capital transaction', 'boolean'],
  ['noSpecialHoldingOrGainElectionConfirmed', 'no special holding-period or gain election applies', 'boolean'],
  ['activityCharacter', 'actual underlying activity', [['portfolio_investments_only', 'Portfolio investments only'], ['single_passive_business', 'One passive business — separate method'], ['single_nonpassive_business', 'One nonpassive business — separate method'], ['mixed_or_other', 'Mixed or other — separate method']]],
  ['usIndividualTaxTreatmentConfirmed', 'owner has U.S. citizen or resident tax treatment for this source period', 'boolean'],
  ['sameSingleAtRiskActivityConfirmed', 'the entire gain belongs to the same original Form 6198 activity', 'boolean'],
  ['atRiskSourceReference', 'actual at-risk source reference', 'text'], ['atRiskGainItemSourceReference', 'original Form 6198 gain-item statement reference', 'text'],
];
const partnership: readonly Field[] = [
  ['allIncomePrecedesDistributionConfirmed', 'all entity income preceded the December 31 cash distribution', 'boolean'],
  ['noHotAssetExchangeConfirmed', 'no Section 751 inventory or receivables exchange', 'boolean'],
  ['noDisguisedSaleOrDebtPaymentConfirmed', 'no disguised sale or debt payment', 'boolean'],
  ['noRetirementOrSuccessorPaymentConfirmed', 'no retiring-partner or successor payment', 'boolean'],
  ['noMarketableSecuritiesOrLiabilityMoneyConfirmed', 'no securities or liability changes treated as money', 'boolean'],
  ['notApplicablePartnershipInterestConfirmed', 'not an applicable partnership interest under Section 1061', 'boolean'],
];
const corporation: readonly Field[] = [
  ['uniformPerShareBasisConfirmed', 'the stock block has uniform per-share basis', 'boolean'],
  ['noAccumulatedEarningsAndProfitsConfirmed', 'the corporation had no accumulated earnings and profits at year end', 'boolean'],
  ['noRedemptionOrDebtRepaymentConfirmed', 'no stock redemption or shareholder debt repayment', 'boolean'],
];
export function K1CashDistributionDetails({ prefix, data, entityType, onChange }: {
  prefix: string; data?: K1CashDistributionData; entityType?: string; onChange: (next: K1CashDistributionData | undefined) => void;
}) {
  if (data === undefined) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add {prefix} cash distribution attachment</button>;
  const fields = [...common, ...(entityType !== 's_corporation' ? partnership : []), ...(entityType !== 'partnership' ? corporation : [])];
  return <fieldset><legend>{prefix} cash distribution attachment</legend>
    <p className="guided-hint">Use the original cash-distribution and acquisition records. Enter dates as YYYY-MM-DD. The calculation derives any gain from these facts and the existing basis records.</p>
    <p className="guided-hint">This method covers one unchanged investment-only block and a cash distribution. Partnership distributions must actually occur on December 31. Record the exact original Form 6198 activity reference and its gain-item statement; the existing worksheet amounts must reconcile.</p>
    <p className="guided-hint">The owner treatment answer includes an effective resident election where applicable. It must cover this source year and relevant holding period without foreign or treaty treatment that changes the calculation. Other methods remain saved for their separate calculation.</p>
    <div className="guided-form-grid">{fields.map(([key, name, kind]) => {
      const label = `${prefix} distribution ${name}`, value = data[key], change = (next: unknown) => onChange({ ...data, [key]: next });
      if (kind === 'boolean') return <BooleanFact key={key} label={label} value={typeof value === 'boolean' ? value : undefined} onChange={change} />;
      if (kind === 'money') return <CurrencyField key={key} label={label} value={typeof value === 'string' ? value : ''} onChange={change} />;
      if (kind === 'text') return <TextFact key={key} label={label} value={typeof value === 'string' ? value : ''} onChange={change} />;
      return <label className="guided-field" key={key}><span className="guided-field-label">{label}</span><select className="guided-input" value={typeof value === 'string' ? value : ''} onChange={event => change(event.target.value)}>
        <option value="">Choose from actual records</option>
        {typeof value === 'string' && value && !kind.some(([code]) => code === value) && <option value={value}>Saved source: {value}</option>}
        {kind.map(([code, text]) => <option key={code} value={code}>{text}</option>)}
      </select></label>;
    })}</div>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove {prefix} cash distribution attachment</button>
  </fieldset>;
}
