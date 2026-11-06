import { AdoptionPriorBenefitHistorySchema, type AdoptionPriorBenefitHistory } from '@/models/adoption-prior-benefits';
import type { AdoptionCreditData } from './guided-adoption-facts';
import { guidedSourceValuesChanged } from './guided-source-confirmation';
import { parseGuidedCurrency } from './guided-currency';
type Editable<T> = { [K in keyof T]: T[K] extends boolean | undefined ? boolean | null | undefined
  : T[K] extends number | undefined ? string | undefined : T[K] };
export type AdoptionPriorBenefitRecordData = Editable<NonNullable<AdoptionPriorBenefitHistory['records']>[number]>;
export type AdoptionPriorBenefitHistoryData = Editable<Omit<AdoptionPriorBenefitHistory, 'records'>> & { records?: AdoptionPriorBenefitRecordData[] };
function year(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  if (!/^\d{4}$/.test(value.trim())) throw new Error('Enter the actual four-digit benefit source year.');
  return Number(value);
}
function amount(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  if (parseGuidedCurrency(value).lt(0)) throw new Error('Enter the actual nonnegative historical benefit amount.');
  return value.trim().replaceAll(',', '');
}
/** Conversion preserves original facts; the shared resolver validates them without tax amounts. */
export function buildGuidedAdoptionHistory(data: AdoptionPriorBenefitHistoryData | undefined): AdoptionPriorBenefitHistory | undefined {
  if (!data) return undefined;
  return AdoptionPriorBenefitHistorySchema.parse({ ...data, sourceTaxYear: year(data.sourceTaxYear),
    sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined, allPriorBenefitsIncluded: data.allPriorBenefitsIncluded ?? undefined,
    returnMembershipUnchangedConfirmed: data.returnMembershipUnchangedConfirmed ?? undefined, otherAdopterReceivedBenefits: data.otherAdopterReceivedBenefits ?? undefined,
    priorExclusionHistoryConfirmed: data.priorExclusionHistoryConfirmed ?? undefined, priorExclusionLimitUsed: amount(data.priorExclusionLimitUsed),
    records: data.records?.map(row => ({ ...row, taxYear: year(row.taxYear), originalEmployerBenefits: amount(row.originalEmployerBenefits),
      benefitsAllocatedToChild: amount(row.benefitsAllocatedToChild), allocatedBenefitsIncludedInPriorIncome: row.allocatedBenefitsIncludedInPriorIncome ?? undefined,
      employerPlanQualified: row.employerPlanQualified ?? undefined })),
  });
}
export function invalidateAdoptionHistories(data: AdoptionCreditData): AdoptionCreditData {
  return { ...data, children: data.children.map(child => child.priorYearForeignBenefitHistory?.sourceFactsConfirmed !== undefined ? { ...child,
    priorYearForeignBenefitHistory: { ...child.priorYearForeignBenefitHistory, sourceFactsConfirmed: null } } : child) };
}
export function updateAdoptionSources(previous: AdoptionCreditData, patch: Partial<AdoptionCreditData>): AdoptionCreditData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? invalidateAdoptionHistories(next) : next;
}
