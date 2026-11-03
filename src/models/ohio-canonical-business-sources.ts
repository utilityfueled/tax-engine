/** Raw actual ordinary C records; no caller computation is source authority. */
import { z } from 'zod';
import { OhioBusinessApportionmentInputSchema } from './ohio-business-apportionment.js';
const year = z.union([z.literal(2025), z.literal(2026)]);
const ref = z.string().trim().min(1);
const money = z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const OhioCanonicalBusinessSourcesSchema = z.object({
  taxYear: year, sourceReference: ref, sourceFactsConfirmed: z.literal(true),
  facts: OhioBusinessApportionmentInputSchema.shape.facts,
  receiptOriginals: z.array(z.object({
    receiptId: ref, sourceReference: ref, grossReceipt: money, ohioBenefitReceipt: money,
    purchaserBenefitSitusingConfirmed: z.literal(true), accountHolder: z.literal('primary'), sourceTaxYear: year,
    date, originalDocumentId: ref, currentUncorrectedNonvoidConfirmed: z.literal(true),
  }).strict()).min(1),
  allFederalDeductionSourcesIncludedConfirmed: z.literal(true),
  federalDeductionSources: z.array(z.object({
    deductionId: ref, accountHolder: z.literal('primary'), sourceTaxYear: year,
    deductionKind: z.literal('deductible_half_se_tax'), sourceReference: ref,
    original: z.object({ documentId: ref, documentType: z.literal('personal_federal_deduction_workpaper'),
      accountHolder: z.literal('primary'), sourceTaxYear: year, amount: money, date,
      paidOrAccrued: z.enum(['paid', 'accrued']), sourceReference: ref,
      allUnderlyingDeductionAccrualsIncludedConfirmed: z.literal(true), description: ref,
    }).strict(),
  }).strict()).min(1),
}).strict();
export type OhioCanonicalBusinessSources = z.infer<typeof OhioCanonicalBusinessSourcesSchema>;
