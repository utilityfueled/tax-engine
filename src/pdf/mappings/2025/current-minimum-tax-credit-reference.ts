/** Spec: current-minimum-tax-credit-sources.yaml aggregate-reference. */
import Decimal from 'decimal.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';
import { sumSourceMoneyRatios } from '@/utils/sum-source-money-ratios.js';

export function currentMinimumTaxCreditReference(result: TaxReturnResult): Array<{ label: string; value: string }> {
  const source = result.currentMinimumTaxCredit, later = result.codAttributeReduction;
  const pools = [later?.regular.minimumTaxCreditPool, later?.alternativeTax.minimumTaxCreditPool];
  if (!source && pools.every(pool => pool === undefined)) return [];
  if (!source || source.sourceFactsVerified !== true || source.sourceTaxYear !== result.taxYear || !later || pools.some(pool => !pool)) {
    throw new Error('Current MTC reference requires its complete signed source and both aggregate ledgers');
  }
  const same = (actual: Decimal | undefined, expected: Decimal) => {
    if (!Decimal.isDecimal(actual) || !actual.isFinite() || !actual.eq(expected)) throw new Error('Current MTC reference source and aggregate amounts do not reconcile');
  };
  const zero = new Decimal(0), part = source.sourceCalculation;
  if (part.sourceFactsVerified !== true || part.sourceYear !== result.taxYear || part.lines.length !== 18) throw new Error('Current MTC reference requires the complete bounded source-year PartI');
  const lines = Array.from({ length: 18 }, (_, index) => String(index + 1)).map(number => {
    const rows = part.lines.filter(row => row.form === 'Minimum tax credit source year' && row.line === number);
    const audits = result.allLines.filter(row => row.form === 'Minimum tax credit source year' && row.line === number);
    if (rows.length !== 1 || audits.length !== 1 || !Decimal.isDecimal(rows[0]!.value) || !rows[0]!.value.isFinite()) throw new Error('Current MTC reference requires unique finite source-year audit rows');
    same(audits[0]!.value, rows[0]!.value); return rows[0]!;
  });
  const value = (number: number) => lines[number - 1]!.value;
  for (const [number, expected] of [[4, part.exclusionOnlyAMTI], [9, part.exemption], [10, part.amtBaseOnExclusions],
    [11, part.exclusionOnlyTMT], [13, part.tentativeMinimumTaxOnExclusionItems], [15, part.netMinTaxOnExclusionItems],
    [17, part.netMinTaxOnExclusionItems], [18, part.minTaxCreditFromSourceYear]] as const) same(value(number), expected);
  same(value(3), zero); same(value(12), zero);
  same(value(18), sumSourceMoney(value(16), value(17).negated()));
  same(source.signedCurrentAdjustment, value(18));
  same(source.currentCreditAvailable, result.form8801?.totalAvailableCredit ?? zero);
  same(source.currentCreditUsed, result.form8801?.creditAllowed ?? zero);
  same(source.currentFormCarry, result.form8801?.carryforwardToNextYear ?? zero);
  same(sumSourceMoney(source.currentCreditUsed, source.currentFormCarry), source.currentCreditAvailable);
  same(source.followingYearPool, Decimal.max(0, sumSourceMoney(source.currentFormCarry, source.signedCurrentAdjustment)));
  for (const [index, pool] of pools.entries()) {
    if (!pool) throw new Error('Current MTC reference aggregate is missing');
    const seen = new Set<string>();
    for (const row of pool.priorSourceRecords) {
      if (!row.sourceId?.trim() || seen.has(row.sourceId) || row.kind !== 'minimum_tax_credit' || !Number.isInteger(row.originTaxYear)
        || row.originTaxYear >= result.taxYear || [row.opening, row.currentUse, row.beforeReduction].some(amount => !Decimal.isDecimal(amount) || !amount.isFinite() || amount.lt(0))) {
        throw new Error('Current MTC reference requires distinct actual prior originals');
      }
      seen.add(row.sourceId);
      same(row.opening, sumSourceMoney(row.currentUse, row.beforeReduction));
      same(row.carrybackUse, zero); same(row.expiredAfterReduction, zero); same(row.incomeApplied, zero); same(row.attributeReduction, zero);
    }
    same(sumSourceMoney(...pool.priorSourceRecords.map(row => row.opening)), source.currentCreditAvailable);
    same(sumSourceMoney(...pool.priorSourceRecords.map(row => row.currentUse)), source.currentCreditUsed);
    same(sumSourceMoney(...pool.priorSourceRecords.map(row => row.beforeReduction)), source.currentFormCarry);
    same(pool.currentCreditAvailable, source.currentCreditAvailable); same(pool.currentCreditUsed, source.currentCreditUsed);
    same(pool.currentFormCarry, source.currentFormCarry); same(pool.signedCurrentAdjustment, source.signedCurrentAdjustment);
    same(pool.beforeReduction, source.followingYearPool);
    same(pool.attributeReduction, sumSourceMoneyRatios([pool.reductionRatio]));
    same(pool.incomeApplied, sumSourceMoneyRatios([pool.reductionRatio, pool.reductionRatio, pool.reductionRatio]));
    same(sumSourceMoneyRatios([pool.reductionRatio, pool.remainingRatio]), pool.beforeReduction);
    same(pool.remaining, sumSourceMoneyRatios([pool.remainingRatio]));
    const ledger = index === 0 ? later.regular : later.alternativeTax;
    if (ledger.records.some(row => row.kind === 'minimum_tax_credit')) throw new Error('Current MTC reference cannot fabricate duplicate per-vintage aggregate reductions');
    const stages = ledger.stages.filter(row => row.kind === 'minimum_tax_credit');
    if (stages.length !== 1) throw new Error('Current MTC reference requires one aggregate reduction stage');
    same(stages[0]!.attributeReduction, pool.attributeReduction); same(stages[0]!.incomeApplied, pool.incomeApplied);
  }
  const pool = pools[0]!;
  same(result.carryforwards.minimumTaxCredit, pool.remaining);
  return [
    { label: 'Current full Form8801 available credit', value: source.currentCreditAvailable.toFixed() },
    { label: 'Current full Form8801 credit used', value: source.currentCreditUsed.toFixed() },
    { label: 'Current full Form8801 carry before signed adjustment', value: source.currentFormCarry.toFixed() },
    { label: 'Signed current-year minimum tax credit adjustment', value: source.signedCurrentAdjustment.toFixed() },
    { label: 'Beginning-next-year minimum tax credit before COD', value: source.followingYearPool.toFixed() },
    { label: 'Minimum tax credit aggregate after COD', value: pool.remaining.toFixed() },
    ...pool.priorSourceRecords.flatMap((row, index) => [
      { label: `Prior minimum tax credit source ${index + 1} original year`, value: String(row.originTaxYear) },
      { label: `Prior minimum tax credit source ${index + 1} opening`, value: row.opening.toFixed() },
      { label: `Prior minimum tax credit source ${index + 1} actual current use`, value: row.currentUse.toFixed() },
      { label: `Prior minimum tax credit source ${index + 1} before aggregate adjustment`, value: row.beforeReduction.toFixed() },
    ]),
    ...lines.map(row => ({ label: `Current-source PartI line${row.line}`, value: row.value.toFixed() })),
  ];
}
