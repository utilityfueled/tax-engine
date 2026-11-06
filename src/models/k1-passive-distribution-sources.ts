import { z } from 'zod';
const money=z.string().regex(/^\d+(\.\d+)?$/).optional();
/** Original entity valuation and activity records, not a gain/allocation override. */
export const K1PassiveDistributionSourcesSchema=z.object({
  sourceTaxYear:z.number().int().optional(),sourceReference:z.string().optional(),sourceFactsConfirmed:z.boolean().optional(),
  activityName:z.string().optional(),allActivitiesAndAssetsIncludedConfirmed:z.boolean().optional(),continuingActivityConfirmed:z.boolean().optional(),
  noMaterialParticipationTestMetConfirmed:z.boolean().optional(),combinedParticipationHours:money,
  noTieredOrSpecialAllocationConfirmed:z.boolean().optional(),
  entitySelectedValuationDate:z.enum(['year_start','distribution_date']).optional(),valuationDate:z.string().optional(),
  allPreDistributionEventsIncludedConfirmed:z.boolean().optional(),
  beginningHolderInterestValue:money,appreciatedContributionsFmv:money,depreciatedContributionsBasis:money,
  /** One complete annual aggregate per actual entity activity. Values for the
   *10-percent event test are the entity's beginning-year activity/property values. */
  activityEvents:z.array(z.object({sourceId:z.string().optional(),sourceReference:z.string().optional(),activityName:z.string().optional(),
    beginningActivityValue:money,activityInterestDisposedValue:money,beginningPropertyValue:money,propertyDisposedValue:money,
  }).strict()).optional(),
  /** Actual holder-allocable FMV and unadjusted basis shares from the original
   * entity valuation report; the holder's743(b) adjustment is separately retained.
   * A complete single-activity cohort fixes the allocation without a user ratio. */
  assets:z.array(z.object({sourceId:z.string().optional(),sourceReference:z.string().optional(),
    character:z.enum(['ordinary_business_property','business_cash','portfolio','rental','oil_gas','licensed_intangible','other']).optional(),
    fairMarketValue:money,adjustedBasis:money,ownerBasisAdjustment:z.string().regex(/^-?\d+(\.\d+)?$/).optional(),
    acquiredDate:z.string().optional(),continuousPassiveUseConfirmed:z.boolean().optional(),
    noNonpassiveRecharacterizationConfirmed:z.boolean().optional(),noRecaptureOrSpecialCapitalGainConfirmed:z.boolean().optional(),
  }).strict()).optional(),
}).strict();
export type K1PassiveDistributionSources=z.infer<typeof K1PassiveDistributionSourcesSchema>;
