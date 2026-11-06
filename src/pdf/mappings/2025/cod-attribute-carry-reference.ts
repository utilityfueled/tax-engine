/** Reconcile current-form values with the separate after-tax108 closing.
 * Spec: cod-ordinary-attribute-sources.yaml, closing-reference-reconciliation. */
import Decimal from 'decimal.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import type { CodAttributeReductionRecord } from '@/engine/forms/cod-attribute-reductions.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';
import { sumSourceMoneyRatios } from '@/utils/sum-source-money-ratios.js';
import { buildForm982ReferenceSummary } from './fill-form-982.js';

function same(actual: Decimal | undefined, expected: Decimal): void {
  if (!Decimal.isDecimal(actual) || !actual.isFinite() || !actual.eq(expected)) {
    throw new Error('COD closing reference amounts do not reconcile with the actual current form and source ledger');
  }
}
function records(result: TaxReturnResult): CodAttributeReductionRecord[] | undefined {
  const later = result.codAttributeReduction;
  if (!later) {
    if (result.allLines.some(row => row.form.endsWith(' COD Attribute Worksheet'))) {
      throw new Error('COD closing reference is missing its retained original-source ledger');
    }
    return undefined;
  }
  // Validate both systems, statutory stage audits and final canonical carries.
  buildForm982ReferenceSummary(result);
  for (const ledger of [later.regular, later.alternativeTax]) {
    const seen = new Set<string>();
    for (const row of ledger.records) {
      const amounts = [row.opening, row.currentUse, row.carrybackUse, row.deemedAbsorption, row.beforeReduction,
        row.carryforwardBeforeReduction, row.incomeApplied, row.attributeReduction, row.expiredAfterReduction, row.remaining];
      if (!row.sourceId?.trim() || seen.has(row.sourceId) || amounts.some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))
        || !Number.isInteger(row.originTaxYear) || row.originTaxYear > result.taxYear) {
        throw new Error('COD closing reference requires unique finite original-source records');
      }
      seen.add(row.sourceId);
      same(row.opening, sumSourceMoney(row.currentUse, row.carrybackUse, row.deemedAbsorption, row.beforeReduction));
      const credit = row.kind !== 'capital_loss' && row.kind !== 'passive_loss';
      same(row.incomeApplied, sumSourceMoneyRatios(credit ? [row.reductionRatio, row.reductionRatio, row.reductionRatio] : [row.reductionRatio]));
      same(row.attributeReduction, sumSourceMoneyRatios([row.reductionRatio]));
      same(row.beforeReduction, sumSourceMoneyRatios([row.reductionRatio, row.remainingRatio]));
      same(sumSourceMoney(row.remaining, row.expiredAfterReduction), sumSourceMoneyRatios([row.remainingRatio]));
      const lifetime = row.kind === 'general_business_credit' ? 20 : row.kind === 'foreign_tax_credit' ? 10 : undefined;
      if (lifetime !== undefined && row.originTaxYear + lifetime < result.taxYear && row.opening.gt(0)) {
        throw new Error('COD closing reference cannot retain an expired positive original');
      }
      same(row.carryforwardBeforeReduction, lifetime !== undefined && row.originTaxYear + lifetime === result.taxYear ? new Decimal(0) : row.beforeReduction);
    }
  }
  return later.regular.records;
}

export interface CodCreditCarryReference {
  reduction: Decimal; carryback: Decimal; expiry: Decimal; closing: Decimal;
  signedCurrentAdjustment?: Decimal; followingYearPool?: Decimal;
}
export function codCreditCarryReference(result: TaxReturnResult | undefined,
  kind: 'general_business_credit' | 'minimum_tax_credit', current: { available: Decimal; used: Decimal; carry: Decimal },
): CodCreditCarryReference | undefined {
  if (!result) return undefined;
  const all = records(result);
  const closing = kind === 'general_business_credit' ? result.carryforwards.generalBusinessCredit : result.carryforwards.minimumTaxCredit;
  if (!all) {
    if (result.codNolReduction) same(closing, current.carry);
    return undefined;
  }
  const pool = kind === 'minimum_tax_credit' ? result.codAttributeReduction?.regular.minimumTaxCreditPool : undefined;
  if (pool) {
    same(current.available, pool.currentCreditAvailable); same(current.used, pool.currentCreditUsed); same(current.carry, pool.currentFormCarry);
    return { reduction: pool.attributeReduction, carryback: new Decimal(0), expiry: new Decimal(0), closing: pool.remaining,
      signedCurrentAdjustment: pool.signedCurrentAdjustment, followingYearPool: pool.beforeReduction };
  }
  const rows = all.filter(row => row.kind === kind);
  same(sumSourceMoney(...rows.map(row => row.opening)), current.available);
  same(sumSourceMoney(...rows.map(row => row.currentUse)), current.used);
  same(sumSourceMoney(...rows.flatMap(row => [row.beforeReduction, row.carrybackUse])), current.carry);
  same(closing, sumSourceMoneyRatios(rows.filter(row => row.expiredAfterReduction.isZero()).map(row => row.remainingRatio)));
  const reduction = sumSourceMoneyRatios(rows.map(row => row.reductionRatio));
  const stage = result.codAttributeReduction!.regular.stages.filter(row => row.kind === kind);
  if (stage.length !== 1) throw new Error('COD closing reference requires its unique credit stage');
  same(stage[0]?.attributeReduction, reduction);
  same(stage[0]?.incomeApplied, sumSourceMoney(...rows.map(row => row.incomeApplied)));
  return { reduction, closing, carryback: sumSourceMoney(...rows.map(row => row.carrybackUse)),
    expiry: sumSourceMoney(...rows.map(row => row.expiredAfterReduction)) };
}

export interface CodPassiveCarryReference { name: string; before: Decimal; reduction: Decimal; closing: Decimal }
export function codPassiveCarryReference(result: TaxReturnResult): CodPassiveCarryReference[] | undefined {
  const all = records(result);
  if (!all) return undefined;
  const rows = all.filter(row => row.kind === 'passive_loss');
  const source = result.form8582;
  if (!source) throw new Error('COD passive closing reference requires its actual current Form8582');
  const actual = new Map<string, Decimal>();
  for (const row of result.carryforwards.suspendedPassiveLosses) {
    if (actual.has(row.partnershipName)) throw new Error('COD passive closing reference has duplicate activity balances');
    actual.set(row.partnershipName, row.amount);
  }
  const names = new Set([...source.activityAllocations.filter(row => row.suspendedLoss.gt(0)).map(row => row.name),
    ...rows.map(row => row.activityName ?? ''), ...actual.keys()]);
  return [...names].map(name => {
    const formRows = source.activityAllocations.filter(row => row.name === name), originals = rows.filter(row => row.activityName === name);
    if (!name || formRows.length !== 1) throw new Error('COD passive closing reference has missing or duplicate current activity sources');
    const before = sumSourceMoney(...originals.map(row => row.beforeReduction));
    const closing = sumSourceMoneyRatios(originals.map(row => row.remainingRatio));
    same(before, formRows[0]!.suspendedLoss);
    same(actual.get(name) ?? new Decimal(0), closing);
    return { name, before, closing, reduction: sumSourceMoneyRatios(originals.map(row => row.reductionRatio)) };
  });
}
