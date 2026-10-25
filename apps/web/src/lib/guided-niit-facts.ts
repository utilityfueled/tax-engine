import Decimal from 'decimal.js';
import { Form1099RSchema, Form8960SourcesSchema, type TaxYearInput } from '@/models/inputs.js';
import { resolveForm8960OrdinarySources } from '@/engine/forms/form-8960-ordinary-sources.js';
import type { FilingStatus as EngineFilingStatus } from '@/models/constants.js';
import type { FilingStatus, RetirementEntryData } from './guided-interview-flow';
import { isStartedRetirement } from './guided-retirement-facts';
import { parseGuidedCurrency } from './guided-currency';

type EngineSources = NonNullable<TaxYearInput['form8960Sources']>;
export type NiitAnnuityData = NonNullable<EngineSources['annuities']>[number];
export interface NiitSourceData {
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: boolean | null;
  annuities?: NiitAnnuityData[];
  ordinaryTaxAllocation?: EngineSources['ordinaryTaxAllocation'];
  itemizedAllocation?: { investmentInterest?: string; investmentIncomeTaxes?: string; ordinaryLoss?: string };
}
export const niitTaxCategories = [
  ['incomeOrSalesTaxes', 'Income or elected sales taxes'],
  ['realPropertyTaxes', 'Real property taxes'],
  ['personalPropertyTaxes', 'Personal property taxes'],
] as const;
export function snapshotGuidedNiitAnnuity(entry: RetirementEntryData, sourceIndex: number): NiitAnnuityData {
  return { sourceId: `form1099R:${sourceIndex}`, payerName: entry.payer, payerTin: entry.payerTin, accountReference: entry.accountReference,
    owner: entry.accountHolder || undefined, grossDistribution: entry.grossDistribution, taxableAmount: entry.taxableAmount };
}
function amount(value: string | undefined, label: string) {
  if (value === undefined || !value.trim()) throw new Error(`Enter the actual ${label}; leave unknown facts unresolved.`);
  const result = parseGuidedCurrency(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`The actual ${label} must be a finite nonnegative amount.`);
  return result;
}
const statusMap: Record<FilingStatus, EngineFilingStatus> = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' };

export function buildGuidedNiitSources(data: NiitSourceData | undefined, entries?: RetirementEntryData[], year?: number | null, status?: FilingStatus | null): TaxYearInput['form8960Sources'] {
  if (!data) return undefined;
  if ((year !== 2025 && year !== 2026) || data.sourceTaxYear !== String(year) || !status) throw new Error('Match the actual NIIT worksheet year to this return.');
  if (data.sourceFactsConfirmed !== true || !data.sourceReference?.trim()) throw new Error('Confirm the actual NIIT source worksheet and reference after the last edit.');
  const annuities = data.annuities?.map(source => ({ ...source,
    grossDistribution: amount(source.grossDistribution, 'classified statement gross distribution').toFixed(),
    taxableAmount: amount(source.taxableAmount, 'classified statement taxable amount').toFixed(),
  }));
  const taxes = data.ordinaryTaxAllocation;
  const ordinaryTaxAllocation = taxes ? { ...taxes } : undefined;
  if (ordinaryTaxAllocation && taxes) {
    if (!taxes.allocationMethodDescription?.trim() || taxes.noDuplicateDeductionConfirmed !== true) throw new Error('Document the actual tax allocation method and confirm no expense is deducted twice.');
    for (const [key, label] of niitTaxCategories) {
      const source = amount(taxes[key]?.sourceAmount, `${label} source amount`);
      const regular = amount(taxes[key]?.regularDeductibleAmount, `${label} allowed regular deduction`);
      const investment = amount(taxes[key]?.investmentAllocableAmount, `${label} investment allocation`);
      if (regular.gt(source) || investment.gt(regular)) throw new Error('A NIIT tax allocation cannot exceed its actual source or allowed regular deduction.');
      ordinaryTaxAllocation[key] = { sourceAmount: source.toFixed(), regularDeductibleAmount: regular.toFixed(), investmentAllocableAmount: investment.toFixed() };
    }
  }
  const allocation = data.itemizedAllocation;
  const itemizedAllocation = allocation ? { investmentInterest: amount(allocation.investmentInterest, 'final investment interest allocation').toFixed(),
    investmentIncomeTaxes: amount(allocation.investmentIncomeTaxes, 'final investment tax allocation').toFixed(),
    ordinaryLoss: amount(allocation.ordinaryLoss, 'final ordinary-loss allocation').toFixed() } : undefined;
  const actual = Form8960SourcesSchema.parse({ ...data, sourceTaxYear: year, annuities, ordinaryTaxAllocation, itemizedAllocation });
  const forms = (entries ?? []).filter(isStartedRetirement).map(entry => Form1099RSchema.parse({
    payer: entry.payer, payerTin: entry.payerTin, accountReference: entry.accountReference?.trim(), accountHolder: entry.accountHolder || undefined,
    grossDistribution: amount(entry.grossDistribution, 'retirement statement gross distribution').toFixed(),
    taxableAmount: entry.taxableAmount?.trim() ? amount(entry.taxableAmount, 'retirement statement taxable amount').toFixed() : undefined,
    distributionCode: entry.distributionCode, iraSepSimple: entry.isIraSepSimple ?? undefined,
    taxableAmountNotDetermined: entry.taxableAmountNotDetermined ?? undefined,
    eligibleGovernmental457bPlan: entry.eligibleGovernmental457bPlan ?? undefined,
  }));
  // Use the canonical annuity source checks here. Final tax deductions require
  // the actual Schedule A result and are reconciled again in the federal return.
  const zero = new Decimal(0);
  resolveForm8960OrdinarySources({ taxpayer: { taxYear: year }, form1099R: forms,
    form8960Sources: { ...actual, ordinaryTaxAllocation: undefined, itemizedAllocation: undefined } }, {
    filingStatus: statusMap[status], magi: zero, niitThreshold: zero,
    deductions: { itemized: false, allowedItemizedDeductions: zero, investmentInterest: zero, ordinaryLoss: zero,
      saltDeduction: zero, incomeOrSalesTaxes: zero, realPropertyTaxes: zero, personalPropertyTaxes: zero, salesTaxElected: false },
  });
  return actual;
}
export function guidedNiitFactErrors(data: NiitSourceData | undefined, entries?: RetirementEntryData[], year?: number | null, status?: FilingStatus | null): Record<string, string> {
  try { buildGuidedNiitSources(data, entries, year, status); return {}; }
  catch (error) { return { niitSources: error instanceof Error ? error.message : 'Complete and reconcile the actual NIIT source facts.' }; }
}
