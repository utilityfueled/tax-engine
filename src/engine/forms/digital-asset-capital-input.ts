// Spec: spec/federal/form-1099-da-sources.yaml. Shared capital-source normalization, no tax calculation.
import type Decimal from 'decimal.js';
import type { CapitalTransaction, TaxYearInput } from '@/models/inputs.js';
import { calculateForm1099DASources } from './form-1099-da-sources.js';

export function normalizeDigitalAssetCapitalInput(input: TaxYearInput, options: {
  resolvedLegacyBasis?: ReadonlyMap<string, { costBasis: Decimal; dateAcquired: string }>;
  additionalDispositions?: CapitalTransaction[];
} = {}): TaxYearInput {
  if (!input.form1099DA?.length && !options.additionalDispositions?.length) return input;
  const source = calculateForm1099DASources(input, options);
  const additional = options.additionalDispositions?.length ? [{ broker: 'DeFi/NFT/Crypto', stateWithheld: '0',
    transactions: options.additionalDispositions.map(row => ({ ...row, digitalAsset: true, sourceDocumentType: 'not-reported' as const })) }] : [];
  return { ...input, form1099DA: [], form1099B: [...input.form1099B, ...source.capitalForms, ...additional] };
}

/** Review must reproduce original sources, not silently omit derived capital rows. */
export function assertOrdinaryDigitalAssetReview(input: TaxYearInput): void {
  const source = calculateForm1099DASources(input);
  if (!source.sourceFactsComplete) throw new Error('Digital-asset review requires complete actual ordinary source records; legacy lot-derived sources need a separate complete review method.');
  const crypto = input.cryptoIncome;
  if (crypto && [crypto.tokenSwaps, crypto.lpPositions, crypto.nftTransactions, crypto.liquidations].some(rows => rows && rows.length > 0)) {
    throw new Error('Derived crypto capital dispositions require a separate source-complete review method.');
  }
}
