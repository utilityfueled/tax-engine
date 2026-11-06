/** Spec: state/oh-2026-school-sources.yaml. Independent school originals, no payment defaults. */
import { z } from 'zod';
import { TaxpayerSchema } from './inputs.js';
import { Ohio2026OrdinarySourcesSchema } from './ohio-2026-return-draft.js';
const ref = z.string().trim().min(1), date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/), code = z.string().regex(/^\d{4}$/);
const address = z.object({ street: ref, apt: z.string().optional(), city: ref, state: z.literal('OH'), zip: z.string().regex(/^\d{5}(?:-\d{4})?$/) }).strict();
export const Ohio2026SchoolSourcesSchema = z.object({
    taxYear: z.literal(2026), sourceReference: ref, sourceFactsConfirmed: z.literal(true), originalTaxInput: z.record(z.string(), z.unknown()),
    owner: z.object({ accountHolder: z.literal('primary'), originalTaxpayer: TaxpayerSchema.shape.primary.strict() }).strict(),
    residence: z.object({ sourceReference: ref, originalAddress: address, from: date, through: date, districtCode: code,
        finder: z.object({ sourceReference: ref, taxYear: z.literal(2026), lookupDate: date, originalAddress: address, districtCode: code, districtName: ref,
            taxBase: z.enum(['earned', 'traditional']), rate: z.string().regex(/^0\.\d{4}$/), officialResultMatchedConfirmed: z.literal(true) }).strict() }).strict(),
    income: z.object({ allIncomeOriginalsIncludedConfirmed: z.literal(true), noOtherIncomeOrAdjustmentsConfirmed: z.literal(true),
        noSelfEmploymentConfirmed: z.literal(true), noSpecialCompensationConfirmed: z.literal(true) }).strict(),
    employmentOriginals: Ohio2026OrdinarySourcesSchema.shape.employmentOriginals,
    w2Sources: z.array(z.object({ w2Index: z.number().int().nonnegative(), sourceReference: ref, box14SchoolDistrictReporting: z.literal('none'),
        localRows: z.array(z.object({ printedRow: z.number().int().min(1).max(2), sourceReference: ref, classification: z.literal('school_district'), districtCode: code }).strict()).max(1) }).strict()).min(1).max(20),
}).strict();
export type Ohio2026SchoolSources = z.infer<typeof Ohio2026SchoolSourcesSchema>;
