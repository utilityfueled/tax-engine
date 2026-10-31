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
export type DigitalAssetTransactionData = Partial<Record<typeof digitalAmountFields[number][0] | 'sourceId' | 'digitalAssetCode' | 'digitalAssetName' | 'ticker' | 'quantity' | 'dateAcquired' | 'dateSold' | 'reportedDateAcquired' | 'reportedCostBasis' | 'basisSourceReference' | 'gainOrLoss' | 'paCostBasis' | 'paBasisSourceReference', string>>
  & Partial<Record<typeof digitalBooleanFields[number][0] | 'reportedDateAcquiredBlank' | 'reportedCostBasisBlank' | 'basisFactsConfirmed' | 'basisCorrectionConfirmed' | 'paBasisFactsConfirmed' | 'paTransactionForProfitConfirmed', boolean | null>> & {
    holdingPeriod?: 'short' | 'long' | ''; transactionType?: 'sale' | 'exchange' | 'payment' | 'other' | '';
    basisSource?: 'broker_statement' | 'taxpayer_records' | ''; proceedsType?: 'gross' | 'net' | '';
    optionalReportingMethod?: 'none' | 'stablecoins' | 'specified_nfts' | '';
    assetOrigin?: 'purchase' | 'mining' | 'staking' | 'airdrop' | 'gift' | 'inheritance' | 'other' | '';
  };
export interface DigitalAssetEntryData {
  sourceId?: string; sourceReference?: string; taxYear?: string; brokerName?: string; brokerTin?: string; accountReference?: string;
  accountHolder?: 'primary' | 'spouse' | 'joint' | ''; federalWithheld?: string; stateWithheld?: string; state?: string;
  stateTaxReporting?: 'none' | 'single' | 'multiple' | ''; sourceFactsConfirmed?: boolean | null; allTransactionsIncluded?: boolean | null;
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
function toSource(entry: DigitalAssetEntryData): Form1099DA {
  if (!/^\d{4}$/.test(entry.taxYear ?? '')) throw new Error('Enter the actual original digital-asset statement year.');
  if (!entry.transactions?.length) throw new Error('Include every actual individual digital-asset disposition.');
  const parsed = Form1099DASchema.safeParse({
    sourceId: actual(entry.sourceId, 'statement ID'), sourceReference: actual(entry.sourceReference, 'source reference'), taxYear: Number(entry.taxYear),
    brokerName: actual(entry.brokerName, 'broker name'), brokerTin: entry.brokerTin?.trim() || undefined, accountReference: entry.accountReference?.trim() || undefined,
    accountHolder: entry.accountHolder, federalWithheld: amount(entry.federalWithheld, 'Box 4 withholding'),
    stateTaxReporting: entry.stateTaxReporting, state: entry.state?.trim().toUpperCase() || undefined, stateWithheld: amount(entry.stateWithheld, 'state withholding'),
    sourceFactsConfirmed: entry.sourceFactsConfirmed ?? undefined, allTransactionsIncluded: entry.allTransactionsIncluded ?? undefined,
    transactions: entry.transactions.map(row => ({
      ...Object.fromEntries(digitalAmountFields.map(([key, label]) => [key, amount(row[key], label)])),
      ...Object.fromEntries(digitalBooleanFields.map(([key]) => [key, row[key] ?? undefined])),
      sourceId: actual(row.sourceId, 'original disposition ID'), digitalAssetCode: actual(row.digitalAssetCode, 'Box 1a code'), digitalAssetName: actual(row.digitalAssetName, 'Box 1b name'), ticker: row.ticker?.trim() || undefined,
      quantity: amount(row.quantity, 'Box 1c units'), dateAcquired: actual(row.dateAcquired, 'completed acquisition date'), dateSold: actual(row.dateSold, 'Box 1e sale date'),
      reportedDateAcquired: originalBlank(row.reportedDateAcquiredBlank, row.reportedDateAcquired, 'Box 1d acquisition date'),
      reportedCostBasis: originalBlank(row.reportedCostBasisBlank, row.reportedCostBasis, 'Box 1g basis', true),
      basisSource: row.basisSource, basisSourceReference: actual(row.basisSourceReference, 'basis record reference'), basisFactsConfirmed: row.basisFactsConfirmed ?? undefined,
      basisCorrectionConfirmed: row.basisCorrectionConfirmed ?? undefined,
      holdingPeriod: row.holdingPeriod, transactionType: row.transactionType, proceedsType: row.proceedsType,
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
export function buildDigitalAssetInputs(entries: DigitalAssetEntryData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, personal?: PersonalInfoData, originalB: Array<Pick<Form1099B, 'sourceId'>> = []): Form1099DA[] {
  const started = (entries ?? []).filter(isStartedDigitalAsset); if (!started.length) return [];
  if (!filingStatus || (taxYear !== 2025 && taxYear !== 2026) || !personal?.firstName.trim() || !personal.lastName.trim()) throw new Error('Complete the actual digital-asset return year and household.');
  const sources = started.map(toSource);
  const spouse = personal.spouse?.firstName.trim() && personal.spouse.lastName.trim() ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName } : undefined;
  calculateForm1099DASources({ taxpayer: { taxYear, filingStatus: statuses[filingStatus], spouse }, form1099B: originalB, form1099DA: sources });
  return sources;
}
export function digitalAssetFactErrors(entries: DigitalAssetEntryData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, personal?: PersonalInfoData, originalB: Array<Pick<Form1099B, 'sourceId'>> = [], stateData?: StateReturnData, stateCode?: string | null): Record<string, string> {
  try {
    const sources = buildDigitalAssetInputs(entries, filingStatus, taxYear, personal, originalB);
    if (sources.length && stateCode === 'PA' && filingStatus && taxYear) {
      const spouse = personal?.spouse?.firstName.trim() && personal.spouse.lastName.trim() ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName } : undefined;
      // Validate the supplied DA-only state view. Original B identity collisions were checked above.
      calculateDigitalAssetStateSources({ taxpayer: { taxYear, filingStatus: statuses[filingStatus], spouse }, form1099B: [], form1099DA: sources }, 'PA');
    }
    if (sources.some(source => stateData?.additionalStateWithholdingEntries?.some(extra => extra.documentType === '1099-DA' && extra.payer.trim().toLowerCase() === source.brokerName.trim().toLowerCase() && extra.state === source.state))) throw new Error('Reconcile duplicate DA state withholding already entered with the original statement.');
    return {};
  } catch (error) { return { digitalAssetSources: error instanceof Error ? error.message : 'Complete the actual digital-asset source facts.' }; }
}
export function updateDigitalAssetTransaction(row: DigitalAssetTransactionData, patch: Partial<DigitalAssetTransactionData>): DigitalAssetTransactionData {
  const next = { ...row, ...patch };
  return Object.keys(patch).every(key => key === 'basisFactsConfirmed' || key === 'paBasisFactsConfirmed') ? next : { ...next, basisFactsConfirmed: null, paBasisFactsConfirmed: null };
}
export function updateDigitalAssetEntry(entry: DigitalAssetEntryData, patch: Partial<DigitalAssetEntryData>): DigitalAssetEntryData {
  const next = { ...entry, ...patch };
  const actualValues = (value: DigitalAssetEntryData) => ({ ...value, transactions: value.transactions?.map(row => ({ ...row, basisFactsConfirmed: undefined, paBasisFactsConfirmed: undefined })) });
  return guidedSourceValuesChanged(actualValues(entry), actualValues(next)) ? { ...next, sourceFactsConfirmed: null } : next;
}
