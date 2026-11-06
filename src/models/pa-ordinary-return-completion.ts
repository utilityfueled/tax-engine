import {PA2026EicChildInventorySchema} from './pa-2026-eic-child-inventory.js';
import {PAOrdinaryCareSourcesSchema} from './pa-care-sources.js';
import {PAOIDPendingOHAccountSchema} from './pa-oid-pending-oh-account.js';
import {PARoyaltyTaxRefundSourcesSchema} from './pa-royalty-tax-refund-sources.js';
/** Exact reviewed composer contract; metadata collection does not qualify any credit. */
import {z} from 'zod';
import {PAResidentCreditSourcesSchema} from './pa-resident-credit-sources.js';
import {PADigitalTaxRefundSourcesSchema} from './pa-digital-tax-refund-sources.js';
const answer=z.boolean().nullable(),reference=z.string(),originals=z.array(z.record(z.string(),z.unknown()));
export const PAOrdinaryReturnCompletionSourcesSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:reference,sourceFactsConfirmed:answer,
 eitcChildInventory:PA2026EicChildInventorySchema.optional(),
 originalFederalSources:z.record(z.string(),z.unknown()),owner:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict(),
 otherStateTaxes:z.object({status:z.enum(['unknown','none_paid','actual_payments']),sourceReference:reference,allJurisdictionsAndPaymentsReviewedConfirmed:answer,residentCreditSources:PAResidentCreditSourcesSchema.optional(),refundedDigitalSources:PADigitalTaxRefundSourcesSchema.optional(),refundedRoyaltySources:PARoyaltyTaxRefundSourcesSchema.optional(),pendingOIDOHSources:PAOIDPendingOHAccountSchema.optional(),jurisdictions:z.array(z.object({state:z.string(),sourceReference:reference,sourceTaxYear:z.number().int().nullable(),accountName:z.string(),accountSsn:z.string(),completeThroughDate:z.string(),taxPaid:z.string(),incomeTaxWithheld:z.string()}).strict())}).strict(),
 restrictedCredits:z.object({status:z.enum(['unknown','none_available','actual_awards']),sourceReference:reference,allAwardsTransfersCarryforwardsReviewedConfirmed:answer,originalAwards:originals,originalTransfers:originals,originalCarryforwards:originals}).strict(),
 care:z.object({status:z.enum(['unknown','no_qualifying_expenses','actual_expenses']),sourceReference:reference,allCarePaymentSourcesReviewedConfirmed:answer,allEmployerBenefitsIncludedConfirmed:answer,originalCarePayments:originals,careSources:PAOrdinaryCareSourcesSchema.optional()}).strict(),
 nrk1:z.object({status:z.enum(['unknown','none_received','actual_statements']),sourceReference:reference,allReceivedStatementsReviewedConfirmed:answer,originalStatements:originals}).strict(),
 local:z.object({status:z.enum(['unknown','separate_return_required']),sourceReference:reference,allResidentAndWorkJurisdictionsReviewedConfirmed:answer,jurisdictions:z.array(z.object({name:z.string(),sourceReference:reference,returnRequired:answer}).strict())}).strict(),
 lateFilingRelief:z.object({status:z.enum(['unknown','no_actual_relief_records','actual_relief']),sourceReference:reference,allActualReliefSourcesReviewedConfirmed:answer,originalAgencyRelief:originals}).strict(),
}).strict().superRefine((data,context)=>{if(data.eitcChildInventory!==undefined&&data.sourceTaxYear!==2026)context.addIssue({code:'custom',path:['eitcChildInventory'],message:'The distinct no-child inventory is only supported for the actual2026 completion source year'});});
export type PAOrdinaryReturnCompletionSources=z.infer<typeof PAOrdinaryReturnCompletionSourcesSchema>;

export const PA_COMPLETION_RECORD_KINDS=['restricted_award','restricted_transfer','restricted_carryforward','care_payment','nrk1_statement','agency_relief'] as const;
/** Private document metadata only. Qualified calculation fields require the corresponding source method. */
export const PACompletionOriginalRecordSchema=z.object({
 recordKind:z.enum(PA_COMPLETION_RECORD_KINDS),sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),
 documentName:z.string(),issuerName:z.string(),recipientName:z.string(),recipientTin:z.string(),recordDate:z.string(),
 originalAvailableConfirmed:z.boolean().nullable(),methodStatus:z.literal('requires_source_method'),
}).strict();
export type PACompletionOriginalRecord=z.infer<typeof PACompletionOriginalRecordSchema>;
