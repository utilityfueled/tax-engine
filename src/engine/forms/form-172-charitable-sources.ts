/** Current personal charitable sources for Form172; spec/federal/form-172-charitable-origin.yaml. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { eligibleCurrentCharitableDonations } from './charitable-current-sources.js';
import { validateCharitableCarryoverSources } from './charitable-carryover-source-validation.js';
import { readCurrentCharitableReceiptAmounts } from '@/utils/charitable-current-receipts.js';
import { charitableSourceDigest } from '@/utils/charitable-source-digest.js';
import { sum } from '@/utils/decimal.js';

export interface Form172CharitableSourcesResult {
  qualifiedValue: Decimal;
  sourceDigest: string;
}

/** No AGI, allowance or loss is collected here. Original current receipts and
 * both known-empty histories establish the admitted current-source method. */
export function calculateForm172CharitableSources(input: TaxYearInput): Form172CharitableSourcesResult | undefined {
  if (!input.donations.length) return undefined;
  for (const gift of eligibleCurrentCharitableDonations(input)) {
    if (!gift.organization.trim()) throw new Error('Form172 charitable source requires the actual qualified recipient');
  }
  const amounts = readCurrentCharitableReceiptAmounts(input, { capitalStockOnly: true });
  const history = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if (history?.sourceTaxYear !== input.taxpayer.taxYear - 1 || !history.sourceReference?.trim()
    || history.sourceFactsConfirmed !== true || history.allCarryoversIncluded !== true
    || !Array.isArray(history.priorRegularCarryovers) || !Array.isArray(history.priorAlternativeCarryovers)) {
    throw new Error('Form172 charitable origin requires complete independent regular and alternative charitable histories');
  }
  if (history.priorRegularCarryovers.length || history.priorAlternativeCarryovers.length) {
    throw new Error('Form172 prior charitable origin coordination requires its separate original-vintage method');
  }
  if (input.charitableCarryoverSources && validateCharitableCarryoverSources(input).length) {
    throw new Error('Form172 current charitable source method requires an actual empty regular history');
  }
  if (history.alternativeCarryoverSources && validateCharitableCarryoverSources({ ...input,
    priorYear: undefined, charitableCarryoverSources: history.alternativeCarryoverSources }).length) {
    throw new Error('Form172 current charitable source method requires an actual empty alternative history');
  }
  return { qualifiedValue: sum(...Object.values(amounts)), sourceDigest: bytesToHex(sha256(new TextEncoder().encode(JSON.stringify({
    current: charitableSourceDigest(input), history,
  })))) };
}
