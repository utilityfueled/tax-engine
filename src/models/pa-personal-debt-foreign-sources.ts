/** Actual private PA evidence. Blank answers/year/references remain unknown. No input defaults. */
import {z} from 'zod';
const answer=z.boolean().nullable();
const header={originalIndex:z.number().int().nullable(),sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 owner:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict(),
 // Immutable current canonical document, never a generic factual entry interface.
 original:z.record(z.string(),z.unknown())};
export const PAPersonalDebtDischargeSourceSchema=z.object({...header,
 statement:z.object({statementId:z.string(),creditorTin:z.string(),accountReference:z.string(),dischargedOn:z.string(),eventCode:z.string(),originalTaxYear:z.number().int().nullable(),sourceReference:z.string(),principalCancelled:z.string(),interestCancelled:z.string(),feesCancelled:z.string()}).strict(),
 qualification:z.object({useSourceReference:z.string(),legalSourceReference:z.string(),deductionSourceReference:z.string(),relationshipSourceReference:z.string(),propertySourceReference:z.string(),
  // Actual no-collateral proof; absent/null remains unknown, never a default.
  noCollateralOfAnyKindConfirmed:answer.optional(),
  legallyDischargedConfirmed:answer,noResidualGuarantyPaymentConfirmed:answer,allCancelledChargesIncludedConfirmed:answer,purelyPersonalLivingUseConfirmed:answer,noBusinessRentalInvestmentUseOrSecurityConfirmed:answer,noCurrentOrPriorPADeductionOffsetOrBasisConfirmed:answer,noEmploymentOrServiceConsiderationConfirmed:answer,noPropertyTransferConfirmed:answer,noCashPropertyOrNewBorrowingAtDischargeConfirmed:answer}).strict(),
}).strict();
export const PAForeignBankTaxSourceSchema=z.object({...header,
 originalTaxYear:z.number().int().nullable(),foreignCountry:z.string(),jurisdictionKind:z.enum(['','foreign_country']),ordinaryPersonalInterestOnlyConfirmed:answer,allForeignTaxReceiptsIncludedConfirmed:answer,
 payments:z.array(z.object({sourceReference:z.string(),receiptNumber:z.string(),paidOn:z.string(),currency:z.enum(['','USD']),amount:z.string(),country:z.string()}).strict()),
}).strict();
export const PAPersonalDebtAndForeignBankSourcesSchema=z.object({personalDebtDischarges:z.array(PAPersonalDebtDischargeSourceSchema).optional(),foreignBankTaxSources:z.array(PAForeignBankTaxSourceSchema).optional()}).strict();
export type PAPersonalDebtDischargeSource=z.infer<typeof PAPersonalDebtDischargeSourceSchema>;
export type PAForeignBankTaxSource=z.infer<typeof PAForeignBankTaxSourceSchema>;
