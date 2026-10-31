import { z } from 'zod';

/** Original Form8997 record. Spec: spec/federal/qof-deferred-gain-inclusion.yaml. */
export const QofInvestmentSourceSchema = z.object({
  sourceId: z.string().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  qofEin: z.string().optional(), description: z.string().optional(), investmentDate: z.string().optional(),
  interestType: z.string().optional(), gainCharacter: z.string().optional(),
  originalDeferredGain: z.string().optional(), remainingDeferredGain: z.string().optional(),
  event: z.string().optional(), eventDate: z.string().optional(), entireInvestment: z.boolean().optional(),
  fairMarketValue: z.string().optional(), fullyTaxableDispositionGain: z.string().optional(),
  proceeds: z.string().optional(), basisBeforeInclusion: z.string().optional(),
}).strict();
export type QofInvestmentSource = z.infer<typeof QofInvestmentSourceSchema>;
