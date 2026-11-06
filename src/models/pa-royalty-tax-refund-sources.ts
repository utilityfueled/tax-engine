/** Private complete MI copyright full-refund records; missing facts never default. */
import {z} from 'zod';
const answer=z.boolean().nullable(),original=z.record(z.string(),z.unknown());
const identity={sourceTaxYear:z.number().int().nullable(),accountName:z.string(),accountSsn:z.string(),state:z.string(),sourceReference:z.string()};
export const PARoyaltyTaxRefundSourcesSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,completeThroughDate:z.string(),
 owner:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict(),originalFederalSources:original,originalPAResidencySources:original,originalPAFacts:original,
 allMIIncomeTaxOriginalsReviewedConfirmed:answer,noOtherMIIncomeCreditsPaymentsOrAssessmentsConfirmed:answer,
 statements:z.array(z.object({originalIndex:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,originalStatement:original,
  copyrightUse:z.object({sourceReference:z.string(),propertyId:z.string(),publisherName:z.string(),publicationOriginState:z.string(),publicationFrom:z.string(),publicationThrough:z.string(),allPublicationUsesReviewedConfirmed:answer,actualPublicationOriginConfirmed:answer,nonbusinessCopyrightConfirmed:answer,ownerCommercialDomicileState:z.string(),michiganSourceGross:z.string(),outsideMichiganGross:z.string()}).strict(),
  withholdingOriginal:z.object({...identity,date:z.string(),amount:z.string(),confirmationNumber:z.string(),actuallyRemittedConfirmed:answer}).strict(),
 }).strict()),
 filedReturn:z.object({...identity,returnId:z.string(),returnKind:z.string(),filingStatus:z.string(),residency:z.string(),filedOn:z.string(),completeReturnScheduleWAndNRConfirmed:answer,allIncomeAndAdjustmentsReviewedConfirmed:answer,finalTax:z.string(),reportedWithholding:z.string(),totalPayments:z.string(),overpayment:z.string(),refundRequested:z.string(),michiganSourceIncome:z.string(),noOtherPaymentsCreditsOffsetsOrTransfersConfirmed:answer}).strict(),
 writtenClaim:z.object({...identity,applicationId:z.string(),submittedOn:z.string(),amountRequested:z.string(),fullOriginalPaymentDemandConfirmed:answer,actuallySubmittedConfirmed:answer}).strict(),
 agencyAward:z.object({...identity,awardId:z.string(),issuedOn:z.string(),applicationId:z.string(),originalReportedStateIncome:z.string(),determinedMichiganSourceIncome:z.string(),determinationReason:z.string(),finalTaxDetermined:z.string(),refundAwarded:z.string(),printedReturnToExactAwardReconciledConfirmed:answer,actualAgencyDeterminationConfirmed:answer}).strict(),
 refund:z.object({...identity,postedOn:z.string(),receivedOn:z.string(),amount:z.string(),confirmationNumber:z.string(),actuallyReceivedConfirmed:answer}).strict(),
 account:z.object({...identity,completeThroughDate:z.string(),allPaymentsRefundsTransfersOffsetsAndAdjustmentsReviewedConfirmed:answer,noAmendmentAssessmentOrPendingAdjustmentConfirmed:answer,netTaxPaymentsReported:z.string(),unpaidTaxReported:z.string(),overpaymentOutstandingReported:z.string()}).strict(),
}).strict();
export type PARoyaltyTaxRefundSources=z.infer<typeof PARoyaltyTaxRefundSourcesSchema>;
