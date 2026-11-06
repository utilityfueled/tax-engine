/** Facts-only prior charity/NOL binding. Spec: charitable-prior-net-operating-loss.yaml. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { validateCharitableCarryoverSources, type CharitableCarryoverBalance, type CharitableSourceValidationInput } from '@/engine/forms/charitable-carryover-source-validation.js';
import { d } from './decimal.js';

export type PriorCharitableNolSourceInput = Pick<TaxYearInput, 'standardDeductionFacts' | 'donations' | 'scheduleK1' | 'k1CharitableSources' | 'cryptoIncome' | 'priorYear' | 'charitableCarryoverSources' | 'netOperatingLoss'>
  & { taxpayer: CharitableSourceValidationInput['taxpayer'] };
export interface PriorCharitableNolSources {
  regular: CharitableCarryoverBalance[];
  alternative: CharitableCarryoverBalance[];
  sourceDigest: string;
}
/** Internal comparison only. TaxYearInput has no such deduction amount. */
export interface PriorCharitableNolLimit {
  method: 'prior_vintage'; ledger: 'regular' | 'alternative';
  sourceId?: string; contributionYear?: number;
  category?: CharitableCarryoverBalance['category']; medium?: 'cash' | 'noncash';
  amount: Decimal; sourceDigest: string;
}

export function hasPriorCharitableNolSources(input: PriorCharitableNolSourceInput): boolean {
  const history = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  return history?.alternativeCarryoverSources !== undefined || (input.charitableCarryoverSources?.vintages?.length ?? 0) > 0
    || (history?.priorRegularCarryovers?.length ?? 0) > 0 || (history?.priorAlternativeCarryovers?.length ?? 0) > 0
    || !d(input.priorYear?.charitableCarryforward).isZero() || (input.priorYear?.charitableCarryforwardByYear?.length ?? 0) > 0;
}

/** Facts-only validation for the source collector; no invented income context. */
export function validatePriorCharitableNolHistories(input: Pick<PriorCharitableNolSourceInput, 'taxpayer' | 'standardDeductionFacts' | 'charitableCarryoverSources' | 'priorYear' | 'netOperatingLoss'>): Pick<PriorCharitableNolSources, 'regular' | 'alternative'> {
  if (input.taxpayer.taxYear !== 2025) throw new Error('Prior charitable NOL sources require the separate2026 floor/vintage method');
  const history = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if (history?.sourceTaxYear !== input.taxpayer.taxYear - 1 || !history.sourceReference?.trim()
    || history.sourceFactsConfirmed !== true || history.allCarryoversIncluded !== true || !history.alternativeCarryoverSources || !input.charitableCarryoverSources) {
    throw new Error('Prior charitable NOL requires independently complete regular and alternative charity histories');
  }
  const regular = validateCharitableCarryoverSources(input);
  // The legacy return aggregate describes regular charity only. It is not an
  // AMT opening; the independent AMT packet validates its own exact history.
  const alternative = validateCharitableCarryoverSources({ taxpayer: input.taxpayer, standardDeductionFacts: input.standardDeductionFacts, charitableCarryoverSources: history.alternativeCarryoverSources });
  if (regular.length > 1 || alternative.length > 1 || [...regular, ...alternative].some(row =>
    (row.filingUnitSources?.filter(source => d(source.openingBalance.numerator).gt(0)).length ?? 1) > 1)) {
    throw new Error('Prior charitable NOL requires one original category/medium/vintage per ledger; mixed attribution remains separate');
  }
  if (regular[0] && alternative[0] && (regular[0].taxYear !== alternative[0].taxYear || regular[0].category !== alternative[0].category || regular[0].medium !== alternative[0].medium)) {
    throw new Error('Prior charitable regular and alternative sources must retain the same original year category and medium');
  }
  for (const [records, summary] of [[regular, history.priorRegularCarryovers], [alternative, history.priorAlternativeCarryovers]] as const) {
    if (summary === undefined) continue;
    if (summary.length !== records.length || summary.some((row, index) => !row.sourceReference?.trim()
      || row.taxYear !== records[index].taxYear || row.category !== records[index].category || row.amount === undefined
      || !/^\d+(?:\.\d+)?$/.test(row.amount) || !d(row.amount).eq(records[index].amount))) {
      throw new Error('Prior charitable legacy summary must reconcile to its actual independent full history');
    }
  }
  return { regular, alternative };
}

export function readPriorCharitableNolSources(input: PriorCharitableNolSourceInput): PriorCharitableNolSources {
  const { regular, alternative } = validatePriorCharitableNolHistories(input);
  if (input.donations.some(row => !d(row.amount).isZero()) || input.k1CharitableSources !== undefined
    || input.scheduleK1.some(row => [row.charitableCash, row.charitableCapitalGain30, row.charitableCapitalGain20].some(value => !d(value).isZero()))
    || (input.cryptoIncome?.donations.length ?? 0) > 0) throw new Error('Prior charitable NOL method requires no current gifts; mixed current and prior sources remain separate');
  const history = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  const sourceDigest = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify({
    taxpayer: input.taxpayer, standardDeductionFacts: input.standardDeductionFacts, regular: input.charitableCarryoverSources, history,
    legacy: input.priorYear && { aggregate: input.priorYear.charitableCarryforward, rows: input.priorYear.charitableCarryforwardByYear },
    current: input.donations, k1: input.scheduleK1.map(row => [row.charitableCash, row.charitableCapitalGain30, row.charitableCapitalGain20]),
  }))));
  return { regular, alternative, sourceDigest };
}

export function createPriorCharitableNolLimit(input: PriorCharitableNolSourceInput, ledger: PriorCharitableNolLimit['ledger'], amount: Decimal): PriorCharitableNolLimit {
  const sources = readPriorCharitableNolSources(input), row = sources[ledger][0];
  const limit: PriorCharitableNolLimit = { method: 'prior_vintage', ledger, amount, sourceDigest: sources.sourceDigest,
    sourceId: row?.sourceId, contributionYear: row?.taxYear, category: row?.category, medium: row?.medium };
  validatePriorCharitableNolLimit(input, limit);
  return limit;
}

export function validatePriorCharitableNolLimit(input: PriorCharitableNolSourceInput, limit: PriorCharitableNolLimit): PriorCharitableNolSources {
  const sources = readPriorCharitableNolSources(input);
  if (!limit || limit.method !== 'prior_vintage' || !['regular', 'alternative'].includes(limit.ledger)) throw new Error('Prior charitable comparison requires its internal original-source method');
  const row = sources[limit.ledger][0];
  if (!Decimal.isDecimal(limit.amount) || !limit.amount.isFinite() || limit.amount.lt(0) || limit.amount.gt(row?.amount ?? d('0'))
    || limit.sourceDigest !== sources.sourceDigest || limit.sourceId !== row?.sourceId || limit.contributionYear !== row?.taxYear
    || limit.category !== row?.category || limit.medium !== row?.medium) throw new Error('Prior charitable comparison must reconcile with original identity year category medium and source amount');
  return sources;
}
