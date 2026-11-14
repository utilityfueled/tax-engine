import { z } from 'zod';
const amount = z.string().regex(/^\d+(\.\d+)?$/);
const source = { sourceReference:z.string().optional(), sourceFactsConfirmed:z.boolean().optional() };
const originals = z.object({ receipts:z.record(z.string(),amount).optional(),expenses:z.record(z.string(),amount).optional() }).strict();
/** Original facts only. Missing ledger boxes and election facts remain unknown. */
export const Form172FarmingSourcesSchema = z.object({
 ...source,sourceTaxYear:z.number().int().optional(),accountHolder:z.enum(['primary','spouse']).optional(),farmerName:z.string().optional(),
 farmerSsnLast4:z.string().optional(),principalCropOrActivity:z.string().optional(),activityCode:z.string().optional(),ein:z.string().optional(),
 cashMethodConfirmed:z.boolean().optional(),raisedProductsOnlyConfirmed:z.boolean().optional(),domesticForProfitFarmConfirmed:z.boolean().optional(),
 allCurrentYearFarmSourcesIncluded:z.boolean().optional(),materiallyParticipatedConfirmed:z.boolean().optional(),allInvestmentAtRiskConfirmed:z.boolean().optional(),
 priorAtRiskSuspensionsKnownEmptyConfirmed:z.boolean().optional(),priorPassiveSuspensionsKnownEmptyConfirmed:z.boolean().optional(),
 seedsPaidAndUsedDuringYearConfirmed:z.boolean().optional(),noPrepaidFarmSuppliesConfirmed:z.boolean().optional(),
 section464LimitationNotApplicableConfirmed:z.boolean().optional(),notTaxShelterConfirmed:z.boolean().optional(),
 noSection263ACapitalizationRequiredConfirmed:z.boolean().optional(),noFarmAccountingOrBasisElectionsConfirmed:z.boolean().optional(),
 noCapitalOrPreproductiveCostsConfirmed:z.boolean().optional(),deductibleSeedsAfterAllFarmLimitationsConfirmed:z.boolean().optional(),
 noOtherFarmIncomeOrDeductionsConfirmed:z.boolean().optional(),noOtherBusinessSourcesConfirmed:z.boolean().optional(),originals:originals.optional(),
 alternativeTax:z.object({...source,sameBasisAndLossLimitationsConfirmed:z.boolean().optional(),allAlternativeAdjustmentsIncludedConfirmed:z.boolean().optional(),originals:originals.optional()}).strict().optional(),
 waiver:z.object({...source,originalReturnReference:z.string().optional(),returnFiledDate:z.iso.date().optional(),statementExecutedDate:z.iso.date().optional(),
  statementAttachedToOriginalReturnConfirmed:z.boolean().optional(),entireCarrybackPeriodWaivedConfirmed:z.boolean().optional(),irrevocableElectionConfirmed:z.boolean().optional(),
  originalTimelyReturnConfirmed:z.boolean().optional(),extensionUsed:z.boolean().optional(),amendedReturn:z.boolean().optional()}).strict().optional(),
}).strict();
export type Form172FarmingSources = z.infer<typeof Form172FarmingSourcesSchema>;
