/** Actual direct royalty properties: Schedule E Part I; spec/federal/royalty-property-sources.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';

export interface RoyaltyPropertyResult {
  sourceIndex: number;
  accountHolder: 'primary' | 'spouse';
  grossIncome: Decimal;
  commissions: Decimal;
  insurance: Decimal;
  legalProfessional: Decimal;
  managementFees: Decimal;
  taxes: Decimal;
  totalExpenses: Decimal;
  netIncome: Decimal;
}
export interface RoyaltyPropertySourcesResult {
  properties: RoyaltyPropertyResult[];
  grossIncome: Decimal;
  totalExpenses: Decimal;
  netIncome: Decimal;
  lines: CalculatedLine[];
}
export type RoyaltyPropertyReturnInput = Pick<TaxYearInput, 'form1099Misc' | 'royaltyPropertySources'> & {
  taxpayer?: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> & {
    spouse?: Pick<NonNullable<TaxYearInput['taxpayer']['spouse']>, 'firstName' | 'lastName' | 'ssn'>;
  };
};

function requireText(value: string | undefined, label: string): string {
  if (value === undefined || !value.trim()) throw new Error(`Royalty property requires actual ${label}`);
  return value;
}
function requireAmount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+(\.\d{1,2})?$/.test(value)) throw new Error(`Royalty property requires actual ${label}, including explicit zero`);
  const result = d(value);
  if (!result.isFinite() || result.isNegative()) throw new Error(`Royalty property ${label} must be finite and nonnegative`);
  return result;
}
function requireFact(value: boolean | undefined, expected: boolean, label: string): void {
  if (value !== expected) throw new Error(`Royalty property ${label} is unknown or needs its separate source method`);
}
function requirePaidDate(value: string | undefined, year: number): void {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Royalty expense requires an actual paid date');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || parsed.getUTCFullYear() !== year) {
    throw new Error('Royalty expense requires a valid paid date in the source tax year');
  }
}

/** No side effects, entered net amount, default expense or inferred property classification. */
export function calculateRoyaltyPropertySources(input: RoyaltyPropertyReturnInput): RoyaltyPropertySourcesResult {
  const audit = new AuditTrail();
  const sources = input.royaltyPropertySources;
  if (!sources) {
    // Preserve the pre-existing raw-input contract. This is not a confirmed
    // property ledger, and cannot supply expense or physical property details.
    const grossIncome = sum(...input.form1099Misc.map(form => d(form.royalties)));
    return { properties: [], grossIncome, totalExpenses: d(0), netIncome: grossIncome, lines: [] };
  }
  const taxpayer = input.taxpayer;
  if (!taxpayer) throw new Error('Royalty property ledger requires the actual return year and owner facts');
  const year = taxpayer.taxYear;
  if (![2025, 2026].includes(year) || sources.sourceTaxYear !== year) throw new Error('Royalty property source tax year must match the supported return year');
  requireText(sources.sourceReference, 'property ledger reference');
  requireFact(sources.sourceFactsConfirmed, true, 'source confirmation');
  requireFact(sources.allDirectRoyaltySourcesIncluded, true, 'complete direct source ledger');
  if (!sources.properties?.length) throw new Error('Royalty property ledger requires actual properties');
  const propertyIds = new Set<string>(), receiptIds = new Set<string>(), originalIds = new Map<string, number>();
  const originalAccounts = new Map<string, number>();
  const allocatedByOriginal = new Map<number, Decimal>();
  const properties: RoyaltyPropertyResult[] = [];
  for (const [sourceIndex, property] of sources.properties.entries()) {
    const propertyId = requireText(property.propertyId, 'property identifier');
    if (propertyIds.has(propertyId)) throw new Error('Royalty property identifiers must be unique');
    propertyIds.add(propertyId);
    requireText(property.propertyReference, 'property reference');
    if (!property.propertyType) throw new Error('Royalty property requires an actual property type');
    const accountHolder = property.accountHolder;
    if (!accountHolder || (accountHolder === 'spouse' && (!taxpayer.spouse || taxpayer.filingStatus !== 'married_filing_jointly'))) {
      throw new Error('Royalty property requires an actual owner included on this return');
    }
    for (const key of ['tradeOrBusiness', 'operatingInterest', 'capitalDisposition', 'foreignSource', 'communityPropertyAllocationRequired'] as const) {
      requireFact(property[key], false, key);
    }
    for (const key of ['cashMethod', 'sameRegularAmtTreatmentConfirmed', 'currentYearExpensesComplete'] as const) requireFact(property[key], true, key);
    for (const key of ['interestExpense', 'depreciationExpense', 'depletionExpense', 'otherExpenses', 'priorUnallowedExpenses'] as const) {
      if (!requireAmount(property[key], key).isZero()) throw new Error(`Royalty property ${key} requires its separate source method`);
    }
    if (!property.incomeSources?.length) throw new Error('Royalty property requires original income sources');
    const propertyOriginalIndexes = new Set<number>();
    let grossIncome = d(0);
    for (const entry of property.incomeSources) {
      const index = entry.sourceIndex;
      if (index === undefined || !Number.isInteger(index) || index < 0 || propertyOriginalIndexes.has(index)) {
        throw new Error('Royalty property requires unique actual original indexes');
      }
      propertyOriginalIndexes.add(index);
      const original = input.form1099Misc[index], confirmed = entry.original;
      if (!original || !confirmed) throw new Error('Royalty property requires the actual original MISC statement');
      for (const key of ['sourceId', 'accountReference', 'payer'] as const) {
        if (requireText(confirmed[key], `original ${key}`) !== original[key]) throw new Error('Royalty property original identity changed');
      }
      const originalId = requireText(confirmed.sourceId, 'original source identifier');
      const previousIndex = originalIds.get(originalId);
      if (previousIndex !== undefined && previousIndex !== index) throw new Error('Royalty original source identifiers must be unique');
      originalIds.set(originalId, index);
      const originalAccount = JSON.stringify([confirmed.taxYear, confirmed.accountHolder, confirmed.payer, confirmed.accountReference]);
      const previousAccount = originalAccounts.get(originalAccount);
      if (previousAccount !== undefined && previousAccount !== index) throw new Error('Royalty original account appears more than once; reconcile original and corrected statements');
      originalAccounts.set(originalAccount, index);
      if (confirmed.taxYear !== year || original.taxYear !== year
        || confirmed.sourceFormRevision !== (year === 2025 ? '2025-04' : '2026-12')
        || original.sourceFormRevision !== confirmed.sourceFormRevision
        || confirmed.accountHolder !== accountHolder || original.accountHolder !== accountHolder
        || !requireAmount(confirmed.royalties, 'original Box2 royalties').eq(requireAmount(original.royalties, 'original Box2 royalties'))) {
        throw new Error('Royalty property original year revision owner or Box2 amount changed');
      }
      const amount = requireAmount(entry.allocatedGross, 'original gross allocation');
      grossIncome = grossIncome.plus(amount);
      allocatedByOriginal.set(index, (allocatedByOriginal.get(index) ?? d(0)).plus(amount));
    }
    if (property.expenses === undefined) throw new Error('Royalty property requires its actual expense ledger, including a confirmed empty ledger');
    const amounts = { commissions:d(0), insurance:d(0), legalProfessional:d(0), managementFees:d(0), taxes:d(0) };
    const categories = { commissions:'commissions', insurance:'insurance', 'legal-professional':'legalProfessional', 'management-fees':'managementFees', 'property-production-taxes':'taxes' } as const;
    for (const receipt of property.expenses) {
      const receiptId = requireText(receipt.sourceId, 'expense source identifier');
      if (receiptIds.has(receiptId)) throw new Error('Royalty expense source identifiers must be unique across properties');
      receiptIds.add(receiptId);
      requireText(receipt.sourceReference, 'expense reference');
      requirePaidDate(receipt.paidDate, year);
      requireFact(receipt.ordinaryNecessaryForProperty, true, 'ordinary necessary expense');
      requireFact(receipt.relatesOnlyToCurrentYear, true, 'current-year expense period');
      for (const key of ['capitalOrImprovement', 'personalOrOwnLabor', 'reimbursed'] as const) requireFact(receipt[key], false, key);
      if (!receipt.category || !(receipt.category in categories)) throw new Error('Royalty expense requires a supported actual category');
      const key = categories[receipt.category];
      amounts[key] = amounts[key].plus(requireAmount(receipt.amountPaid, 'expense paid amount'));
    }
    const totalExpenses = sum(...Object.values(amounts)), netIncome = grossIncome.minus(totalExpenses);
    if (netIncome.isNegative()) throw new Error('Royalty property loss requires its actual at-risk and loss history method');
    const result = {sourceIndex, accountHolder, grossIncome, ...amounts, totalExpenses, netIncome};
    properties.push(result);
    const label = `Direct royalty property ${sourceIndex + 1}`;
    audit.record('Royalty Property', `${sourceIndex}:4`, `${label} gross royalties`, grossIncome, 'Actual original MISC Box2 allocations, before expenses');
    audit.record('Royalty Property', `${sourceIndex}:20`, `${label} expenses`, totalExpenses, 'Confirmed cash-paid current-year property expenses', amounts);
    audit.record('Royalty Property', `${sourceIndex}:21`, `${label} net income`, netIncome, 'Gross royalties less confirmed property expenses');
  }
  for (const [index, original] of input.form1099Misc.entries()) {
    if (d(original.royalties).isNegative()) throw new Error('Royalty original corrections with negative gross require their separate reconciliation method');
    if (d(original.royalties).gt(0) || allocatedByOriginal.has(index)) {
      const allocated = allocatedByOriginal.get(index);
      if (!allocated || !allocated.eq(requireAmount(original.royalties, 'original Box2 royalties'))) {
        throw new Error('Royalty property allocations must conserve every original gross royalty amount');
      }
    }
  }
  const grossIncome = sum(...properties.map(property => property.grossIncome));
  const totalExpenses = sum(...properties.map(property => property.totalExpenses));
  return {properties, grossIncome, totalExpenses, netIncome:grossIncome.minus(totalExpenses), lines:audit.getLines()};
}
