import { z } from 'zod';

/** Preserve unknown/false draft facts. Calculation independently requires actual originals. */
export const EicUnassessedPetitionSchema = z.object({
  sourceTaxYear: z.number().int().optional(), owner: z.enum(['primary', 'spouse']).optional(),
  originalTaxpayerSsn: z.string().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  denialSourceId: z.string().optional(), denialSourceReference: z.string().optional(),
  deniedTaxYear: z.number().int().optional(), originalReturnFiledDate: z.string().optional(),
  deficiencyNoticeReference: z.string().optional(), noticeDate: z.string().optional(),
  noticeLastPetitionDate: z.string().optional(), noticeDeadlineConfirmed: z.boolean().optional(),
  docketReference: z.string().optional(), docketNumber: z.string().optional(),
  petitionReference: z.string().optional(), petitionFiledDate: z.string().optional(),
  actualTaxCourtDeficiencyPetitionConfirmed: z.boolean().optional(), actualTimelyPetitionConfirmed: z.boolean().optional(),
  reviewedThroughDate: z.string().optional(), claimDate: z.string().optional(),
  accountTranscriptReference: z.string().optional(), courtEventHistoryReference: z.string().optional(),
  completeCourtAndAccountHistoryConfirmed: z.boolean().optional(),
  assessmentDate: z.string().nullable().optional(), finalDeterminationDate: z.string().nullable().optional(),
  decisionDate: z.string().nullable().optional(), dismissalDate: z.string().nullable().optional(),
  settlementDate: z.string().nullable().optional(), assessmentWaiverDate: z.string().nullable().optional(),
  terminationOrJeopardyAssessmentDate: z.string().nullable().optional(), bankruptcyCaseDate: z.string().nullable().optional(),
  paymentAssessmentDate: z.string().nullable().optional(), otherAssessmentExceptionDate: z.string().nullable().optional(),
}).strict();
export type EicUnassessedPetition = z.infer<typeof EicUnassessedPetitionSchema>;
