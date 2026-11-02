/** Private original PA return sources. Empty values are drafts, never tax facts. */
import {z} from 'zod';
export const PA_SP_OTHER_LINES=['2','3','4','5','7','8','9','10'] as const;
export const PA_SP_INCOME_KINDS={
 '2':'Nontaxable interest, dividends, gains and annualized income',
 '3':'Alimony received','4':'Insurance proceeds and inheritances','5':'Gifts, awards and prizes',
 '7':'Nontaxable military income','8':'Excluded residence-sale gain',
 '9':'Nontaxable educational assistance','10':'Other includable outside-household cash and benefits',
} as const;
const answer=z.boolean().nullable();const year=z.number().int().nullable();
const identity=z.object({accountName:z.string(),accountSsn:z.string()}).strict();
const paymentOriginal=identity.extend({taxYear:year,returnType:z.string(),kind:z.string(),date:z.string(),amount:z.string(),confirmationNumber:z.string()}).strict();
const completedSP=z.object({sourceReference:z.string(),factsConfirmed:answer,original:identity.extend({taxYear:year,filingCategory:z.enum(['','unmarried','married']),dependents:z.number().int().nullable(),paTaxableIncome:z.string(),nontaxableIncome:z.string(),taxLiability:z.string(),residentCredit:z.string(),reportedForgivenessPercentage:z.string(),reportedCredit:z.string(),allWorldwideSourcesCompleteConfirmed:answer,claimedDependentSsns:z.array(z.string())}).strict()}).strict();
const category=z.object({status:z.enum(['','known_none','entries']),sourceReference:z.string(),entries:z.array(z.object({sourceReference:z.string(),date:z.string(),amount:z.string(),notElsewhereConfirmed:answer}).strict())}).strict();
export const PAOrdinaryReturnFactsSchema=z.object({
 sourceTaxYear:year,sourceReference:z.string(),sourceFactsConfirmed:answer,originalFederalSources:z.record(z.string(),z.unknown()).optional(),
 owner:z.object({accountHolder:z.enum(['','primary','spouse']),originalTaxpayer:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict().optional()}).strict(),
 filing:z.object({choice:z.enum(['','S','J','M','F']),maritalStatus:z.enum(['','unmarried','married','separated']),aliveEntireYear:answer,finalReturnReason:z.string(),noPATaxableIncomeNextYearConfirmed:answer,claimedAsDependentOnAnotherReturn:answer,
  dependentChildren:z.array(z.object({sourceReference:z.string(),factsConfirmed:answer,originalIndex:z.number().int().nullable(),originalFederalDependent:z.record(z.string(),z.unknown()).optional(),relationship:z.enum(['','natural_child','adopted_child','stepchild','grandchild','foster_child']),federalReturnClaimConfirmed:answer,noOtherClaimByAgreementOrDecreeConfirmed:answer}).strict()),
  claimingHouseholdSP:completedSP.optional(),sourceReference:z.string(),factsConfirmed:answer,
 }).strict(),
 payments:z.object({allPaymentsIncludedConfirmed:answer,rows:z.array(z.object({sourceReference:z.string(),intendedInstallment:z.number().int().nullable(),original:paymentOriginal}).strict()),
  priorReturn:z.object({status:z.enum(['','no_return','return','ineligible']),sourceReference:z.string(),filedConfirmed:answer.optional(),fullYearResidentConfirmed:answer.optional(),original:identity.extend({taxYear:year,returnType:z.string(),residency:z.string(),filingStatus:z.string(),filedOn:z.string(),taxableIncome:z.string(),taxForgivenessCredit:z.string()}).strict().optional(),completedSP:completedSP.optional()}).strict(),
  priorCredit:z.object({status:z.enum(['','none','available']),sourceReference:z.string(),priorOriginalElection:identity.extend({taxYear:year,creditElected:z.string()}).strict().optional(),currentOriginalAccount:identity.extend({taxYear:year,availableCredit:z.string(),noOffsetsReversalsOrRefundsConfirmed:answer}).strict().optional()}).strict(),
 }).strict(),
 timing:z.object({kind:z.enum(['','filed','expected']),date:z.string(),asOfDate:z.string(),filingExtension:z.enum(['','none','actual_extension']),paymentExtension:z.enum(['','none','actual_extension']),returnKind:z.enum(['','original','amended']),remainingTaxPayment:z.object({status:z.enum(['','no_remaining_tax','actual_payment','expected_payment']),date:z.string().optional(),amountAppliedToTax:z.string().optional(),sourceReference:z.string(),original:paymentOriginal.optional()}).strict()}).strict(),
 useTax:z.object({status:z.enum(['','none','itemized']),sourceReference:z.string(),locality:z.enum(['','remainder_of_pa','allegheny_county','philadelphia']).optional(),classificationConfirmed:answer.optional(),purchases:z.array(z.object({sourceReference:z.string(),date:z.string(),kind:z.enum(['','goods','services']),taxableAmount:z.string(),allowableTaxPaid:z.string(),original:z.object({date:z.string(),amount:z.string(),taxPaid:z.string(),receiptNumber:z.string()}).strict()}).strict()).optional()}).strict(),
 sp:z.object({categories:z.object({'2':category,'3':category,'4':category,'5':category,'7':category,'8':category,'9':category,'10':category}).strict(),allWorldwideSourcesCompleteConfirmed:answer}).strict(),
 disposition:z.object({kind:z.enum(['','no_overpayment','allocation']),sourceReference:z.string(),refundRequested:z.string(),nextYearCreditRequested:z.string(),donations:z.array(z.object({code:z.string(),amount:z.string()}).strict())}).strict(),
}).strict();
export type PAOrdinaryReturnFacts=z.infer<typeof PAOrdinaryReturnFactsSchema>;
