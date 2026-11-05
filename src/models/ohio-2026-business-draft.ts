/** Spec: spec/state/oh-2026-business-draft.yaml. Documentary scope, no scalar tax overrides. */
import { z } from 'zod';
import { OhioResidencyFactsSchema } from './ohio-residency.js';
export const Ohio2026BusinessDraftSourcesSchema = z.object({
  methodId: z.literal('oh-2026-canonical-business-draft-v1'), taxYear: z.literal(2026),
  sourceReference: z.string().trim().min(1), sourceFactsConfirmed: z.literal(true),
  originalFederalSources: z.record(z.string(), z.unknown()), residencyFacts: OhioResidencyFactsSchema,
  noOtherOhioIncomeAdjustmentsConfirmed: z.literal(true),
  noQualifyingCapitalGainsOrPayrollDeductionConfirmed: z.literal(true),
  noOtherOhioCreditSourcesConfirmed: z.literal(true), noQualifyingEitcChildrenConfirmed: z.literal(true),
}).strict();
export type Ohio2026BusinessDraftSources = z.infer<typeof Ohio2026BusinessDraftSourcesSchema>;
