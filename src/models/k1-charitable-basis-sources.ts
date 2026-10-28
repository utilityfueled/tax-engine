import { z } from 'zod';
const amount = z.string().regex(/^\d+(\.\d+)?$/).optional();
const Section170AdmissionSourcesSchema = z.object({
    sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    records: z.array(z.object({
        taxYear: z.number().int().optional(), basisWorksheetReference: z.string().optional(), charitableWorksheetReference: z.string().optional(),
        recipientName: z.string().optional(), recipientTaxpayerIdLast4: z.string().optional(),
        entityEIN: z.string().optional(), entityType: z.enum(['partnership', 's_corporation']).optional(),
        regularCarryoverSourceIds: z.array(z.string()).optional(), alternativeCarryoverSourceIds: z.array(z.string()).optional(),
    })).optional(),
});
const category = z.enum(['cash_60', 'capital_gain_30', 'capital_gain_20']).optional();
/** Original source evidence only; not a return input or an allowed-deduction override. */
export const K1CharitableBasisSourcesSchema = z.object({
    sourceTaxYear: z.number().int().optional(), statementYearStart: z.string().optional(), statementYearEnd: z.string().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    entityName: z.string().optional(), entityEIN: z.string().optional(), entityType: z.enum(['partnership', 's_corporation']).optional(),
    accountHolder: z.enum(['primary', 'spouse']).optional(), recipientName: z.string().optional(), recipientTaxpayerIdLast4: z.string().optional(),
    basisFactsConfirmed: z.boolean().optional(), noOtherBasisChangesConfirmed: z.boolean().optional(),
    cashDistributionsOnlyConfirmed: z.boolean().optional(), priorBasisHistoryComplete: z.boolean().optional(),
    currentContributions: z.array(z.object({
        sourceId: z.string().optional(), category, contributionDate: z.string().optional(),
        contributionShare: amount, adjustedBasisShare: amount, sourceReference: z.string().optional(),
    })).optional(),
    priorBasisSuspensions: z.array(z.object({
        sourceId: z.string().optional(), originTaxYear: z.number().int().optional(), category,
        contributionShare: amount, adjustedBasisShare: amount, appreciationPreviouslyTakenIntoAccount: amount,
        sourceReference: z.string().optional(),
        section170AdmissionSources: Section170AdmissionSourcesSchema.optional(),
        basisUseHistory: z.array(z.object({ taxYear: z.number().int().optional(), basisAllowed: amount })).optional(),
    })).optional(),
});
export type K1CharitableBasisSources = z.infer<typeof K1CharitableBasisSourcesSchema>;
