/** Private current-original eligible retirement proof; no inferred answers. */
import {z}from 'zod';
const answer=z.boolean().nullable(),reference=z.object({sourceReference:z.string()}).strict();
const identity=z.object({firstName:z.string(),lastName:z.string(),ssn:z.string(),dateOfBirth:z.string()}).strict();
export const PARetirementSourcesSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 allOriginalRetirementStatementsIncludedConfirmed:answer,
 owner:z.object({accountHolder:z.enum(['','primary','spouse']),originalTaxpayer:identity.optional()}).strict(),
 statements:z.array(z.object({sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
  owner:identity,originalIndex:z.number().int().nullable(),original:z.record(z.string(),z.unknown()).optional(),
  qualification:z.object({planType:z.enum(['','employer_401a_defined_contribution']),planSource:reference,
   formerEmployer:z.object({name:z.string(),ein:z.string(),sourceReference:z.string()}).strict(),administrator:reference,
   normalRetirementAge:z.number().int().nullable(),actualRetirementDate:z.string(),distributionDate:z.string(),
   eligiblePlanConfirmed:answer,writtenPlanConfirmed:answer,separationOldAgeLongServiceBenefitsConfirmed:answer,
   recurringOrLumpSumRetirementBenefitConfirmed:answer,recurringLifetimePaymentsAvailableConfirmed:answer,noPreretirementDistributionsExceptPermittedContributionsOrDisabilityConfirmed:answer,
   retirementAgeAndServiceConditionsMetConfirmed:answer,allEmployeeContributionsKnownConfirmed:answer,
   paEmployeeContributions:z.string(),priorRecoveredContributions:z.string(),noRolloverOrConversionConfirmed:answer,
   noAnnuityInsuranceOrInvestmentContractConfirmed:answer,noDeathDisabilityOrSurvivorBenefitConfirmed:answer,
   noESOPKSOPOrExcessContributionConfirmed:answer,allOriginalBoxesKnownConfirmed:answer,currentUncorrectedNonvoidOriginalConfirmed:answer,
   formerEmployerDistinctFromCurrentEmploymentConfirmed:answer,noReturnToServiceWithSponsoringEmployerConfirmed:answer,
   noEarlyRetirementIncentiveConfirmed:answer,noSelfEmploymentOrPartnerPlanConfirmed:answer,
  }).strict(),
  withholding:z.object({state:z.string(),amount:z.string(),actuallyWithheldConfirmed:answer,
   notRefundedTransferredOrCreditedElsewhereConfirmed:answer,sourceReference:z.string()}).strict(),
 }).strict()),
}).strict();
export type PARetirementSources=z.infer<typeof PARetirementSourcesSchema>;
