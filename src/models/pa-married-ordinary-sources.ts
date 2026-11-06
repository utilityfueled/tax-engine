/** Private actual two-owner sources. Draft unknowns never default to tax facts. */
import {z} from 'zod';
import {PAMarriedPriorHistorySchema} from './pa-married-prior-history.js';
import {PAMarriedResidencySourcesSchema} from './pa-married-residency-sources.js';
import {PAMarriedPaymentSourcesSchema} from './pa-married-payment-sources.js';
import {PAOrdinaryReturnFactsSchema} from './pa-ordinary-return-facts.js';
import {PAOrdinaryReturnCompletionSourcesSchema} from './pa-ordinary-return-completion.js';
const answer=z.boolean().nullable(),year=z.number().int().nullable();
const owner=z.enum(['','primary','spouse']);
const identity=z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict();
const original=z.record(z.string(),z.unknown());
const category=z.object({status:z.enum(['','known_none','entries']),sourceReference:z.string(),entries:z.array(z.object({sourceReference:z.string(),date:z.string(),amount:z.string(),original:z.object({kind:z.string(),date:z.string(),amount:z.string(),donorName:z.string(),recipientSsn:z.string(),donorInHousehold:answer}).strict(),notElsewhereConfirmed:answer}).strict())}).strict();
const sp=z.object({sourceReference:z.string(),allWorldwideSourcesCompleteConfirmed:answer,categories:z.object({'2':category,'3':category,'4':category,'5':category,'6':category,'7':category,'8':category,'9':category,'10':category}).strict()}).strict();
const person=z.object({accountHolder:owner,originalTaxpayer:identity,sourceReference:z.string(),factsConfirmed:answer,taxYearFrom:z.string(),taxYearThrough:z.string(),aliveEntireYear:answer,marriedAndLivedTogetherEntireYearConfirmed:answer,cohabitationFrom:z.string(),cohabitationThrough:z.string(),claimedAsDependentOnAnotherReturn:answer,individualSupportDhsLiability:answer,individualCourtObligation:answer,
 residency:z.object({sourceReference:z.string(),factsConfirmed:answer,domicileState:z.string(),domicileFrom:z.string(),domicileThrough:z.string(),paAbodeFrom:z.string(),paAbodeThrough:z.string(),actualDaysInPA:z.number().int().nullable(),dec31SchoolDistrictCode:z.string(),dec31SchoolDistrictName:z.string()}).strict(),sp,
 payments:z.object({sourceReference:z.string(),allCurrentPaymentsReviewedConfirmed:answer,estimatedPaymentsStatus:z.enum(['','known_none','actual_receipts']),extensionPaymentsStatus:z.enum(['','known_none','actual_receipts']),priorCreditStatus:z.enum(['','known_none','actual_credit']),originalReceipts:z.array(original),priorReturnStatus:z.enum(['','no_return','not_used','actual_return']),priorReturnSourceReference:z.string()}).strict(),
}).strict();
const wage=z.object({originalIndex:z.number().int().nullable(),sourceTaxYear:year,accountHolder:owner,sourceReference:z.string(),sourceFactsConfirmed:answer,original,originalRecipientSsn:z.string(),currentUncorrectedNonvoidOriginalConfirmed:answer,allOriginalBoxesKnownConfirmed:answer,ordinaryCashCompensationOnlyConfirmed:answer,noPAFederalCompensationDifferencesConfirmed:answer,payroll:z.array(z.object({sourceReference:z.string(),paidOn:z.string(),serviceFrom:z.string(),serviceThrough:z.string(),grossCompensation:z.string(),paServicesCompensation:z.string(),outsidePAServicesCompensation:z.string()}).strict())}).strict();
export const PAMarriedOrdinarySourcesSchema=z.object({sourceTaxYear:year,sourceReference:z.string(),sourceFactsConfirmed:answer,originalFederalSources:original,filingMode:z.enum(['','J','M']),owners:z.array(person),wages:z.array(wage),
 residencySources:PAMarriedResidencySourcesSchema.optional(),
 paymentSources:PAMarriedPaymentSourcesSchema.optional(),
 priorYearHistory:PAMarriedPriorHistorySchema.optional(),
 dependentChildren:PAOrdinaryReturnFactsSchema.shape.filing.shape.dependentChildren.optional(),allDependentSourcesReviewedConfirmed:answer.optional(),
 care:PAOrdinaryReturnCompletionSourcesSchema.shape.care.extend({payerAssignments:z.array(z.object({sourceReference:z.string(),accountHolder:owner}).strict())}).strict().optional(),
 coverage:z.object({sourceReference:z.string(),allOtherIncomeClassesKnownNoneConfirmed:answer,allEmployeeExpensesAndOtherDeductionsKnownNoneConfirmed:answer,allOtherStateTaxesKnownNoneConfirmed:answer,allRestrictedCreditsKnownNoneConfirmed:answer,allCareExpensesAndEmployerBenefitsKnownNoneConfirmed:answer,allNrkStatementsKnownNoneConfirmed:answer,allUseTaxPurchasesKnownNoneConfirmed:answer,allAgencyReliefKnownNoneConfirmed:answer,allDependentSourcesKnownNoneConfirmed:answer,localJurisdictions:z.array(z.object({name:z.string(),sourceReference:z.string(),separateReturnRequired:answer}).strict())}).strict(),
 timing:z.object({sourceReference:z.string(),kind:z.enum(['','filed','expected']),filingDate:z.string(),asOfDate:z.string(),returnKind:z.enum(['','original','amended']),filingExtension:z.enum(['','none','actual_extension']),paymentExtension:z.enum(['','none','actual_extension'])}).strict(),
 dispositions:z.array(z.object({accountHolder:z.enum(['','joint','primary','spouse']),sourceReference:z.string(),refundRequested:z.string(),nextYearCreditRequested:z.string(),donations:z.array(z.object({code:z.string(),amount:z.string()}).strict()),remainingPayment:z.object({status:z.enum(['','no_remaining_tax','expected_payment','actual_payment']),sourceReference:z.string(),date:z.string().optional(),amountAppliedToTax:z.string().optional(),original:original.optional()}).strict()}).strict()),
}).strict();
export type PAMarriedOrdinarySources=z.infer<typeof PAMarriedOrdinarySourcesSchema>;
