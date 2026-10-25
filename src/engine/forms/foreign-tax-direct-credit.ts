/** Section904(j) elected credit. Spec: spec/federal/foreign-tax-direct-credit.yaml. */
import Decimal from 'decimal.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, min, roundDollar, sum } from '@/utils/decimal.js';
import type { ForeignTaxDirectCarrySource, ForeignTaxDirectSources } from './foreign-tax-direct-sources.js';

interface CarryDetail extends ForeignTaxDirectCarrySource { used: Decimal; expired: Decimal; remaining: Decimal }
type ByCategory = Record<string, Array<{ taxYear: number; amount: Decimal }>>;
export interface ForeignTaxDirectCreditResult {
  currentTaxExact: Decimal; currentTaxReported: Decimal; regularTaxLimit: Decimal; creditAllowed: Decimal; currentTaxUncredited: Decimal;
  carryforward: Decimal; expired: Decimal; carryforwardByCategory: ByCategory; details: CarryDetail[];
  amtCarryforward: Decimal; amtExpired: Decimal; amtCarryforwardByCategory: ByCategory; amtDetails: CarryDetail[];
  lines: CalculatedLine[];
}
function retained(rows: ForeignTaxDirectCarrySource[], year: number) {
  const byCategory: ByCategory = { passive: [], general: [] };
  const details = rows.map(row => {
    const expired = row.originTaxYear === year - 10 ? row.amount : d('0'); const remaining = row.amount.minus(expired);
    if (remaining.gt(0)) (byCategory[row.category] ??= []).push({ taxYear: row.originTaxYear, amount: remaining });
    return { ...row, used: d('0'), expired, remaining };
  });
  return { details, byCategory, expired: sum(...details.map(row => row.expired)), remaining: sum(...details.map(row => row.remaining)) };
}
export function calculateForeignTaxDirectCredit(sources: ForeignTaxDirectSources, regularTaxLimit: Decimal): ForeignTaxDirectCreditResult {
  if (!regularTaxLimit.isFinite() || regularTaxLimit.lt(0) || !regularTaxLimit.isInteger()) throw new Error('Direct foreign credit requires actual nonnegative whole-dollar regular tax');
  const audit = new AuditTrail(); audit.merge(sources.lines);
  const currentTaxReported = roundDollar(sources.currentTaxExact); const creditAllowed = min(currentTaxReported, regularTaxLimit);
  const currentTaxUncredited = currentTaxReported.minus(creditAllowed);
  const regular = retained(sources.carryovers, sources.taxYear); const amt = retained(sources.amtCarryovers, sources.taxYear);
  for (const [prefix, records] of [['regular', regular], ['amt', amt]] as const) {
    for (const row of records.details) audit.record('Foreign Direct Credit WS', `${prefix}:${row.category}:${row.originTaxYear}`, 'Actual prior carry retained without election-year use', row.remaining,
      'Opening adjusted balance less tenth-year expiration; no actual or hypothetical use', { opening: row.amount, used: row.used, expired: row.expired });
  }
  for (const [line, description, value] of [
    ['reported-tax', 'Combined actual tax after reporting rounding', currentTaxReported], ['regular-tax', 'Actual regular-tax limit', regularTaxLimit],
    ['allowed-credit', 'Elected foreign tax credit without Form1116', creditAllowed], ['current-uncredited', 'Current tax not credited and not carried', currentTaxUncredited],
    ['current-carry-created', 'No carry created in election year', d('0')], ['prior-carry-retained', 'Prior regular carry retained', regular.remaining],
    ['prior-carry-expired', 'Prior regular carry expired', regular.expired], ['amt-carry-retained', 'Prior AMT carry retained', amt.remaining], ['amt-carry-expired', 'Prior AMT carry expired', amt.expired],
  ] as const) audit.record('Foreign Direct Credit WS', line, description, value, 'IRC904(j); actual election, no foreign-income ratio and no election-year carry use');
  return { currentTaxExact: sources.currentTaxExact, currentTaxReported, regularTaxLimit, creditAllowed, currentTaxUncredited,
    carryforward: regular.remaining, expired: regular.expired, carryforwardByCategory: regular.byCategory, details: regular.details,
    amtCarryforward: amt.remaining, amtExpired: amt.expired, amtCarryforwardByCategory: amt.byCategory, amtDetails: amt.details, lines: audit.getLines() };
}
