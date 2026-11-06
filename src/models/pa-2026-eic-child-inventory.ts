/** Spec: state/pa-2026-childless-eic-dependency.yaml. Unknowns are never childless facts. */
import {z} from 'zod';
export const PA2026EicChildInventorySchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:z.boolean().nullable(),
 allPotentialQualifyingChildrenReviewedConfirmed:z.boolean().nullable(),noQualifyingEitcChildrenConfirmed:z.boolean().nullable(),
 candidateChildren:z.array(z.record(z.string(),z.unknown())),
 owner:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict(),
 originalFederalSources:z.record(z.string(),z.unknown()),originalPAResidencySources:z.record(z.string(),z.unknown()),capturedReview:z.record(z.string(),z.unknown()),
}).strict();
export type PA2026EicChildInventory=z.infer<typeof PA2026EicChildInventorySchema>;
