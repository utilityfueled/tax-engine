import { z } from 'zod';

const amount = z.string().regex(/^\d+(\.\d+)?$/).optional();
export const CodAttributeKindSchema = z.enum(['general_business_credit', 'minimum_tax_credit', 'capital_loss', 'passive_loss', 'passive_credit', 'foreign_tax_credit']);
const property = z.object({
  propertyId: z.string().optional(), description: z.string().optional(), adjustedBasis: amount,
  category: z.enum(['other_business', 'inventory', 'personal']).optional(),
  acquiredDate: z.string().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  securedDischargedDebt: z.boolean().optional(), priorSnapshotChangeReference: z.string().optional(),
});
export const CodAttributeLedgerSourcesSchema = z.object({
  sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(), allAttributesIncluded: z.boolean().optional(),
  records: z.array(z.object({
    sourceId: z.string().optional(), kind: CodAttributeKindSchema.optional(), originTaxYear: z.number().int().optional(),
    originalAmount: amount,
    originalAmountMeaning: z.enum(['original_year_closing_carry', 'current_year_before_use']).optional(),
    sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    allHistoryIncluded: z.boolean().optional(),
    history: z.array(z.object({ taxYear: z.number().int().optional(), used: amount, reduced: amount, expired: amount, sourceReference: z.string().optional() })).optional(),
    currentYearUse: amount, currentYearCarryback: amount, currentYearExpired: amount, currentYearUseSourceReference: z.string().optional(),
    term: z.enum(['short', 'long']).optional(), activityName: z.string().optional(), creditKind: z.string().optional(),
    foreignCategory: z.enum(['general', 'passive']).optional(),
  })).optional(),
  property: z.object({
    immediatelyAfter: z.object({
      asOfDate: z.string().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
      allPropertyAndMoneyIncluded: z.boolean().optional(), allLiabilitiesIncluded: z.boolean().optional(), money: amount,
      properties: z.array(property).optional(),
      liabilities: z.array(z.object({ sourceId: z.string().optional(), amount, sourceReference: z.string().optional() })).optional(),
    }).optional(),
    followingYear: z.object({
      asOfDate: z.string().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
      allPropertyIncluded: z.boolean().optional(), properties: z.array(property).optional(),
      dispositions: z.array(z.object({ propertyId: z.string().optional(), disposedDate: z.string().optional(),
        sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional() })).optional(),
    }).optional(),
  }).optional(),
});
/** Original after-tax worksheets and two independent property snapshots; no calculated reduction input. */
export const Form982AttributeSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allAttributesIncluded: z.boolean().optional(), accountHolder: z.enum(['primary', 'spouse']).optional(),
  taxpayerName: z.string().optional(), taxpayerIdLast4: z.string().optional(), dischargeDate: z.string().optional(),
  currentMinimumTaxCredit: z.object({
    sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    allCurrentAdjustmentSourcesIncluded: z.boolean().optional(), noAdditionalDeferralItemsConfirmed: z.boolean().optional(),
  }).optional(),
  regular: CodAttributeLedgerSourcesSchema.optional(), alternativeTax: CodAttributeLedgerSourcesSchema.optional(),
});
export type CodAttributeKind = z.infer<typeof CodAttributeKindSchema>;
export type CodAttributeLedgerSources = z.infer<typeof CodAttributeLedgerSourcesSchema>;
export type Form982AttributeSources = z.infer<typeof Form982AttributeSourcesSchema>;
