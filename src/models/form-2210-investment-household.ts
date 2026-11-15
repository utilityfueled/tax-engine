/** Finite source originals, not filing-status or ownership defaults. Spec: form-2210-investment-household.yaml. */
import {z} from 'zod';
const identity=z.object({firstName:z.string().optional(),lastName:z.string().optional(),ssn:z.string().optional()}).strict();
const domicile=z.object({state:z.string().optional(),startDate:z.string().optional(),endDate:z.string().optional(),sourceReference:z.string().optional()}).strict();
export const Form2210InvestmentHouseholdSchema=z.object({
 sourceTaxYear:z.number().int().optional(),sourceReference:z.string().optional(),sourceFactsConfirmed:z.boolean().optional(),
 jointReturnConfirmed:z.boolean().optional(),marriedAtYearEndConfirmed:z.boolean().optional(),bothSpousesAliveAllYearConfirmed:z.boolean().optional(),bothSpousesUsResidentsAllYearConfirmed:z.boolean().optional(),marriageSourceReference:z.string().optional(),
 primary:identity.optional(),spouse:identity.optional(),primaryDomicile:domicile.optional(),spouseDomicile:domicile.optional(),
 spouseInvestmentIncome:z.string().optional(),spouseInvestmentInterestExpense:z.string().optional(),spousePriorDisallowedInterest:z.string().optional(),spouseOtherInvestmentExpenses:z.string().optional(),
 spouseInvestmentSourcesNoneConfirmed:z.boolean().optional(),spouseSourceReference:z.string().optional(),allInvestmentSourcesIncludedConfirmed:z.boolean().optional(),
 primarySoleInvestmentOwnershipConfirmed:z.boolean().optional(),propertyNeverCommunityOwnedConfirmed:z.boolean().optional(),ownershipSourceReference:z.string().optional(),
 dividendSources:z.array(z.object({recipient:identity.optional(),sourceIndex:z.number().int().nonnegative().optional(),sourceTaxYear:z.number().int().optional(),sourceReference:z.string().optional(),payerName:z.string().optional(),payerTin:z.string().optional(),accountReference:z.string().optional(),accountHolder:z.enum(['primary','spouse']).optional(),ordinaryDividends:z.string().optional(),qualifiedDividends:z.string().optional(),totalCapitalGainDistributions:z.string().optional(),otherReportedAmountsZeroConfirmed:z.boolean().optional()}).strict()).optional(),
}).strict();
