import { buildGuidedMarketDiscountSource, invalidateMarketDiscount, marketDiscountInterestOriginals, type MarketDiscountContext, type MarketDiscountDraft } from './guided-market-discount-sources';
// Spec: spec/federal/guided-digital-asset-sources.yaml.
import { Form1099DASchema, type Form1099DA, type Form1099B } from '@/models/inputs.js';
import { calculateForm1099DASources } from '@/engine/forms/form-1099-da-sources.js';
import { calculateDigitalAssetStateSources } from '@/engine/state/digital-asset-sources.js';
import type { FilingStatus, PersonalInfoData, StateReturnData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

export const digitalAmountFields = [
  ['proceeds', 'Box 1f proceeds'], ['costBasis', 'Completed taxpayer cost basis'],
  ['marketDiscount', 'Box 1h accrued market discount'], ['washSaleDisallowed', 'Box 1i wash-sale loss disallowed'],
  ['sellingExpenses', 'Selling expenses not included in reported basis or proceeds'], ['adjustments', 'Other capital adjustments'],
] as const;
export const digitalBooleanFields = [
  ['basisReportedToIRS', 'Box 2 basis reported to the IRS'], ['qof', 'Box 3b qualified opportunity fund proceeds'],
  ['lossNotAllowed', 'Box 5 loss not allowed'], ['ordinaryIncome', 'Box 6 ordinary income'],
  ['onlyCashProceeds', 'Box 7 only cash proceeds'], ['customerProvidedAcquisitionInformation', 'Box 8 customer acquisition information'],
  ['noncoveredSecurity', 'Box 9 noncovered security'], ['washSale', 'Wash-sale treatment applies to this actual disposition'],
  ['capitalAssetConfirmed', 'Actual asset was held as capital property'], ['nftOrCollectible', 'Actual asset is an NFT or collectible'],
] as const;
const noticeLotConfirmationKeys = [
  'sameAccountCustodyConfirmed', 'disposedUnitsConfirmed',
  'noConflictingBrokerInstructionConfirmed', 'noTransitionalBasisDependencyConfirmed',
] as const;
export type DigitalAssetNoticeLotDraft = Partial<Record<'lotId' | 'sourceReference' | 'accountReference' | 'dateIdentified' | 'quantity', string>>
  & Partial<Record<typeof noticeLotConfirmationKeys[number], boolean | null>>;

export type DigitalAssetTransactionData = Partial<Record<typeof digitalAmountFields[number][0] | 'sourceId' | 'securityIdentifier' | 'digitalAssetCode' | 'digitalAssetName' | 'ticker' | 'quantity' | 'dateAcquired' | 'dateSold' | 'reportedDateAcquired' | 'reportedCostBasis' | 'basisSourceReference' | 'gainOrLoss' | 'paCostBasis' | 'paBasisSourceReference', string>>
  & Partial<Record<typeof digitalBooleanFields[number][0] | 'reportedDateAcquiredBlank' | 'reportedCostBasisBlank' | 'basisFactsConfirmed' | 'basisCorrectionConfirmed' | 'sellingCostsNotInProceedsConfirmed' | 'originIncomeIncludedConfirmed' | 'inheritedBasisConfirmed' | 'giftSourceConfirmed' | 'giftHoldingDocumented' | 'giftFromSpouse' | 'paBasisFactsConfirmed' | 'paTransactionForProfitConfirmed', boolean | null>> & {
    marketDiscountFacts?: MarketDiscountDraft;
    notice202620Lot?: DigitalAssetNoticeLotDraft;
    giftDonorBasis?: string; giftFairMarketValue?: string; giftDate?: string;
    holdingPeriod?: 'short' | 'long' | ''; transactionType?: 'sale' | 'exchange' | 'payment' | 'other' | '';
    reportedHoldingPeriod?: 'short' | 'long' | '';
    basisSource?: 'broker_statement' | 'taxpayer_records' | ''; proceedsType?: 'gross' | 'net' | '';
    optionalReportingMethod?: 'none' | 'stablecoins' | 'specified_nfts' | '';
    assetOrigin?: 'purchase' | 'mining' | 'staking' | 'airdrop' | 'gift' | 'inheritance' | 'other' | '';
  };
export interface DigitalAssetEntryData {
  sourceId?: string; sourceReference?: string; taxYear?: string; brokerName?: string; brokerTin?: string; accountReference?: string;
  accountHolder?: 'primary' | 'spouse' | 'joint' | ''; federalWithheld?: string; stateWithheld?: string; state?: string; stateIdentificationNumber?: string;
  stateTaxReporting?: 'none' | 'single' | 'multiple' | ''; sourceFactsConfirmed?: boolean | null; allTransactionsIncluded?: boolean | null;
  stateWithholding?: Array<{ state?: string; stateIdentificationNumber?: string; stateIdentificationNumberBlank?: boolean | null; stateWithheld?: string }>;
  transactions?: DigitalAssetTransactionData[];
}
export function isStartedDigitalAsset(value: unknown): boolean {
  if (typeof value === 'string') return !!value.trim();
  if (typeof value === 'boolean') return true;
  return !!value && typeof value === 'object' && Object.values(value).some(isStartedDigitalAsset);
}
function actual(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Enter the actual digital-asset ${label}; missing facts remain unknown.`);
  return value.trim();
}
function amount(value: string | undefined, label: string): string {
  const original = actual(value, `${label}, including known zero`); const parsed = parseGuidedCurrency(original);
  if (!parsed.isFinite()) throw new Error(`Enter the actual finite digital-asset ${label}.`);
  return original.replace(/,/g, '');
}
function originalBlank(blank: boolean | null | undefined, value: string | undefined, label: string, monetary = false): string | null {
  if (typeof blank !== 'boolean') throw new Error(`Confirm whether the original digital-asset ${label} is blank.`);
  if (blank) { if (value?.trim()) throw new Error(`Reconcile the saved ${label} with the actual original blank answer.`); return null; }
  return monetary ? amount(value, label) : actual(value, label);
}
function completedNoticeLot(row: DigitalAssetTransactionData) {
  const proof = row.notice202620Lot;
  const termDiffers = row.reportedHoldingPeriod && row.reportedHoldingPeriod !== row.holdingPeriod;
  if (!proof && !termDiffers) return undefined;
  if (!proof || !termDiffers) throw new Error('Reconcile the original Box 6 term and the taxpayer holding period with the documented Notice 2026-20 lot.');
  if (noticeLotConfirmationKeys.some(key => proof[key] !== true)) {
    throw new Error('Confirm the same broker account, asset and sold units, and verify there is no conflicting broker instruction or transitional basis dependency for this lot.');
  }
  return {
    lotId: actual(proof.lotId, 'identified lot ID'),
    sourceReference: actual(proof.sourceReference, 'lot identification record reference'),
    accountReference: actual(proof.accountReference, 'lot record account reference'),
    dateIdentified: actual(proof.dateIdentified, 'lot identification date'),
    quantity: amount(proof.quantity, 'identified lot units'),
    sameAccountCustodyConfirmed: true, disposedUnitsConfirmed: true,
    noConflictingBrokerInstructionConfirmed: true, noTransitionalBasisDependencyConfirmed: true,
  };
}
function toSource(entry: DigitalAssetEntryData, context: MarketDiscountContext): Form1099DA {
  if (!/^\d{4}$/.test(entry.taxYear ?? '')) throw new Error('Enter the actual original digital-asset statement year.');
  if (!entry.transactions?.length) throw new Error('Include every actual individual digital-asset disposition.');
  const parsed = Form1099DASchema.safeParse({
    sourceId: actual(entry.sourceId, 'statement ID'), sourceReference: actual(entry.sourceReference, 'source reference'), taxYear: Number(entry.taxYear),
    brokerName: actual(entry.brokerName, 'broker name'), brokerTin: entry.brokerTin?.trim() || undefined, accountReference: entry.accountReference?.trim() || undefined,
    accountHolder: entry.accountHolder, federalWithheld: amount(entry.federalWithheld, 'Box 4 withholding'),
    stateIdentificationNumber: entry.stateIdentificationNumber,
    stateTaxReporting: entry.stateTaxReporting, state: entry.state?.trim().toUpperCase() || undefined, stateWithheld: entry.stateTaxReporting === 'multiple' && !entry.stateWithheld?.trim() ? undefined : amount(entry.stateWithheld, 'state withholding'),
    stateWithholding: entry.stateWithholding?.map(row => ({ state: row.state?.trim().toUpperCase() || undefined,
      stateIdentificationNumber: originalBlank(row.stateIdentificationNumberBlank ?? (row.stateIdentificationNumber?.trim() ? false : undefined), row.stateIdentificationNumber, 'Box 15 state identification number') ?? '',
      stateWithheld: amount(row.stateWithheld, 'Box 16 state-row withholding') })),
    sourceFactsConfirmed: entry.sourceFactsConfirmed ?? undefined, allTransactionsIncluded: entry.allTransactionsIncluded ?? undefined,
    transactions: entry.transactions.map(row => ({
      ...Object.fromEntries(digitalAmountFields.map(([key, label]) => [key, amount(row[key], label)])),
      ...Object.fromEntries(digitalBooleanFields.map(([key]) => [key, row[key] ?? undefined])),
      securityIdentifier: row.securityIdentifier?.trim() || undefined, marketDiscountSource: buildGuidedMarketDiscountSource(entry, row, context),
      sourceId: actual(row.sourceId, 'original disposition ID'), digitalAssetCode: actual(row.digitalAssetCode, 'Box 1a code'), digitalAssetName: actual(row.digitalAssetName, 'Box 1b name'), ticker: row.ticker?.trim() || undefined,
      quantity: amount(row.quantity, 'Box 1c units'), dateAcquired: actual(row.dateAcquired, 'completed acquisition date'), dateSold: actual(row.dateSold, 'Box 1e sale date'),
      reportedDateAcquired: originalBlank(row.reportedDateAcquiredBlank, row.reportedDateAcquired, 'Box 1d acquisition date'),
      reportedCostBasis: originalBlank(row.reportedCostBasisBlank, row.reportedCostBasis, 'Box 1g basis', true),
      basisSource: row.basisSource, basisSourceReference: actual(row.basisSourceReference, 'basis record reference'), basisFactsConfirmed: row.basisFactsConfirmed ?? undefined,
      basisCorrectionConfirmed: row.basisCorrectionConfirmed ?? undefined, sellingCostsNotInProceedsConfirmed: row.sellingCostsNotInProceedsConfirmed ?? undefined, originIncomeIncludedConfirmed: row.originIncomeIncludedConfirmed ?? undefined, inheritedBasisConfirmed: row.inheritedBasisConfirmed ?? undefined,
      ...(row.assetOrigin === 'gift' ? { giftSource: { donorBasis: row.giftDonorBasis?.trim() ? parseGuidedCurrency(row.giftDonorBasis).toFixed() : undefined, fairMarketValueAtGift: row.giftFairMarketValue?.trim() ? parseGuidedCurrency(row.giftFairMarketValue).toFixed() : undefined, giftDate: row.giftDate || undefined, sourceFactsConfirmed: row.giftSourceConfirmed ?? undefined, donorHoldingDocumented: row.giftHoldingDocumented ?? undefined, fromSpouse: row.giftFromSpouse ?? undefined } } : {}),
      holdingPeriod: row.holdingPeriod, transactionType: row.transactionType, proceedsType: row.proceedsType,
      reportedHoldingPeriod: row.reportedHoldingPeriod || undefined, notice202620Lot: completedNoticeLot(row),
      optionalReportingMethod: row.optionalReportingMethod, assetOrigin: row.assetOrigin,
      paCostBasis: row.paCostBasis?.trim() ? amount(row.paCostBasis, 'Pennsylvania adjusted basis') : undefined,
      paBasisSourceReference: row.paBasisSourceReference?.trim() || undefined,
      paBasisFactsConfirmed: row.paBasisFactsConfirmed ?? undefined, paTransactionForProfitConfirmed: row.paTransactionForProfitConfirmed ?? undefined,
      ...(row.gainOrLoss?.trim() ? { gainOrLoss: amount(row.gainOrLoss, 'statement gain or loss') } : {}),
    })),
  });
  if (!parsed.success) throw new Error('Complete every original DA box and source classification; missing values remain unknown.');
  return parsed.data;
}
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
export function buildDigitalAssetInputs(entries: DigitalAssetEntryData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, personal?: PersonalInfoData, originalB: Array<Pick<Form1099B, 'sourceId'>> = [], context: MarketDiscountContext = {}): Form1099DA[] {
  const started = (entries ?? []).filter(isStartedDigitalAsset); if (!started.length) return [];
  if (!filingStatus || (taxYear !== 2025 && taxYear !== 2026) || !personal?.firstName.trim() || !personal.lastName.trim()) throw new Error('Complete the actual digital-asset return year and household.');
  const sources = started.map(entry => toSource(entry, context));
  const facts = started.flatMap(entry => entry.transactions ?? []).find(row => row.marketDiscountFacts)?.marketDiscountFacts;
  const originals = facts ? marketDiscountInterestOriginals(context, facts) : {};
  const spouse = personal.spouse?.firstName.trim() && personal.spouse.lastName.trim() ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName } : undefined;
  calculateForm1099DASources({ taxpayer: { taxYear, filingStatus: statuses[filingStatus], spouse }, form1099B: originalB, form1099DA: sources, ...originals });
  return sources;
}
export function digitalAssetFactErrors(entries: DigitalAssetEntryData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, personal?: PersonalInfoData, originalB: Array<Pick<Form1099B, 'sourceId'>> = [], stateData?: StateReturnData, stateCode?: string | null, context: MarketDiscountContext = {}): Record<string, string> {
  try {
    const sources = buildDigitalAssetInputs(entries, filingStatus, taxYear, personal, originalB, context);
    if (sources.length && stateCode === 'PA' && filingStatus && taxYear) {
      const spouse = personal?.spouse?.firstName.trim() && personal.spouse.lastName.trim() ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName } : undefined;
      // Validate the supplied DA-only state view. Original B identity collisions were checked above.
      calculateDigitalAssetStateSources({ taxpayer: { taxYear, filingStatus: statuses[filingStatus], spouse }, form1099B: [], form1099DA: sources }, 'PA');
    }
    if (sources.some(source => stateData?.additionalStateWithholdingEntries?.some(extra => extra.documentType === '1099-DA' && extra.payer.trim().toLowerCase() === source.brokerName.trim().toLowerCase() && (extra.state === source.state || source.stateWithholding?.some(row => row.state === extra.state))))) throw new Error('Reconcile duplicate DA state withholding already entered with the original statement.');
    return {};
  } catch (error) { return { digitalAssetSources: error instanceof Error ? error.message : 'Complete the actual digital-asset source facts.' }; }
}
function noticeLotMaterialFacts(row: DigitalAssetTransactionData) {
  const { notice202620Lot, basisFactsConfirmed: _basis, basisCorrectionConfirmed: _correction, paBasisFactsConfirmed: _pa,
    marketDiscountFacts: _marketDiscount, ...disposition } = row;
  const { lotId, sourceReference, accountReference, dateIdentified, quantity } = notice202620Lot ?? {};
  return { ...disposition, notice202620Lot: { lotId, sourceReference, accountReference, dateIdentified, quantity } };
}

function invalidateNoticeLot(row: DigitalAssetTransactionData): DigitalAssetTransactionData {
  if (!row.notice202620Lot) return row;
  return {
    ...row, basisFactsConfirmed: null, basisCorrectionConfirmed: null,
    notice202620Lot: {
      ...row.notice202620Lot, sameAccountCustodyConfirmed: null, disposedUnitsConfirmed: null,
      noConflictingBrokerInstructionConfirmed: null, noTransitionalBasisDependencyConfirmed: null,
    },
  };
}

export function invalidateDigitalAssetNoticeLots(entry: DigitalAssetEntryData): DigitalAssetEntryData {
  if (!entry.transactions?.some(row => row.notice202620Lot)) return entry;
  return { ...entry, sourceFactsConfirmed: null, transactions: entry.transactions.map(invalidateNoticeLot) };
}

export function invalidateEditedDigitalAssetNoticeLots(previous: DigitalAssetEntryData, next: DigitalAssetEntryData): DigitalAssetEntryData {
  if (!next.transactions || (!next.transactions.some(row => row.notice202620Lot)
    && !previous.transactions?.some(row => row.notice202620Lot))) return next;
  const sourceFields = ['sourceId', 'sourceReference', 'taxYear', 'brokerName', 'brokerTin', 'accountReference', 'accountHolder'] as const;
  const sourceEdited = sourceFields.some(key => previous[key] !== next[key]);
  const previousRows = new Map(previous.transactions?.filter(row => row.sourceId).map(row => [row.sourceId, row]));
  let edited = false;
  const transactions = next.transactions.map((row, index) => {
    const old = previousRows.get(row.sourceId) ?? previous.transactions?.[index];
    if (!row.notice202620Lot && !old?.notice202620Lot) return row;
    const rowEdited = old && (Boolean(old.notice202620Lot) !== Boolean(row.notice202620Lot)
      || guidedSourceValuesChanged(noticeLotMaterialFacts(old), noticeLotMaterialFacts(row)));
    if (!sourceEdited && !rowEdited) return row;
    edited = true;
    return invalidateNoticeLot({
      ...row,
      basisFactsConfirmed: null,
      basisCorrectionConfirmed: null,
      paBasisFactsConfirmed: null,
    });
  });
  return edited ? { ...next, sourceFactsConfirmed: null, transactions } : next;
}

export function updateDigitalAssetTransaction(row: DigitalAssetTransactionData, patch: Partial<DigitalAssetTransactionData>): DigitalAssetTransactionData {
  const next = { ...row, ...patch }, origin = ['originIncomeIncludedConfirmed', 'inheritedBasisConfirmed', 'giftSourceConfirmed', 'giftHoldingDocumented'];
  const keys = Object.keys(patch);
  if (keys.every(key => key === 'basisFactsConfirmed' || key === 'paBasisFactsConfirmed')) return next;
  const noticeEdited = next.notice202620Lot && guidedSourceValuesChanged(noticeLotMaterialFacts(row), noticeLotMaterialFacts(next));
  if (next.notice202620Lot && !noticeEdited && keys.every(key => key === 'notice202620Lot' || key === 'basisCorrectionConfirmed')) return next;
  if (keys.length === 1 && keys[0] === 'marketDiscountFacts') return { ...next, basisFactsConfirmed: null, paBasisFactsConfirmed: null };
  const edited = keys.some(key => !origin.includes(key));
  const reviewed = { ...next, marketDiscountFacts: invalidateMarketDiscount(next.marketDiscountFacts), basisFactsConfirmed: null, paBasisFactsConfirmed: null, ...(edited ? { originIncomeIncludedConfirmed: null, inheritedBasisConfirmed: null, giftSourceConfirmed: null, giftHoldingDocumented: null } : {}) };
  return noticeEdited ? invalidateNoticeLot(reviewed) : reviewed;
}
export function updateDigitalAssetEntry(entry: DigitalAssetEntryData, patch: Partial<DigitalAssetEntryData>): DigitalAssetEntryData {
  const next = invalidateEditedDigitalAssetNoticeLots(entry, { ...entry, ...patch });
  const actualValues = (value: DigitalAssetEntryData) => ({ ...value, transactions: value.transactions?.map(row => ({ ...row, basisFactsConfirmed: undefined, paBasisFactsConfirmed: undefined })) });
  if (!guidedSourceValuesChanged(actualValues(entry), actualValues(next))) return next;
  const statementEdited = Object.keys(patch).some(key => key !== "transactions" && key !== "sourceFactsConfirmed");
  return { ...next, sourceFactsConfirmed: null, ...(statementEdited ? { transactions: next.transactions?.map(row => ({ ...row, marketDiscountFacts: invalidateMarketDiscount(row.marketDiscountFacts) })) } : {}) };
}
