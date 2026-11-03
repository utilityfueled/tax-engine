/** Actual Ohio domicile and IT NRC source facts. No address or day-ratio defaults. */
import { z } from 'zod';
import { OhioCanonicalBusinessSourcesSchema } from './ohio-canonical-business-sources.js';
export const ohioNrcCategories = ['wages', 'capitalGains', 'rentsRoyalties', 'gambling', 'interestDividends', 'pensions', 'unemployment', 'otherIncome', 'federalAdjustments'] as const;
export type OhioNrcCategory = typeof ohioNrcCategories[number];
const money = z.string().trim().min(1).regex(/^-?\d+(?:\.\d+)?$/);
const ref = z.string().trim().min(1);
const amount = z.object({ federalAmount: money, residentAmount: money, nonresidentOhioAmount: money, sourceReference: ref }).strict();
const adjustment = z.object({ line: z.string().regex(/^\d+$/), fullAmount: money, ohioAmount: money, sourceReference: ref }).strict();
const amounts = z.object({ wages: amount, capitalGains: amount, rentsRoyalties: amount, gambling: amount, interestDividends: amount, pensions: amount, unemployment: amount, otherIncome: amount, federalAdjustments: amount }).strict();
export const OhioResidencyFactsSchema = z.object({
    taxYear: z.number().int().min(2025).max(2026), sourceReference: ref, sourceFactsConfirmed: z.literal(true),
    allFederalSourcesIncludedConfirmed: z.boolean().optional(), noBusinessIncomeConfirmed: z.boolean().optional(),
    schoolDistrictStatus: z.enum(['no_ohio_taxing_district_residency', 'actual_district_sources_required']),
    businessSources: OhioCanonicalBusinessSourcesSchema.optional(),
    originalFederalSources: z.record(z.string(), z.unknown()).optional(),
    owners: z.array(z.object({ accountHolder: z.enum(['primary', 'spouse']), status: z.enum(['full_year_resident', 'part_year_resident', 'nonresident']), sourceReference: ref,
        periods: z.array(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), domicileState: z.string().regex(/^[A-Z]{2}$/) }).strict()).min(1),
        amounts: amounts.optional(), stateAdditions: z.array(adjustment).optional(), stateDeductions: z.array(adjustment).optional()
    }).strict()).min(1).max(2)
}).strict();
export type OhioResidencyFacts = z.infer<typeof OhioResidencyFactsSchema>;
