import { z } from 'zod';

const amount = z.string().regex(/^\d+(\.\d{1,2})?$/).optional();
const text = z.string().optional();
const fact = z.boolean().optional();
const owner = z.enum(['primary', 'spouse']).optional();

/** Draft source facts preserve missing answers. Calculation requires complete originals. */
export const RoyaltyPropertySourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: text, sourceFactsConfirmed: fact,
  allDirectRoyaltySourcesIncluded: fact,
  properties: z.array(z.object({
    propertyId: text, propertyReference: text, accountHolder: owner,
    propertyType: z.enum(['copyright', 'patent', 'nil-rights', 'nonoperating-mineral']).optional(),
    tradeOrBusiness: fact, operatingInterest: fact, capitalDisposition: fact, foreignSource: fact,
    communityPropertyAllocationRequired: fact, cashMethod: fact, sameRegularAmtTreatmentConfirmed: fact,
    currentYearExpensesComplete: fact,
    interestExpense: amount, depreciationExpense: amount, depletionExpense: amount, otherExpenses: amount,
    priorUnallowedExpenses: amount,
    incomeSources: z.array(z.object({
      sourceIndex: z.number().int().nonnegative().optional(), allocatedGross: amount,
      original: z.object({
        sourceId: text, accountReference: text, taxYear: z.number().int().optional(),
        sourceFormRevision: z.enum(['2025-04', '2026-12']).optional(), payer: text, accountHolder: owner, royalties: amount,
      }).optional(),
    })).optional(),
    expenses: z.array(z.object({
      sourceId: text, sourceReference: text, paidDate: text, amountPaid: amount,
      category: z.enum(['commissions', 'insurance', 'legal-professional', 'management-fees', 'property-production-taxes']).optional(),
      ordinaryNecessaryForProperty: fact, relatesOnlyToCurrentYear: fact,
      capitalOrImprovement: fact, personalOrOwnLabor: fact, reimbursed: fact,
    })).optional(),
  })).optional(),
});
export type RoyaltyPropertySources = z.infer<typeof RoyaltyPropertySourcesSchema>;
