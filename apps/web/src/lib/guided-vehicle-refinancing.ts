import { VehicleRefinancingSourcesSchema, type VehicleRefinancingSources } from '@/models/vehicle-refinancing-sources';
import { amountError } from './guided-required-facts';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

type OriginalLoan = NonNullable<VehicleRefinancingSources['originalLoan']>;
type RefinanceLoan = NonNullable<VehicleRefinancingSources['refinancings']>[number];
type LoanFlags = { firstLien?: boolean | null; relatedParty?: boolean | null };
export type OriginalVehicleLoanData = Omit<OriginalLoan, keyof LoanFlags> & LoanFlags;
export type VehicleRefinanceLoanData = Omit<RefinanceLoan, keyof LoanFlags> & LoanFlags;
export type VehicleRefinancingData = Omit<VehicleRefinancingSources, 'sourceTaxYear' | 'sourceFactsConfirmed' | 'allLoansIncluded' | 'ordinaryPrincipalMethodConfirmed' | 'sameOriginalBorrowerConfirmed' | 'originalLoan' | 'refinancings'> & {
  sourceTaxYear?: string;
  sourceFactsConfirmed?: boolean | null;
  allLoansIncluded?: boolean | null;
  ordinaryPrincipalMethodConfirmed?: boolean | null;
  sameOriginalBorrowerConfirmed?: boolean | null;
  originalLoan?: OriginalVehicleLoanData;
  refinancings?: VehicleRefinanceLoanData[];
};
function amount(value: string | undefined, label: string): string {
  const error = amountError(value, label); if (error) throw new Error(error);
  return parseGuidedCurrency(value).toFixed();
}
function loanAmounts(row: OriginalVehicleLoanData | VehicleRefinanceLoanData) {
  return { ...row, firstLien: row.firstLien ?? undefined, relatedParty: row.relatedParty ?? undefined,
    principal: amount(row.principal, 'actual vehicle loan principal'),
    interestPaid: amount(row.interestPaid, 'actual current-year interest on this loan'),
    interestDeductedElsewhere: amount(row.interestDeductedElsewhere, 'qualifying interest deducted elsewhere'),
    otherExcludedInterest: amount(row.otherExcludedInterest, 'other excluded qualifying interest') };
}
/** Convert original records only. The pure engine allocator validates their complete chain. */
export function buildVehicleRefinancingSources(data: VehicleRefinancingData | undefined): VehicleRefinancingSources {
  if (!data) throw new Error('Complete the actual original and refinanced vehicle loan records.');
  if (!/^\d{4}$/.test(data.sourceTaxYear ?? '')) throw new Error('Enter the actual vehicle refinancing tax year.');
  return VehicleRefinancingSourcesSchema.parse({ ...data, sourceTaxYear: Number(data.sourceTaxYear),
    sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined, allLoansIncluded: data.allLoansIncluded ?? undefined,
    ordinaryPrincipalMethodConfirmed: data.ordinaryPrincipalMethodConfirmed ?? undefined,
    sameOriginalBorrowerConfirmed: data.sameOriginalBorrowerConfirmed ?? undefined,
    originalLoan: data.originalLoan ? { ...loanAmounts(data.originalLoan),
      qualifiedPurchaseCosts: amount(data.originalLoan.qualifiedPurchaseCosts, 'original qualified purchase costs'),
      otherPurchaseCosts: amount(data.originalLoan.otherPurchaseCosts, 'other original purchase costs'),
      downPayment: amount(data.originalLoan.downPayment, 'actual original down payment') } : undefined,
    refinancings: data.refinancings?.map(row => ({ ...loanAmounts(row), previousOutstandingPrincipal: amount(row.previousOutstandingPrincipal, 'actual outstanding principal just before refinancing') })),
  });
}
export function updateVehicleRefinancing(previous: VehicleRefinancingData, patch: Partial<VehicleRefinancingData>): VehicleRefinancingData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? { ...next, sourceFactsConfirmed: null } : next;
}
