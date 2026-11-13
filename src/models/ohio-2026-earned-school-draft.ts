/** Spec: state/oh-2026-earned-school-draft.yaml. No new canonical defaults. */
import {z} from 'zod';
import {Ohio2026OrdinarySourcesSchema} from './ohio-2026-return-draft.js';
import {Ohio2026SchoolSourcesSchema} from './ohio-2026-school-sources.js';
import {OhioSchoolDistrictFactsSchema} from './ohio-school-district.js';
export const Ohio2026EarnedSchoolDraftSourcesSchema=Ohio2026OrdinarySourcesSchema.omit({noTaxingSchoolDistrictResidencyConfirmed:true}).extend({
 methodId:z.literal('oh-2026-earned-school-employee-draft-v1'),schoolSources:Ohio2026SchoolSourcesSchema,
 schoolPaymentSources:z.object({taxYear:z.literal(2026),sourceReference:z.string().trim().min(1),sourceFactsConfirmed:z.literal(true),
 originalTaxInput:z.record(z.string(),z.unknown()),originalSchoolSources:z.record(z.string(),z.unknown()),
 owner:Ohio2026SchoolSourcesSchema.shape.owner,districtCode:z.string().regex(/^\d{4}$/),
 roundingElection:z.literal('whole_dollars'),roundingElectionConfirmed:z.literal(true),payments:OhioSchoolDistrictFactsSchema.shape.payments}).strict(),
}).strict();
export type Ohio2026EarnedSchoolDraftSources = z.infer<typeof Ohio2026EarnedSchoolDraftSourcesSchema>;
