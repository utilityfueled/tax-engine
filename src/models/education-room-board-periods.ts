import { z } from 'zod';
const text = z.string().optional();
const amount = z.string().regex(/^-?\d+(\.\d+)?$/).optional();
const fact = z.boolean().optional();
/** Original institutional period sources; absent answers never imply zero or eligibility. */
export const EducationRoomBoardPeriodSchema = z.object({
  id: z.string().trim().min(1), beneficiaryId: text,
  sourceTaxYear: z.number().int().optional(), sourceReference: text, sourceFactsConfirmed: fact,
  institutionId: text, institutionName: text, institutionEligible: fact,
  academicPeriodStart: text, academicPeriodEnd: text,
  livingArrangement: z.enum(['with_parent', 'off_campus', 'institution_housing']).optional(),
  halfTimeStudent: fact, roomBoardAllowance: amount, allowanceApplicableConfirmed: fact,
  schoolOwnedHousing: fact, schoolOwnedHousingCharge: amount, schoolHousingInvoiceReference: text,
  allReceiptsIncludedConfirmed: fact,
  esaAllocationConfirmed: fact, esaAllocationSourceReference: text,
});
export const EducationRoomBoardPeriodExpenseSchema = z.object({
  periodId: text, expenseId: text, coveredStart: text, coveredEnd: text,
  sourceReference: text, sourceFactsConfirmed: fact,
});
/** Actual ESA coordination choice, bounded by the separately derived period AQEE. */
export const EducationRoomBoardEsaAllocationSchema = z.object({ periodId: text, sourceId: text, amount });
export type EducationRoomBoardPeriod = z.infer<typeof EducationRoomBoardPeriodSchema>;
