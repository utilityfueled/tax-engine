import { z } from 'zod';
/** Original cash/holding/character facts only. There is no calculated gain field. */
export const K1CashDistributionSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  originalBox: z.enum(['16', '19']).optional(), originalCode: z.enum(['A', 'D']).optional(),
  cashAmount: z.string().regex(/^\d+(\.\d+)?$/).optional(), distributionDate: z.string().optional(), acquisitionDate: z.string().optional(),
  acquisitionMethod: z.enum(['cash_purchase', 'original_cash_contribution', 'other']).optional(),
  singleUnchangedBlockConfirmed: z.boolean().optional(), uniformPerShareBasisConfirmed: z.boolean().optional(),
  allAnnualDistributionsIncludedConfirmed: z.boolean().optional(), cashOnlyConfirmed: z.boolean().optional(),
  nonliquidatingConfirmed: z.boolean().optional(), noOtherReportingConfirmed: z.boolean().optional(),
  noSpecialHoldingOrGainElectionConfirmed: z.boolean().optional(), allIncomePrecedesDistributionConfirmed: z.boolean().optional(),
  activityCharacter: z.enum(['portfolio_investments_only', 'single_passive_business', 'single_nonpassive_business', 'mixed_or_other']).optional(),
  /** Actual owner has U.S. citizen/resident treatment throughout this source year
   * and relevant holding period (including an effective resident election),
   * without foreign/treaty treatment that changes this ordinary method. */
  usIndividualTaxTreatmentConfirmed: z.boolean().optional(),
  sameSingleAtRiskActivityConfirmed: z.boolean().optional(), atRiskSourceReference: z.string().optional(), atRiskGainItemSourceReference: z.string().optional(),
  noHotAssetExchangeConfirmed: z.boolean().optional(), noDisguisedSaleOrDebtPaymentConfirmed: z.boolean().optional(),
  noRetirementOrSuccessorPaymentConfirmed: z.boolean().optional(), noMarketableSecuritiesOrLiabilityMoneyConfirmed: z.boolean().optional(),
  notApplicablePartnershipInterestConfirmed: z.boolean().optional(),
  noAccumulatedEarningsAndProfitsConfirmed: z.boolean().optional(), noRedemptionOrDebtRepaymentConfirmed: z.boolean().optional(),
}).strict();
export type K1CashDistributionSources = z.infer<typeof K1CashDistributionSourcesSchema>;
