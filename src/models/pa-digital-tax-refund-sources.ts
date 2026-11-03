/** Complete private original VA digital tax full-refund proof; no inferred facts. */
import { z } from 'zod';
const answer = z.boolean().nullable();
const original = z.record(z.string(), z.unknown());
const identity = {
  sourceTaxYear: z.number().int().nullable(), accountName: z.string(), accountSsn: z.string(),
  state: z.string(), sourceReference: z.string(),
};
export const PADigitalTaxRefundSourcesSchema = z.object({
  sourceTaxYear: z.number().int().nullable(), sourceReference: z.string(), sourceFactsConfirmed: answer,
  completeThroughDate: z.string(), owner: z.object({ firstName: z.string(), lastName: z.string(), ssn: z.string() }).strict(),
  originalFederalSources: original.optional(), originalPAResidencySources: original.optional(), originalPAFacts: original.optional(),
  allVAIncomeTaxOriginalsReviewedConfirmed: answer, noOtherVAIncomeCreditsPaymentsOrAssessmentsConfirmed: answer,
  statements: z.array(z.object({ originalIndex: z.number().int().nullable(), sourceReference: z.string(), sourceFactsConfirmed: answer,
    originalStatement: original.optional(), withholdingOriginal: z.object({ ...identity, date: z.string(), amount: z.string(), confirmationNumber: z.string() }).strict(),
  }).strict()),
  filedReturn: z.object({ ...identity, returnId: z.string(), returnKind: z.string(), filingStatus: z.string(), residency: z.string(), filedOn: z.string(),
    allIncomeAndAdjustmentsReviewedConfirmed: answer, finalTax: z.string(), reportedWithholding: z.string(), totalPayments: z.string(),
    overpayment: z.string(), refundRequested: z.string(), noOtherPaymentsCreditsOffsetsOrTransfersConfirmed: answer,
  }).strict(),
  specialWrittenApplication: z.object({ ...identity, applicationId: z.string(), submittedOn: z.string(), amountRequested: z.string(), actuallySubmittedConfirmed: answer }).strict().nullable(),
  agencyAward: z.object({ ...identity, awardId: z.string(), issuedOn: z.string(), applicationId: z.string(), finalTaxDetermined: z.string(), refundAwarded: z.string(), actualAgencyDeterminationConfirmed: answer }).strict(),
  refund: z.object({ ...identity, postedOn: z.string(), receivedOn: z.string(), amount: z.string(), confirmationNumber: z.string(), actuallyReceivedConfirmed: answer }).strict(),
  account: z.object({ ...identity, completeThroughDate: z.string(), allPaymentsRefundsTransfersOffsetsAndAdjustmentsReviewedConfirmed: answer,
    noAmendmentAssessmentOrPendingAdjustmentConfirmed: answer, netTaxPaymentsReported: z.string(), unpaidTaxReported: z.string(), overpaymentOutstandingReported: z.string(),
  }).strict(),
}).strict();
export type PADigitalTaxRefundSources = z.infer<typeof PADigitalTaxRefundSourcesSchema>;
