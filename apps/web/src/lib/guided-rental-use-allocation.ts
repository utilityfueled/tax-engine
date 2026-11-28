import type { RentalUseAllocation2026Sources } from "@/models/rental-use-allocation-2026.js";

type Sources = RentalUseAllocation2026Sources;
export type RentalUsePeriodDraft = Partial<Sources["periods"][number]>;
export type RentalRentReceiptDraft = Partial<Sources["rentReceipts"][number]>;
export type RentalExpenseReceiptDraft = Partial<Sources["expenseReceipts"][number]>;
export type RentalAssetDraft = Partial<Sources["depreciation"]["assets"][number]>;
type DraftDepreciation = Partial<Pick<Sources["depreciation"], "propertyAddress" | "sourceReference">> & {
  confirmedCompleteWithoutCurrentAssets?: boolean | null;
  assets?: RentalAssetDraft[];
};
export type RentalUseAllocationDraft = Partial<Pick<Sources, "taxYear" | "propertyAddress" | "occupancySourceReference" | "rentSourceReference" | "expenseSourceReference">> & {
  confirmedCompleteOrdinaryUse?: boolean | null;
  confirmedOrdinaryTenantRelationship?: boolean | null;
  periods?: RentalUsePeriodDraft[];
  rentReceipts?: RentalRentReceiptDraft[];
  expenseReceipts?: RentalExpenseReceiptDraft[];
  depreciation?: DraftDepreciation;
};

export function rentalDecimalText(value?: string): string | undefined {
  const text = value?.trim();
  return text && /^\d{1,3}(,\d{3})+(\.\d+)?$/u.test(text) ? text.replace(/,/gu, "") : text;
}

export function buildGuidedRentalUseAllocation(draft: RentalUseAllocationDraft | undefined) {
  if (!draft) return undefined;
  return {
    ...draft,
    rentReceipts: draft.rentReceipts?.map(row => ({ ...row, amount: rentalDecimalText(row.amount) })),
    expenseReceipts: draft.expenseReceipts?.map(row => ({ ...row, amount: rentalDecimalText(row.amount) })),
    depreciation: draft.depreciation && {
      ...draft.depreciation,
      assets: draft.depreciation.assets?.map(row => ({ ...row, depreciableBasis: rentalDecimalText(row.depreciableBasis),
        priorAllowableDepreciation: rentalDecimalText(row.priorAllowableDepreciation) })),
    },
  };
}
