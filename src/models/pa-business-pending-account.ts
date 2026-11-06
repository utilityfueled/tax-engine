/** Actual still-outstanding NY taxpayer account evidence. No money or confirmation defaults. */
import {z} from 'zod';
const answer=z.boolean().nullable();
const owner={state:z.string(),sourceTaxYear:z.number().int().nullable(),accountName:z.string(),accountSsn:z.string(),sourceReference:z.string()};
const event=z.object({confirmationNumber:z.string(),date:z.string(),amount:z.string(),sourceReference:z.string()}).strict();
export const PABusinessPendingAccountSourcesSchema=z.object({
 ...owner,sourceFactsConfirmed:answer,
 filedReturn:z.object({...owner,returnId:z.string(),returnType:z.string(),returnKind:z.string(),filedOn:z.string(),filingStatus:z.string(),residency:z.string(),allIncomeClassesAndAdjustmentsReviewedConfirmed:answer,allNonpaymentCreditsReviewedConfirmed:answer,fullYearNonNYResidentConfirmed:answer,noNYBusinessOrOtherSourceIncomeConfirmed:answer,federalAdjustedGrossIncome:z.string(),newYorkSourceIncome:z.string(),taxBeforeCredits:z.string(),nonpaymentCredits:z.string(),finalTaxLiability:z.string(),withholdingReported:z.string(),refundRequested:z.string()}).strict(),
 payments:z.array(z.object({...owner,confirmationNumber:z.string(),date:z.string(),form:z.string(),originalIndex:z.number().int().nullable(),original:z.record(z.string(),z.unknown()).optional(),amount:z.string(),actualPaymentToStateConfirmed:answer,taxpayerBeneficialOwnerConfirmed:answer,taxpayerAccountCreditConfirmed:answer,noPayerRefundReimbursementOrRecourseConfirmed:answer,payerErrorExplanation:z.string(),notTaxableCompensationConfirmed:answer}).strict()),
 refunds:z.array(event),offsets:z.array(event),transfers:z.array(event),writeoffs:z.array(event),
 account:z.object({...owner,completeThroughDate:z.string(),status:z.string(),actualAgencyStatementConfirmed:answer,allPaymentsRefundsOffsetsTransfersAndWriteoffsReviewedConfirmed:answer,noAmendmentsAssessmentsOrOtherAdjustmentsConfirmed:answer,grossTaxPaymentsReported:z.string(),refundsActuallyReceivedReported:z.string(),offsetsReported:z.string(),transfersReported:z.string(),writeoffsOrForfeituresReported:z.string(),netTaxPaymentsReported:z.string(),taxLiabilityReported:z.string(),unpaidTaxReported:z.string(),overpaymentOutstandingReported:z.string()}).strict(),
}).strict();
export type PABusinessPendingAccountSources=z.infer<typeof PABusinessPendingAccountSourcesSchema>;
