import Decimal from 'decimal.js';
import type { CalculatedLine, TaxReturnResult } from '@/models/outputs.js';
import type { ForeignTaxPriorReturnCapacity } from '@/engine/forms/foreign-tax-ordinary-credit.js';
import { d, min, roundDollar, sum, zeroFloor } from '@/utils/decimal.js';

const REGULAR = 'Form 1116 (actual passive)', AMT = 'AMT Form 1116 (actual passive)';
const finite = (value: Decimal): boolean => Decimal.isDecimal(value) && value.isFinite();
const nonnegative = (value: Decimal): boolean => finite(value) && value.gte(0);
const id = (row: Pick<CalculatedLine, 'form' | 'line'>) => `${row.form}:${row.line}`;
function sameAudit(a: CalculatedLine, b: CalculatedLine): boolean {
  return a.form === b.form && a.line === b.line && finite(a.value) && finite(b.value) && a.value.eq(b.value)
    && a.description === b.description && a.formula === b.formula && Object.keys(a.inputs).length === Object.keys(b.inputs).length
    && Object.entries(a.inputs).every(([key, value]) => Decimal.isDecimal(value)
      ? Decimal.isDecimal(b.inputs[key]) && value.eq(b.inputs[key]) : b.inputs[key] === value);
}
function priorCapacity(record: ForeignTaxPriorReturnCapacity | undefined, year: number): Decimal {
  if (!record || record.taxYear !== year - 1 || record.sourceFactsConfirmed !== true || record.allPriorUseIncludedConfirmed !== true || !record.sourceReference.trim()) throw new Error('Ordinary credit prior capacity source is incomplete');
  if (record.election === 'direct_credit_election') return d('0');
  const { limitation, currentTaxes, priorCarryoversUsed } = record;
  if (record.election !== 'form1116_credit' || !limitation || !currentTaxes || !priorCarryoversUsed
    || ![limitation, currentTaxes, priorCarryoversUsed].every(value => nonnegative(value) && value.isInteger())
    || priorCarryoversUsed.gt(zeroFloor(limitation.minus(currentTaxes)))) throw new Error('Ordinary credit prior capacity source is inconsistent');
  return zeroFloor(limitation.minus(currentTaxes).minus(priorCarryoversUsed));
}
/** Validate and copy calculated records. Never derive a new tax from render-time input. */
export function ordinaryForeignCreditReferenceSections(result: TaxReturnResult): Array<{ form: string; lines: CalculatedLine[] }> | undefined {
  const credit = result.foreignTaxOrdinaryCredit;
  const taxAudits = result.allLines.filter(row => row.form === REGULAR || row.form === AMT);
  if (!credit) {
    if (taxAudits.length) throw new Error('Ordinary foreign credit audit is missing its calculated source result');
    return undefined;
  }
  const annual = result.scheduleA?.foreignTaxElection, sources = annual?.ordinaryCreditSources;
  if (!sources || sources.taxYear !== result.taxYear || annual?.election !== 'credit' || !annual.sourceFactsVerified
    || result.foreignTaxDirectCredit || result.foreignTaxDeductionCarryover) throw new Error('Ordinary foreign credit requires its actual source election');
  const canonical = new Map<string, CalculatedLine>();
  const forms = new Set([...credit.lines, ...sources.lines].map(row => row.form));
  for (const row of result.allLines.filter(row => forms.has(row.form))) {
    if (canonical.has(id(row)) || !finite(row.value)) throw new Error('Ordinary foreign credit audit is duplicate or invalid');
    canonical.set(id(row), row);
  }
  const requireAudit = (row: CalculatedLine) => {
    const actual = canonical.get(id(row));
    if (!actual || !sameAudit(row, actual)) throw new Error('Ordinary foreign credit audit does not match its calculated source');
    return actual;
  };
  const copied = new Set<string>();
  for (const row of [...credit.lines, ...sources.lines]) {
    if (copied.has(id(row))) throw new Error('Ordinary foreign credit calculated audit is duplicate');
    copied.add(id(row)); requireAudit(row);
  }
  if (canonical.size !== copied.size || credit.lines.length !== credit.regular.lines.length + credit.amt.lines.length) throw new Error('Ordinary foreign credit audit is incomplete');
  const currentExact = sum(...sources.countries.map(row => row.tax)), currentReported = sum(...sources.countries.map(row => roundDollar(row.tax)));
  if (!currentExact.eq(sources.currentTaxExact) || !nonnegative(currentExact)) throw new Error('Ordinary foreign credit actual paid tax does not reconcile');
  for (const [form, category, original, prior, saved] of [
    [REGULAR, credit.regular, sources.carryovers, sources.regularCarryback, result.carryforwards.foreignTaxCreditCarryforwardByCategory],
    [AMT, credit.amt, sources.amtCarryovers, sources.amtCarryback, result.carryforwards.amtForeignTaxCreditCarryforwardByCategory],
  ] as const) {
    const lines = new Map(category.lines.filter(row => row.form === form).map(row => [row.line, row]));
    const line = (key: string) => { const row = lines.get(key); if (!row) throw new Error(`Ordinary foreign credit audit is missing ${key}`); return requireAudit(row); };
    if (category.lines.some(row => !credit.lines.some(full => sameAudit(row, full))) || lines.size !== taxAudits.filter(row => row.form === form).length) throw new Error('Ordinary foreign credit category audit is incomplete');
    for (const [key, value] of [
      ['9', category.currentTaxReported], ['17', category.netForeignTaxableIncome], ['18', category.worldwideTaxableIncome], ['19', category.limitationRatio],
      ['21', category.limitation], ['24', category.creditAllowed], ['35', category.creditAllowed], ['prior-used', category.priorUsed], ['expired', category.expired],
      ['current-excess', category.currentTaxExcess], ['carryback', category.carryback], ['new-carry', category.currentCarryforward], ['carryforward', category.carryforward],
    ] as const) if (!nonnegative(value) || !line(key).value.eq(value)) throw new Error('Ordinary foreign credit calculated totals do not reconcile');
    if (!category.currentTaxExact.eq(currentExact) || !category.currentTaxReported.eq(currentReported)) throw new Error('Ordinary foreign credit original paid tax does not reconcile');
    const expectedRatio = category.worldwideTaxableIncome.lte(0) ? d('0') : min(d('1'), category.netForeignTaxableIncome.div(category.worldwideTaxableIncome).toDecimalPlaces(4, Decimal.ROUND_HALF_UP));
    if (!category.limitationRatio.eq(expectedRatio) || !category.limitation.eq(roundDollar(line('20').value.times(expectedRatio)))) throw new Error('Ordinary foreign credit limitation audit does not reconcile');
    const expected = new Map<string, Decimal>(), seen = new Set<string>(); let capacity = zeroFloor(category.limitation.minus(currentReported));
    if (category.details.length !== original.length) throw new Error('Ordinary foreign credit prior history is incomplete');
    for (const row of [...category.details].sort((a, b) => a.originTaxYear - b.originTaxYear || a.category.localeCompare(b.category))) {
      const key = `${row.category}:${row.originTaxYear}`, source = original.find(item => item.category === row.category && item.originTaxYear === row.originTaxYear);
      if (!source || seen.has(key) || !Number.isInteger(row.originTaxYear) || row.originTaxYear < result.taxYear - 10 || row.originTaxYear >= result.taxYear
        || ![row.amount, row.used, row.expired, row.remaining].every(nonnegative) || !row.amount.eq(source.amount)) throw new Error('Ordinary foreign credit prior source balances are invalid');
      seen.add(key); const used = row.category === 'passive' ? min(row.amount, capacity) : d('0'); capacity = capacity.minus(used);
      const expired = row.originTaxYear === result.taxYear - 10 ? row.amount.minus(used) : d('0');
      if (!row.used.eq(used) || !row.expired.eq(expired) || !row.amount.eq(sum(row.used, row.expired, row.remaining))) throw new Error('Ordinary foreign credit prior balances do not conserve actual FIFO history');
      const audit = line(`${key}:remaining`);
      if (!audit.value.eq(row.remaining) || ([['opening', row.amount], ['used', row.used], ['expired', row.expired]] as const).some(([name, value]) => !Decimal.isDecimal(audit.inputs[name]) || !value.eq(audit.inputs[name]))) throw new Error('Ordinary foreign credit carry audit does not reconcile');
      if (row.remaining.gt(0)) expected.set(key, row.remaining);
    }
    if (!category.priorUsed.eq(sum(...category.details.map(row => row.used))) || !category.expired.eq(sum(...category.details.map(row => row.expired)))
      || !category.creditAllowed.eq(min(category.limitation, roundDollar(min(currentReported, category.limitation).plus(category.priorUsed))))
      || !category.currentTaxExcess.eq(zeroFloor(currentReported.minus(category.limitation)))) throw new Error('Ordinary foreign credit current and prior credits do not reconcile');
    const back = category.currentTaxExcess.gt(0) ? min(category.currentTaxExcess, priorCapacity(prior, result.taxYear)) : d('0');
    if (!category.carryback.eq(back) || !category.currentTaxExcess.eq(category.carryback.plus(category.currentCarryforward))
      || !category.carryforward.eq(sum(...category.details.map(row => row.remaining), category.currentCarryforward))) throw new Error('Ordinary foreign credit excess and carry balances do not conserve');
    if (category.currentCarryforward.gt(0)) expected.set(`passive:${result.taxYear}`, category.currentCarryforward);
    for (const collection of [category.carryforwardByCategory, saved]) {
      if (!collection) throw new Error('Ordinary foreign credit saved carry ledger is missing');
      const actual = new Map<string, Decimal>();
      for (const [kind, entries] of Object.entries(collection)) for (const row of entries) {
        const key = `${kind}:${row.taxYear}`;
        if (!['passive', 'general'].includes(kind) || actual.has(key) || !nonnegative(row.amount)) throw new Error('Ordinary foreign credit saved carry balances are invalid');
        actual.set(key, row.amount);
      }
      if (actual.size !== expected.size || [...expected].some(([key, value]) => !value.eq(actual.get(key) ?? d('-1')))) throw new Error('Ordinary foreign credit saved carry balances do not reconcile');
    }
  }
  const amt8 = result.allLines.filter(row => row.form === 'Form 6251' && row.line === '8');
  if (!result.foreignTaxCredit.eq(credit.regular.creditAllowed) || !result.carryforwards.foreignTaxCreditCarryforward.eq(credit.regular.carryforward)
    || amt8.length !== 1 || !amt8[0].value.eq(credit.amt.creditAllowed)) throw new Error('Ordinary foreign credit return amounts do not reconcile');
  return [REGULAR, AMT].map(form => ({ form, lines: credit.lines.filter(row => row.form === form).map(row => {
    const actual = requireAudit(row), category = form === REGULAR ? credit.regular : credit.amt;
    const detail = category.details.find(item => `${item.category}:${item.originTaxYear}:remaining` === row.line);
    if (detail) return { ...actual, formula: `Opening ${detail.amount}; used ${detail.used}; expired ${detail.expired}; retained ${detail.remaining}.` };
    // This allocation helper is also used by a hypothetical deduction-year
    // method. The validated actual-credit record must label its own method.
    return actual.description === 'Hypothetical net ordinary foreign income'
      ? { ...actual, description: 'Actual net ordinary foreign income' } : actual;
  }) }));
}
