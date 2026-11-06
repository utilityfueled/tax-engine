/** Actual settled NY originals; no amount, year, identity or receipt defaults. */
import {z} from 'zod';
const answer=z.boolean().nullable();
const owner=z.object({state:z.string(),sourceTaxYear:z.number().int().nullable(),accountName:z.string(),accountSsn:z.string(),sourceReference:z.string()});
export const PAInvestmentWithholdingAccountSchema=owner.extend({
 sourceFactsConfirmed:answer,
 filedReturn:owner.extend({returnId:z.string(),returnType:z.string(),returnKind:z.string(),filingStatus:z.string(),residency:z.string(),filedOn:z.string(),allIncomeClassesAndAdjustmentsReviewedConfirmed:answer,allNonpaymentCreditsReviewedConfirmed:answer,personalNonbusinessIntangiblesOnlyConfirmed:answer,noOtherNYSourceIncomeConfirmed:answer,federalIncome:z.string(),newYorkSourceIncome:z.string(),taxBeforeCredits:z.string(),nonpaymentCredits:z.string(),finalTaxLiability:z.string(),withholdingReported:z.string(),refundRequested:z.string()}).strict(),
 payments:z.array(owner.extend({confirmationNumber:z.string(),date:z.string(),form:z.string(),originalIndex:z.number().int().nullable(),original:z.record(z.string(),z.unknown()).optional(),amount:z.string(),actualPaymentToStateConfirmed:answer}).strict()),
 erroneousPaymentClaim:owner.extend({claimId:z.string(),submittedOn:z.string(),kind:z.string(),returnId:z.string(),amountClaimed:z.string(),paymentConfirmationNumbers:z.array(z.string()),actualWrittenClaimSubmittedConfirmed:answer,notClaimedAsReturnWithholdingConfirmed:answer}).strict(),
 agencyDetermination:owner.extend({determinationId:z.string(),claimId:z.string(),returnId:z.string(),issuedOn:z.string(),disposition:z.string(),actualAgencyDeterminationConfirmed:answer,commissionerCertificateReference:z.string(),actualCommissionerCertificationConfirmed:answer,comptrollerApprovalReference:z.string(),actualComptrollerApprovalConfirmed:answer,principalPaymentAllowed:z.string(),principalOverpaymentAllowed:z.string(),refundPrincipalAuthorized:z.string(),taxLiabilityDetermined:z.string()}).strict(),
 refunds:z.array(owner.extend({confirmationNumber:z.string(),date:z.string(),amount:z.string(),kind:z.string(),actualReceiptConfirmed:answer,claimId:z.string(),determinationId:z.string(),principalAmount:z.string(),interestAmount:z.string(),actualPrincipalInterestAllocationConfirmed:answer}).strict()),
 account:owner.extend({completeThroughDate:z.string(),allPaymentsRefundsTransfersOffsetsReviewedConfirmed:answer,noAmendmentsAssessmentsOrOtherAdjustmentsConfirmed:answer,noTransfersOrOffsetsConfirmed:answer,netTaxPaymentsReported:z.string(),unpaidTaxReported:z.string(),overpaymentOutstandingReported:z.string()}).strict(),
}).strict();
export type PAInvestmentWithholdingAccount=z.infer<typeof PAInvestmentWithholdingAccountSchema>;
