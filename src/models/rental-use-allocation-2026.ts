import { z } from "zod";

const reference = z.string().trim().min(1);
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/u);
const actualDate = z.iso.date();

export const rentalAllocationCategories = ["advertising", "commissions", "managementFees", "insurance", "utilities", "taxes"] as const;
export type RentalAllocationCategory = typeof rentalAllocationCategories[number];

export function usesRentalDwellingAsHome(rentalDays: number, personalDays: number): boolean {
  return personalDays > 14 && 10 * personalDays > rentalDays;
}

const receipt = {
  sourceReference: reference,
  propertyAddress: reference,
  datePaid: actualDate,
  amount: money,
};

export const RentalUseAllocation2026Schema = z.strictObject({
  taxYear: z.literal(2026),
  propertyAddress: reference,
  occupancySourceReference: reference,
  rentSourceReference: reference,
  expenseSourceReference: reference,
  confirmedCompleteOrdinaryUse: z.literal(true),
  confirmedOrdinaryTenantRelationship: z.boolean(),
  periods: z.array(z.strictObject({
    sourceReference: reference,
    use: z.enum(["fair_rental", "personal"]),
    start: actualDate,
    end: actualDate,
  })).min(2),
  rentReceipts: z.array(z.strictObject({ ...receipt, leaseReference: reference })).min(1),
  expenseReceipts: z.array(z.strictObject({
    ...receipt,
    category: z.enum(rentalAllocationCategories),
    use: z.enum(["rental_only", "shared", "personal"]),
  })),
  depreciation: z.strictObject({
    propertyAddress: reference,
    sourceReference: reference,
    confirmedCompleteWithoutCurrentAssets: z.literal(true),
    assets: z.array(z.strictObject({
      sourceReference: reference,
      kind: z.enum(["building", "other"]),
      placedInServiceDate: actualDate,
      basisFullyRecoveredDate: actualDate,
      depreciableBasis: money,
      priorAllowableDepreciation: money,
    })).min(1),
  }),
  residenceWorksheet: z.strictObject({
    priorYear: z.literal(2025),
    propertyAddress: reference,
    sourceReference: reference,
    confirmedCompletePriorYear: z.boolean(),
    priorOperatingCarryover: money,
    priorDepreciationAndCasualtyCarryover: money,
    currentCasualtyAndTheftLoss: money,
  }).optional(),
});

export type RentalUseAllocation2026Sources = z.infer<typeof RentalUseAllocation2026Schema>;
