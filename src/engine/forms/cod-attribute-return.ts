/** Bind complete ordinary108 original records to completed current-tax outputs.
 * Spec: spec/federal/cod-ordinary-attribute-sources.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CodNolReductionResult, CodNolSourceInput } from './cod-nol-reductions.js';
import { calculateCodAttributeReductions, type CodAttributeReductionResult, type CodAttributeReductionLedger } from './cod-attribute-reductions.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';
import { d } from '@/utils/decimal.js';
import type { CodAttributeLedgerSources } from '@/models/cod-attribute-sources.js';

export type CodAttributeSourceInput = CodNolSourceInput & Pick<TaxYearInput, 'form982AttributeSources'>;
export interface CodAttributeCanonicalContext {
  nol: CodNolReductionResult;
  generalBusinessCredit: Decimal; generalBusinessAvailable: Decimal; generalBusinessUsed: Decimal;
  minimumTaxCredit: Decimal; minimumTaxAvailable: Decimal; minimumTaxUsed: Decimal;
  currentMinimumTaxCreditZeroProven: boolean;
  shortTermCapitalLoss: Decimal; longTermCapitalLoss: Decimal;
  capitalOpenings: Record<'short' | 'long', { prior: Decimal; current: Decimal }>;
  passiveLosses: Array<{ name: string; amount: Decimal; qualifiedCarryPresent: boolean }>;
  passiveCreditUsed: Decimal;
  foreignCreditUsed: Decimal; alternativeForeignCreditUsed: Decimal; foreignCredit: Decimal;
  foreignCreditByCategory: Record<string, Array<{ taxYear: number; amount: Decimal }>>;
  alternativeForeignCreditByCategory?: Record<string, Array<{ taxYear: number; amount: Decimal }>>;
}
const total = (...values: Decimal[]) => sumSourceMoney(...values);
const cleanName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
function same(actual: Decimal, expected: Decimal, label: string): void {
  if (!actual.eq(expected)) throw new Error(`COD ${label} must reconcile with canonical current use and original closing sources`);
}
const sharedCredit = (kind: string | undefined) => kind === 'general_business_credit' || kind === 'minimum_tax_credit' || kind === 'passive_credit';
/** Compare financial vectors, not source-reference spelling or array order.
 * Each original's identities and references remain bound by the complete input. */
function attributeVector(ledger: CodAttributeLedgerSources | undefined): string {
  const amounts = new Set(['originalAmount', 'used', 'reduced', 'expired', 'currentYearUse', 'currentYearCarryback', 'currentYearExpired', 'adjustedBasis', 'money', 'amount']);
  const omitted = new Set(['sourceReference', 'sourceId', 'priorSnapshotChangeReference', 'currentYearUseSourceReference', 'sourceFactsConfirmed']);
  const normalize = (value: unknown, key = ''): unknown => {
    if (Array.isArray(value)) return value.map(row => normalize(row)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([name]) => !omitted.has(name))
      .sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => [name, normalize(child, name)]));
    return amounts.has(key) && typeof value === 'string' ? new Decimal(value).toFixed() : value;
  };
  return JSON.stringify(normalize({ ...ledger, records: ledger?.records?.filter(row => !sharedCredit(row.kind)) }));
}

/** No context means original-source validation only; no reduction is returned. */
export function calculateCodAttributeReturn(input: CodAttributeSourceInput, context?: CodAttributeCanonicalContext): CodAttributeReductionResult | undefined {
  const facts = input.form982AttributeSources;
  if (!facts) {
    if (context) throw new Error('COD requires actual complete later-attribute sources');
    return undefined;
  }
  const year = input.taxpayer.taxYear, primary = input.taxpayer.primary;
  const primaryId = primary.ssn.replace(/\D/g, '');
  if (!input.form982NolSources || facts.sourceTaxYear !== year || facts.sourceFactsConfirmed !== true || facts.allAttributesIncluded !== true
    || !facts.sourceReference?.trim() || facts.accountHolder !== 'primary' || facts.taxpayerIdLast4 !== primaryId.slice(-4)
    || primaryId.length !== 9 || cleanName(facts.taxpayerName ?? '') !== cleanName(`${primary.firstName} ${primary.lastName}`)
    || !facts.dischargeDate || input.form982NolSources.debts?.some(row => row.dischargeDate !== facts.dischargeDate)) {
    throw new Error('COD later attributes require the same actual confirmed owner, year and original discharge source');
  }
  if (!facts.alternativeTax) throw new Error('COD requires actual independent alternative attribute sources');
  const currentMinimum = facts.currentMinimumTaxCredit;
  if (currentMinimum?.sourceFactsConfirmed !== true || !currentMinimum.sourceReference?.trim()
    || currentMinimum.allCurrentAdjustmentSourcesIncluded !== true || currentMinimum.noAdditionalDeferralItemsConfirmed !== true
    || (context && context.currentMinimumTaxCreditZeroProven !== true)) {
    throw new Error('COD current-year minimum tax credit requires its actual exclusion-only calculation or the complete source-proved zero method');
  }
  if (!Array.isArray(facts.alternativeTax.records)) throw new Error('COD requires an explicit complete alternative attribute list, including empty');
  if (facts.alternativeTax.records?.some(row => sharedCredit(row.kind))) {
    throw new Error('COD shared credit originals must be collected once; a second alternative credit inventory is not accepted');
  }
  if ([facts.regular, facts.alternativeTax].some(ledger => ledger?.property?.followingYear?.dispositions?.length)) {
    throw new Error('COD intervening property disposition requires its actual current-return transaction and recapture reconciliation');
  }
  if (context && (!context.nol.calculationComplete || !context.nol.regular || !context.nol.alternativeTax)) {
    throw new Error('COD requires the completed independent NOL reductions before later attributes');
  }
  const alternativeSources = { ...facts.alternativeTax, records: [
    ...(facts.alternativeTax.records ?? []), ...(facts.regular?.records?.filter(row => sharedCredit(row.kind)) ?? []),
  ] };
  const calculate = (sources: CodAttributeLedgerSources | undefined, remainingExclusion: Decimal) => calculateCodAttributeReductions({
    taxYear: year, dischargeDate: facts.dischargeDate!, remainingExclusion, sources,
  });
  let regular = calculate(facts.regular, d('0')), alternativeTax = calculate(alternativeSources, d('0'));
  if (context) {
    const regularRemaining = total(context.nol.reportedExcludedAmount, context.nol.regular!.reduction.negated());
    const alternativeRemaining = total(context.nol.reportedExcludedAmount, context.nol.alternativeTax!.reduction.negated());
    if (regular.records.some(row => sharedCredit(row.kind) && row.beforeReduction.gt(0))
      && !(regularRemaining.isZero() && alternativeRemaining.isZero())
      && (!regularRemaining.eq(alternativeRemaining) || attributeVector(facts.regular) !== attributeVector(facts.alternativeTax))) {
      throw new Error('COD positive shared credit composition requires the complete equal regular/alternative vector and actual NOL reductions');
    }
    regular = calculate(facts.regular, regularRemaining); alternativeTax = calculate(alternativeSources, alternativeRemaining);
  }
  // No property transfer, deductible interest or new borrowing occurs at the
  // single discharge event admitted by this source method.
  const beforeLiabilities = total(...(input.form982NolSources.insolvency?.liabilities ?? []).map(row => d(row.amount)));
  const discharged = total(...(input.form982NolSources.debts ?? []).map(row => d(row.amountDischarged)));
  for (const ledger of [regular, alternativeTax]) {
    same(ledger.property.immediatelyAfterLiabilities, total(beforeLiabilities, discharged.negated()), 'immediately-after liabilities');
  }
  if (!context) return undefined;
  const kinds = (ledger: CodAttributeReductionLedger, kind: string) => ledger.records.filter(row => row.kind === kind);
  const checkCredit = (kind: 'general_business_credit' | 'minimum_tax_credit', closing: Decimal, available: Decimal, used: Decimal) => {
    const rows = kinds(regular, kind);
    same(total(...rows.map(row => row.opening)), available, `${kind} original available amounts`);
    same(total(...rows.map(row => row.currentUse)), used, `${kind} current use`);
    same(total(...rows.map(row => total(row.beforeReduction, row.carrybackUse))), closing, `${kind} before reduction`);
  };
  checkCredit('general_business_credit', context.generalBusinessCredit, context.generalBusinessAvailable, context.generalBusinessUsed);
  checkCredit('minimum_tax_credit', context.minimumTaxCredit, context.minimumTaxAvailable, context.minimumTaxUsed);
  for (const ledger of [regular, alternativeTax]) {
    for (const term of ['short', 'long'] as const) {
      const rows = kinds(ledger, 'capital_loss').filter(row => row.term === term);
      same(total(...rows.filter(row => row.originTaxYear < year).map(row => row.opening)), context.capitalOpenings[term].prior,
        `capital ${term} original prior opening`);
      same(total(...rows.filter(row => row.originTaxYear === year).map(row => row.opening)), context.capitalOpenings[term].current,
        `capital ${term} original current loss`);
    }
    same(total(...kinds(ledger, 'capital_loss').filter(row => row.term === 'short').map(row => row.beforeReduction)), context.shortTermCapitalLoss.negated(), 'capital short-term closing');
    same(total(...kinds(ledger, 'capital_loss').filter(row => row.term === 'long').map(row => row.beforeReduction)), context.longTermCapitalLoss.negated(), 'capital long-term closing');
    const names = new Set([...context.passiveLosses.map(row => row.name), ...kinds(ledger, 'passive_loss').map(row => row.activityName!)]);
    for (const name of names) {
      const canonical = context.passiveLosses.filter(row => row.name === name), records = kinds(ledger, 'passive_loss').filter(row => row.activityName === name);
      if (canonical.length > 1) throw new Error('COD passive activity identity is duplicated in the canonical closing sources');
      same(total(...records.map(row => row.beforeReduction)), total(...canonical.map(row => row.amount)), 'passive activity closing');
      if (canonical.some(row => row.qualifiedCarryPresent) && records.some(row => row.attributeReduction.gt(0))) {
        throw new Error('COD passive qualified-loss character reduction requires its actual original QBI allocation method');
      }
    }
    same(total(...kinds(ledger, 'passive_credit').map(row => row.currentUse)), context.passiveCreditUsed, 'passive credit current use');
  }
  const checkForeign = (ledger: CodAttributeReductionLedger, canonical: CodAttributeCanonicalContext['foreignCreditByCategory'] | undefined, alternative: boolean) => {
    const rows = kinds(ledger, 'foreign_tax_credit');
    if (!canonical && rows.some(row => row.beforeReduction.gt(0))) throw new Error('COD requires actual independent alternative foreign-credit closing records');
    const keys = new Set([...rows.map(row => `${row.foreignCategory}:${row.originTaxYear}`),
      ...Object.entries(canonical ?? {}).flatMap(([category, vintages]) => vintages.map(row => `${category}:${row.taxYear}`))]);
    for (const key of keys) {
      const [category, yearString] = key.split(':');
      same(total(...rows.filter(row => row.foreignCategory === category && row.originTaxYear === Number(yearString)).map(row => row.carryforwardBeforeReduction)),
        total(...(canonical?.[category!] ?? []).filter(row => row.taxYear === Number(yearString)).map(row => row.amount)), 'foreign-credit category/vintage closing');
    }
    same(total(...rows.map(row => row.currentUse)), alternative ? context.alternativeForeignCreditUsed : context.foreignCreditUsed,
      `${alternative ? 'alternative ' : ''}foreign-credit current use`);
    if (!alternative) {
      same(total(...rows.map(row => row.carryforwardBeforeReduction)), context.foreignCredit, 'foreign-credit aggregate closing');
    }
  };
  checkForeign(regular, context.foreignCreditByCategory, false);
  checkForeign(alternativeTax, context.alternativeForeignCreditByCategory, true);
  return { sourceFactsVerified: true, regular, alternativeTax };
}
