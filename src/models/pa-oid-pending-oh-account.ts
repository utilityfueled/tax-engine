/** Actual private Ohio OID remittance originals; unknown answers never default to facts. */
import {z} from 'zod';
const answer=z.boolean().nullable();
const owner=z.object({state:z.string(),sourceTaxYear:z.number().int().nullable(),accountName:z.string(),accountSsn:z.string(),sourceReference:z.string()});
const event=z.object({confirmationNumber:z.string(),date:z.string(),amount:z.string(),sourceReference:z.string()}).strict();
export const PAOIDPendingOHAccountSchema=owner.extend({sourceFactsConfirmed:answer,
 filedReturn:owner.extend({returnId:z.string(),returnType:z.string(),returnKind:z.string(),filingStatus:z.string(),residency:z.string(),filedOn:z.string(),allIncomeClassesAndAdjustmentsReviewedConfirmed:answer,allNonpaymentCreditsAndUseTaxReviewedConfirmed:answer,fullYearNonOHResidentConfirmed:answer,noOHBusinessOrOtherSourceIncomeConfirmed:answer,personalNonbusinessIntangiblesOnlyConfirmed:answer,originalFederalSources:z.record(z.string(),z.unknown()),exactFederalAdjustedGrossIncome:z.string(),reportedFederalAdjustedGrossIncome:z.string(),ohioSourceIncome:z.string(),finalTaxLiability:z.string(),withholdingReported:z.string(),refundRequested:z.string()}).strict(),
 payments:z.array(owner.extend({confirmationNumber:z.string(),date:z.string(),form:z.string(),originalIndex:z.number().int().nullable(),stateRowIndex:z.number().int().nullable(),original:z.record(z.string(),z.unknown()),amount:z.string(),actualPaymentToStateConfirmed:answer,taxpayerBeneficialOwnerConfirmed:answer,taxpayerAccountCreditConfirmed:answer,noPayerRefundReimbursementOrRecourseConfirmed:answer}).strict()),
 refunds:z.array(event),offsets:z.array(event),transfers:z.array(event),writeoffs:z.array(event),
 account:owner.extend({completeThroughDate:z.string(),status:z.string(),actualAgencyStatementConfirmed:answer,allPaymentsRefundsOffsetsTransfersAndWriteoffsReviewedConfirmed:answer,noAmendmentsAssessmentsOrOtherAdjustmentsConfirmed:answer,grossTaxPaymentsReported:z.string(),refundsActuallyReceivedReported:z.string(),offsetsReported:z.string(),transfersReported:z.string(),writeoffsOrForfeituresReported:z.string(),netTaxPaymentsReported:z.string(),taxLiabilityReported:z.string(),unpaidTaxReported:z.string(),overpaymentOutstandingReported:z.string()}).strict(),
}).strict();
export type PAOIDPendingOHAccount=z.infer<typeof PAOIDPendingOHAccountSchema>;
