import { z } from 'zod';
const amount = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/);
/** Actual original RRTA Box14 facts; unknown is preserved until canonical proof. */
export const RRTAPayrollSourcesSchema = z.object({
    methodVersion: z.literal('ordinary-w2-rrta-v1').optional(), sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(), allRRTASourcesIncludedConfirmed: z.boolean().optional(),
    noEmployeeRepresentativeCompensationConfirmed: z.boolean().optional(), noCorrectionsConfirmed: z.boolean().optional(), noOtherRRTATaxAdjustmentsConfirmed: z.boolean().optional(), noSelfEmploymentIncomeConfirmed: z.boolean().optional(),
    originalTaxpayer: z.unknown().optional(),
    originalTipForms: z.array(z.object({
        owner: z.enum(['primary', 'spouse']), original: z.unknown().optional()
    }).strict()).max(2).optional(),
    sources: z.array(z.object({
        sourceId: z.string().optional(), w2SourceId: z.string().optional(), owner: z.enum(['primary', 'spouse']).optional(), sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(), ordinaryBox1EqualsMedicareCompensationConfirmed: z.boolean().optional(), nonRRTAPayrollBoxesKnownZeroConfirmed: z.boolean().optional(), noRailroadTipsConfirmed: z.boolean().optional(), tier1SocialSecurityCompensation: amount.optional(), tier1MedicareCompensation: amount.optional(), additionalMedicareTaxWithheld: amount.optional(), originalW2: z.unknown().optional()
    }).strict()).max(2).optional(),
}).strict();
