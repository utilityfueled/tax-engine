/** Actual original documents for the finite 2026 prepaid method; no inferred facts. */
import { z } from 'zod';
import Decimal from 'decimal.js';
const text = z.string().refine(value => value.trim().length > 0, 'Actual source text is required');
const cents = z.string().regex(/^\d+(?:\.\d{1,2})?$/, 'Actual nonnegative premium dollars and cents are required')
  .refine(value => new Decimal(value).isFinite(), 'Premium must be finite');
export const MortgageInsurancePrepaidSourcesSchema = z.object({
  method: z.literal('current-original-prepaid'),
  sourceTaxYear: z.literal(2026), sourceReference: text,
  sourceFactsConfirmed: z.literal(true), allPremiumsIncluded: z.literal(true),
  form1098SourceId: text, mortgageLoanSourceId: text, lenderName: text, loanAccountReference: text,
  payer: z.literal('primary'), provider: z.enum(['private', 'fha']), privateInsuranceMeetsHpaDefinition: z.boolean().optional(),
  premiumAllocableBeyondYearEnd: z.literal(true),
  prepaidPremiumPaid: cents, paymentMethod: z.enum(['cash', 'financed']),
  paidDate: text, insuranceObtainedDate: text, statedTermMonths: z.number().int().positive().refine(Number.isSafeInteger),
  mortgageOutstandingAtYearEnd: z.literal(true), mortgageSatisfiedDate: z.null(),
  refinanced: z.literal(false), premiumsRefunded: z.literal(false), insuranceCancelled: z.literal(false),
  otherBorrowerPayments: z.literal(false), rentalOrBusinessUse: z.literal(false), otherPremiumPayments: z.literal(false),
}).strict().superRefine((source, context) => {
  if (source.provider === 'private' && source.privateInsuranceMeetsHpaDefinition !== true) {
    context.addIssue({ code: 'custom', path: ['privateInsuranceMeetsHpaDefinition'], message: 'Actual qualifying private insurance determination is required' });
  }
  if (source.provider === 'fha' && source.privateInsuranceMeetsHpaDefinition !== undefined) {
    context.addIssue({ code: 'custom', path: ['privateInsuranceMeetsHpaDefinition'], message: 'A private insurance determination conflicts with the FHA method' });
  }
});
export type MortgageInsurancePrepaidSources = z.infer<typeof MortgageInsurancePrepaidSourcesSchema>;
