import Decimal from 'decimal.js';
import type { ForeignTaxCarryoverDetail } from '@/engine/forms/foreign-tax-deduction-carryover.js';
import type { CalculatedLine, TaxReturnResult } from '@/models/outputs.js';
import { d, min, roundDollar, sum } from '@/utils/decimal.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';
import { sumSourceMoneyRatios } from '@/utils/sum-source-money-ratios.js';

export const DIRECT_FOREIGN_CREDIT_FORM = 'Foreign Direct Credit WS';

/** The election-year credit remains unchanged; COD has a separate closing ledger. */
export function foreignCreditCarryAfterCod(result: TaxReturnResult, alternative: boolean, before: Map<string, Decimal>,
  form = DIRECT_FOREIGN_CREDIT_FORM, deductionDetails?: readonly ForeignTaxCarryoverDetail[]) {
  const cod = result.codAttributeReduction;
  if (!cod) {
    if (result.allLines.some(row => row.form.endsWith(' COD Attribute Worksheet'))) throw new Error('Foreign credit is missing its COD source ledger');
    return { expected: before, lines: [] as CalculatedLine[] };
  }
  const ledger = alternative ? cod.alternativeTax : cod.regular;
  if (cod.sourceFactsVerified !== true || ledger.sourceFactsVerified !== true
    || result.codNolReduction?.sourceFactsVerified !== true || result.codNolReduction.calculationComplete !== true) {
    throw new Error('Direct foreign-credit COD closing requires its complete original-source results');
  }
  const rows = ledger.records.filter(row => row.kind === 'foreign_tax_credit');
  const seen = new Set<string>(), normal = new Map<string, Decimal>(), expected = new Map<string, Decimal>();
  const nonnegative = (value: Decimal) => Decimal.isDecimal(value) && value.isFinite() && value.gte(0);
  for (const row of rows) {
    if (!row.sourceId.trim() || seen.has(row.sourceId) || !['passive', 'general'].includes(row.foreignCategory ?? '')
      || !Number.isInteger(row.originTaxYear) || row.originTaxYear < 1900 || row.originTaxYear > result.taxYear
      || (row.originTaxYear < result.taxYear - 10 && row.beforeReduction.gt(0))
      || ![row.opening, row.currentUse, row.carrybackUse, row.deemedAbsorption, row.beforeReduction, row.carryforwardBeforeReduction, row.attributeReduction, row.incomeApplied, row.remaining, row.expiredAfterReduction].every(nonnegative)
      || !row.opening.eq(sumSourceMoney(row.currentUse, row.carrybackUse, row.deemedAbsorption, row.beforeReduction))
      || (!deductionDetails && !row.deemedAbsorption.isZero())
      || !row.carryforwardBeforeReduction.eq(row.originTaxYear === result.taxYear - 10 ? d('0') : row.beforeReduction)
      || !row.attributeReduction.eq(sumSourceMoneyRatios([row.reductionRatio]))
      || !row.incomeApplied.eq(sumSourceMoneyRatios([row.reductionRatio, row.reductionRatio, row.reductionRatio]))
      || !row.beforeReduction.eq(sumSourceMoneyRatios([row.reductionRatio, row.remainingRatio]))
      || !sumSourceMoney(row.remaining, row.expiredAfterReduction).eq(sumSourceMoneyRatios([row.remainingRatio]))) {
      throw new Error('Direct foreign-credit COD source records are duplicate or do not conserve their balances');
    }
    seen.add(row.sourceId);
  }
  if (deductionDetails) {
    const keys = new Set<string>();
    for (const detail of deductionDetails) {
      const key = `${detail.category}:${detail.originTaxYear}`;
      if (keys.has(key)) throw new Error('Foreign COD deemed absorption source is duplicated');
      keys.add(key);
      const group = rows.filter(row => `${row.foreignCategory}:${row.originTaxYear}` === key);
      if (!sumSourceMoney(...group.map(row => row.opening)).eq(detail.amount)
        || !sumSourceMoney(...group.map(row => row.deemedAbsorption)).eq(detail.absorbed)
        || group.some(row => !row.currentUse.isZero() || !row.carrybackUse.isZero())) {
        throw new Error('Foreign COD derived absorption does not reconcile with its original deduction-year source');
      }
    }
    if (rows.some(row => !keys.has(`${row.foreignCategory}:${row.originTaxYear}`))) throw new Error('Foreign COD source is missing its deduction-year absorption');
  }
  for (const key of new Set(rows.map(row => `${row.foreignCategory}:${row.originTaxYear}`))) {
    const group = rows.filter(row => `${row.foreignCategory}:${row.originTaxYear}` === key);
    const prior = sumSourceMoney(...group.map(row => row.carryforwardBeforeReduction));
    const closing = sumSourceMoneyRatios(group.filter(row => row.expiredAfterReduction.isZero()).map(row => row.remainingRatio));
    if (prior.gt(0)) normal.set(key, prior);
    if (closing.gt(0)) expected.set(key, closing);
  }
  if (normal.size !== before.size || [...before].some(([key, amount]) => !amount.eq(normal.get(key) ?? d('-1')))) {
    throw new Error('Direct foreign-credit COD opening does not match its actual normal-year carry');
  }
  const stage = ledger.stages.filter(row => row.kind === 'foreign_tax_credit');
  const label = alternative ? 'Alternative' : 'Regular';
  const audit = result.allLines.filter(row => row.form === `${label} COD Attribute Worksheet` && row.line === 'foreign_tax_credit');
  const reduction = sumSourceMoneyRatios(rows.map(row => row.reductionRatio));
  const income = sumSourceMoney(...rows.map(row => row.incomeApplied));
  if (stage.length !== 1 || audit.length !== 1 || !stage[0].attributeReduction.eq(reduction) || !stage[0].incomeApplied.eq(income)
    || !audit[0].value.eq(income) || !Decimal.isDecimal(audit[0].inputs['Attribute reduction']) || !audit[0].inputs['Attribute reduction'].eq(reduction)) {
    throw new Error('Direct foreign-credit COD stage does not reconcile with its retained audit');
  }
  const lines: CalculatedLine[] = [
    { form, line: `cod-${alternative ? 'amt' : 'regular'}-reduction`, description: `${label} foreign credit attribute reduction after current tax`,
      value: reduction, formula: 'One third of the excluded income applied after earlier statutory attribute stages.', inputs: { 'Excluded income applied': income } },
    ...[...expected].map(([key, value]) => ({ form, line: `cod-${alternative ? 'amt' : 'regular'}-${key}`,
      description: `${label} ${key} carry after COD`, value, formula: 'Actual normal-year carry less the separately reconciled COD reduction and any residual expiry.', inputs: {} })),
    { form, line: `cod-${alternative ? 'amt' : 'regular'}-carry-total`, description: `${label} total foreign credit carry after COD`,
      value: sumSourceMoneyRatios(rows.filter(row => row.expiredAfterReduction.isZero()).map(row => row.remainingRatio)),
      formula: 'Exact remaining original credit ratios after statutory reduction and expiry.', inputs: {} },
  ];
  return { expected, lines };
}

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
  const codLines: CalculatedLine[] = [];
  let regularClosing = credit.carryforward;
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
    const closing = foreignCreditCarryAfterCod(result, prefix === 'amt', expected);
    codLines.push(...closing.lines);
    if (prefix === 'regular') regularClosing = closing.lines.length ? closing.lines[closing.lines.length - 1].value : retained;
    for (const [collection, expectedCollection] of [[groups, expected], [saved, closing.expected]] as const) {
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
      if (actual.size !== expectedCollection.size || [...expectedCollection].some(([key, value]) => !value.eq(actual.get(key) ?? d('-1')))) throw new Error('Direct foreign-credit retained balances do not reconcile');
    }
  }
  if (!result.carryforwards.foreignTaxCreditCarryforward.eq(regularClosing)) throw new Error('Direct foreign-credit regular carry total does not reconcile');
  return [...credit.lines.map(row => {
    const detail = detailById.get(row.line);
    const actual = required(row.line);
    const beforeCod = result.codAttributeReduction && (detail || ['prior-carry-retained', 'amt-carry-retained'].includes(row.line));
    return { ...actual, ...(beforeCod ? { description: `${actual.description} before COD` } : {}),
      ...(detail ? { formula: `Opening ${detail.amount}; used 0; expired ${detail.expired}; retained ${detail.remaining}. No election-year use.${beforeCod ? ' Separate COD closing follows below.' : ''}` } : {}) };
  }), ...codLines];
}
