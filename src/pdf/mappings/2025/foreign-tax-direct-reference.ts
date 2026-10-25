import Decimal from 'decimal.js';
import type { CalculatedLine, TaxReturnResult } from '@/models/outputs.js';
import { d, min, roundDollar, sum } from '@/utils/decimal.js';

export const DIRECT_FOREIGN_CREDIT_FORM = 'Foreign Direct Credit WS';

/** Copy the canonical election; never recalculate a new tax or infer prior balances. */
export function directForeignCreditReferenceLines(result: TaxReturnResult): CalculatedLine[] | undefined {
  const credit = result.foreignTaxDirectCredit;
  const canonical = result.allLines.filter(row => row.form === DIRECT_FOREIGN_CREDIT_FORM);
  if (!credit) {
    if (canonical.length) throw new Error('Direct foreign-credit audit is missing its calculated source result');
    return undefined;
  }
  const sources = result.scheduleA?.foreignTaxElection.directCreditSources;
  if (!sources || sources.taxYear !== result.taxYear || result.scheduleA?.foreignTaxElection.election !== 'credit' || result.foreignTaxDeductionCarryover) {
    throw new Error('Direct foreign-credit record requires the actual source election');
  }
  const finite = (value: Decimal): boolean => Decimal.isDecimal(value) && value.isFinite();
  const nonnegative = (value: Decimal): boolean => finite(value) && value.gte(0);
  const byId = new Map<string, CalculatedLine>();
  for (const row of canonical) {
    if (byId.has(row.line) || !finite(row.value)) throw new Error('Direct foreign-credit audit is duplicate or invalid');
    byId.set(row.line, row);
  }
  if (!credit.lines.length || canonical.length !== credit.lines.length) throw new Error('Direct foreign-credit audit is incomplete');
  const copied = new Set<string>();
  const required = (id: string): CalculatedLine => {
    const row = byId.get(id);
    if (!row) throw new Error(`Direct foreign-credit audit is missing ${id}`);
    return row;
  };
  for (const row of credit.lines) {
    const actual = required(row.line);
    if (row.form !== DIRECT_FOREIGN_CREDIT_FORM || copied.has(row.line) || !finite(row.value)
      || !actual.value.eq(row.value) || actual.description !== row.description || actual.formula !== row.formula
      || Object.keys(actual.inputs).length !== Object.keys(row.inputs).length
      || Object.entries(row.inputs).some(([key, value]) => Decimal.isDecimal(value)
        ? !Decimal.isDecimal(actual.inputs[key]) || !value.eq(actual.inputs[key]) : actual.inputs[key] !== value)) {
      throw new Error('Direct foreign-credit audit does not match its calculated source result');
    }
    copied.add(row.line);
  }
  if (!nonnegative(credit.currentTaxExact) || !credit.currentTaxExact.eq(sources.currentTaxExact)
    || !sum(...sources.lines.map(row => row.value)).eq(credit.currentTaxExact)
    || sources.lines.some(row => !required(row.line).value.eq(row.value))) throw new Error('Direct foreign-credit actual source tax does not reconcile');
  if (!nonnegative(credit.regularTaxLimit) || !credit.regularTaxLimit.isInteger()
    || !credit.currentTaxReported.eq(roundDollar(credit.currentTaxExact))
    || !credit.creditAllowed.eq(min(credit.currentTaxReported, credit.regularTaxLimit))
    || !credit.currentTaxUncredited.eq(credit.currentTaxReported.minus(credit.creditAllowed))
    || !result.foreignTaxCredit.eq(credit.creditAllowed)) throw new Error('Direct foreign-credit current tax does not reconcile');
  for (const [id, value] of [
    ['reported-tax', credit.currentTaxReported], ['regular-tax', credit.regularTaxLimit], ['allowed-credit', credit.creditAllowed],
    ['current-uncredited', credit.currentTaxUncredited], ['current-carry-created', d('0')],
    ['prior-carry-retained', credit.carryforward], ['prior-carry-expired', credit.expired],
    ['amt-carry-retained', credit.amtCarryforward], ['amt-carry-expired', credit.amtExpired],
  ] as const) if (!nonnegative(value) || !required(id).value.eq(value)) throw new Error('Direct foreign-credit audit totals do not reconcile');
  const detailById = new Map<string, (typeof credit.details)[number]>();
  for (const [prefix, rows, original, retained, expired, groups, saved] of [
    ['regular', credit.details, sources.carryovers, credit.carryforward, credit.expired, credit.carryforwardByCategory, result.carryforwards.foreignTaxCreditCarryforwardByCategory],
    ['amt', credit.amtDetails, sources.amtCarryovers, credit.amtCarryforward, credit.amtExpired, credit.amtCarryforwardByCategory, result.carryforwards.amtForeignTaxCreditCarryforwardByCategory],
  ] as const) {
    if (rows.length !== original.length) throw new Error('Direct foreign-credit carry history is incomplete');
    const expected = new Map<string, Decimal>();
    for (const row of rows) {
      const key = `${row.category}:${row.originTaxYear}`, id = `${prefix}:${key}`;
      const source = original.find(item => item.category === row.category && item.originTaxYear === row.originTaxYear);
      if (!source || detailById.has(id) || !['passive', 'general'].includes(row.category)
        || !Number.isInteger(row.originTaxYear) || row.originTaxYear < result.taxYear - 10 || row.originTaxYear >= result.taxYear
        || ![row.amount, row.used, row.expired, row.remaining].every(nonnegative) || !row.amount.eq(source.amount) || !row.used.isZero()
        || !row.expired.eq(row.originTaxYear === result.taxYear - 10 ? row.amount : d('0'))
        || !row.amount.eq(row.remaining.plus(row.expired))) throw new Error('Direct foreign-credit carry balances do not conserve actual prior history');
      detailById.set(id, row);
      const audit = required(id);
      if (!audit.value.eq(row.remaining)) throw new Error('Direct foreign-credit audit balance does not reconcile');
      for (const [key, value] of [['opening', row.amount], ['used', row.used], ['expired', row.expired]] as const) {
        const actual = audit.inputs[key];
        if (!Decimal.isDecimal(actual) || !actual.eq(value)) throw new Error('Direct foreign-credit audit carry inputs do not reconcile');
      }
      if (row.remaining.gt(0)) expected.set(key, row.remaining);
    }
    if (!sum(...rows.map(row => row.remaining)).eq(retained) || !sum(...rows.map(row => row.expired)).eq(expired)) throw new Error('Direct foreign-credit carry totals do not reconcile');
    for (const collection of [groups, saved]) {
      if (!collection) throw new Error('Direct foreign-credit retained carry ledger is missing');
      const actual = new Map<string, Decimal>();
      for (const [category, entries] of Object.entries(collection)) {
        if (!['passive', 'general'].includes(category)) throw new Error('Direct foreign-credit retained category is invalid');
        for (const row of entries) {
          const key = `${category}:${row.taxYear}`;
          if (actual.has(key) || !nonnegative(row.amount)) throw new Error('Direct foreign-credit retained balances are invalid');
          actual.set(key, row.amount);
        }
      }
      if (actual.size !== expected.size || [...expected].some(([key, value]) => !value.eq(actual.get(key) ?? d('-1')))) throw new Error('Direct foreign-credit retained balances do not reconcile');
    }
  }
  if (!result.carryforwards.foreignTaxCreditCarryforward.eq(credit.carryforward)) throw new Error('Direct foreign-credit regular carry total does not reconcile');
  return credit.lines.map(row => {
    const detail = detailById.get(row.line);
    return detail ? { ...required(row.line), formula: `Opening ${detail.amount}; used 0; expired ${detail.expired}; retained ${detail.remaining}. No election-year use.` } : required(row.line);
  });
}
